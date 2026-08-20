import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLaunch } = vi.hoisted(() => ({ mockLaunch: vi.fn() }));
vi.mock('playwright', () => ({ chromium: { launch: mockLaunch } }));

const { mockFetchAppqToolDefs, mockCreateGatedAppqDispatcher, mockRunWorkflow } = vi.hoisted(() => ({
  mockFetchAppqToolDefs: vi.fn(),
  mockCreateGatedAppqDispatcher: vi.fn(),
  mockRunWorkflow: vi.fn(),
}));
vi.mock('@appliqation/agent-core', async (importOriginal) => {
  // createReadOnlyProjectContextDispatcher comes through as the real
  // implementation — this suite verifies actual gating behavior (write
  // refused before reaching the real appq dispatcher), not just that some
  // function was called.
  const actual = await importOriginal<typeof import('@appliqation/agent-core')>();
  return {
    ...actual,
    fetchAppqToolDefs: mockFetchAppqToolDefs,
    createGatedAppqDispatcher: mockCreateGatedAppqDispatcher,
    runWorkflow: mockRunWorkflow,
  };
});

import { explore } from './explore.js';
import type { McpClient, ProviderAdapter, RunBudget } from '@appliqation/agent-core';

function fakePage() {
  return { on: vi.fn(), goto: vi.fn().mockResolvedValue(undefined), ariaSnapshot: vi.fn().mockResolvedValue('') };
}

function fakeClient(): McpClient {
  return {
    fetchPrompt: vi.fn(),
    startWorkflow: vi.fn(),
    callTool: vi.fn(),
    listTools: vi.fn(),
    uploadScreenshot: vi.fn(),
  };
}

const budget: RunBudget = { maxCalls: 150, maxPages: 40, maxMillis: 1_500_000, maxTurns: 80 };

function baseOpts() {
  return {
    client: fakeClient(),
    adapter: { complete: vi.fn() } as ProviderAdapter,
    prompt: 'Explore the signup flow like a senior QA lead.',
    maxSteps: 50,
    maxPages: 12,
    maxMinutes: 15,
    budget,
  };
}

describe('explore', () => {
  beforeEach(() => {
    const browser = { close: vi.fn().mockResolvedValue(undefined), newPage: vi.fn().mockResolvedValue(fakePage()) };
    mockLaunch.mockReset().mockResolvedValue(browser);
    mockFetchAppqToolDefs.mockReset().mockResolvedValue([{ name: 'get_scenario', description: 'x', inputSchema: {} }]);
    mockCreateGatedAppqDispatcher.mockReset().mockReturnValue(vi.fn().mockResolvedValue({ ok: true, text: 'appq result' }));
    mockRunWorkflow.mockReset().mockResolvedValue({ report: 'done', turns: 3, budgetExceeded: false });
  });

  it('calls runWorkflow against appq:runman, always headless (interactive: "false")', async () => {
    await explore(baseOpts());
    expect(mockRunWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        source: {
          kind: 'appq',
          name: 'appq:runman',
          args: {
            prompt: 'Explore the signup flow like a senior QA lead.',
            interactive: 'false',
            max_steps: 50,
            max_pages: 12,
            max_minutes: 15,
          },
        },
      }),
    );
  });

  it('includes project_id/site_url in the prompt args only when given', async () => {
    await explore({ ...baseOpts(), projectId: 1349, siteUrl: 'https://stage.example.com' });
    const call = mockRunWorkflow.mock.calls[0][0];
    expect(call.source.args.project_id).toBe(1349);
    expect(call.source.args.site_url).toBe('https://stage.example.com');
  });

  it('omits project_id/site_url entirely when not given, not as undefined/empty values', async () => {
    await explore(baseOpts());
    const call = mockRunWorkflow.mock.calls[0][0];
    expect(call.source.args).not.toHaveProperty('project_id');
    expect(call.source.args).not.toHaveProperty('site_url');
  });

  it('interactive is always "false", even if a caller tried to imply otherwise via extra options', async () => {
    await explore({ ...baseOpts(), projectId: 1349 });
    const call = mockRunWorkflow.mock.calls[0][0];
    expect(call.source.args.interactive).toBe('false');
  });

  it('offers both browser tool defs and the read-only appq tool defs to the model', async () => {
    await explore(baseOpts());
    const call = mockRunWorkflow.mock.calls[0][0];
    const toolNames = call.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toEqual(expect.arrayContaining(['browser_navigate', 'browser_snapshot', 'get_scenario']));
  });

  it('routes browser_-prefixed dispatches to the browser tools, everything else to the gated appq dispatcher', async () => {
    await explore(baseOpts());
    const dispatch = mockRunWorkflow.mock.calls[0][0].dispatch;

    await dispatch('browser_snapshot', {});
    const gatedFn = mockCreateGatedAppqDispatcher.mock.results[0].value;
    await dispatch('get_scenario', { scenario_id: 2424 });
    expect(gatedFn).toHaveBeenCalledWith('get_scenario', { scenario_id: 2424 });
  });

  it('lets an enrich_project_context action=read call reach the real gated appq dispatcher', async () => {
    const gatedInner = vi.fn().mockResolvedValue({ ok: true, text: 'project context' });
    mockCreateGatedAppqDispatcher.mockReturnValue(gatedInner);
    await explore(baseOpts());
    const dispatch = mockRunWorkflow.mock.calls[0][0].dispatch;

    const result = await dispatch('enrich_project_context', { project_id: 1349, action: 'read' });
    expect(gatedInner).toHaveBeenCalledWith('enrich_project_context', { project_id: 1349, action: 'read' });
    expect(result.text).toBe('project context');
  });

  it('blocks an enrich_project_context action=write call before it ever reaches the gated appq dispatcher — ' +
    "the exact call appq:runman's own prompt makes at the end of a pass", async () => {
    const gatedInner = vi.fn().mockResolvedValue({ ok: true, text: 'would have written' });
    mockCreateGatedAppqDispatcher.mockReturnValue(gatedInner);
    await explore(baseOpts());
    const dispatch = mockRunWorkflow.mock.calls[0][0].dispatch;

    const result = await dispatch('enrich_project_context', { project_id: 1349, action: 'write', knowledge: {} });
    expect(gatedInner).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.text).toMatch(/read-only/);
  });

  it('the seed message includes the prompt, and the URL/project ID only when given', async () => {
    await explore({ ...baseOpts(), siteUrl: 'https://stage.example.com', projectId: 1349 });
    const call = mockRunWorkflow.mock.calls[0][0];
    expect(call.seedMessage).toContain('Explore the signup flow like a senior QA lead.');
    expect(call.seedMessage).toContain('https://stage.example.com');
    expect(call.seedMessage).toContain('1349');
  });

  it('closes the browser even when runWorkflow throws', async () => {
    const browser = { close: vi.fn().mockResolvedValue(undefined), newPage: vi.fn().mockResolvedValue(fakePage()) };
    mockLaunch.mockResolvedValue(browser);
    mockRunWorkflow.mockRejectedValue(new Error('boom'));
    await expect(explore(baseOpts())).rejects.toThrow('boom');
    expect(browser.close).toHaveBeenCalled();
  });

  it('returns loopResult.report/turns/budgetExceeded unchanged', async () => {
    mockRunWorkflow.mockResolvedValue({ report: 'my report', turns: 7, budgetExceeded: true });
    const result = await explore(baseOpts());
    expect(result).toEqual({ report: 'my report', turns: 7, budgetExceeded: true });
  });
});

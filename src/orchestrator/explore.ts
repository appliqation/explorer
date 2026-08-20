// Calls appq's real appq:runman workflow through the shared engine, headlessly
// (interactive: "false" — no human to answer a mid-run confirmation), offering
// it real browser_* tools plus a read-only appq context allowlist. The
// workflow's own methodology (7 phases: prerequisites/URL resolution, context
// gathering, surface mapping, a senior-QA heuristics pass plus mandatory
// security/network/caching/mobile probes, an evidence-discipline gate, and a
// findings report) lives entirely server-side — nothing here duplicates it.
//
// Deliberately doesn't structurally parse a bug count or severity out of the
// returned Markdown report — this agent's job is producing a report for a
// human or appliqation-autopilot to read and reason about, not a pass/fail
// verdict a pipeline gates on. budgetExceeded (from LoopResult, unchanged) is
// the only thing that decides the CLI's exit code — see cli/index.ts.

import { chromium } from 'playwright';
import {
  PlaywrightBrowserTools,
  BROWSER_TOOL_DEFS,
  fetchAppqToolDefs,
  createGatedAppqDispatcher,
  createReadOnlyProjectContextDispatcher,
  runWorkflow,
  type LoopResult,
  type McpClient,
  type ProviderAdapter,
  type RunBudget,
  type ToolDispatcher,
} from '@appliqation/agent-core';
import { READONLY_APPQ_TOOLS } from '../tools/safety.js';

export interface ExploreOptions {
  client: McpClient;
  adapter: ProviderAdapter;
  /** Plain-English exploration intent — appq:runman's own `prompt` arg. Can embed a URL. */
  prompt: string;
  /** Enables appq:runman's persistent-memory read (project context is read-only here — see README.md). */
  projectId?: number;
  /** Overrides the URL appq:runman would otherwise resolve on its own. */
  siteUrl?: string;
  maxSteps: number;
  maxPages: number;
  maxMinutes: number;
  budget: RunBudget;
  ringBufferCap?: number;
  onEvent?: (event: { type: string; detail?: unknown }) => void;
}

export type ExploreResult = LoopResult;

export async function explore(opts: ExploreOptions): Promise<ExploreResult> {
  const appqToolDefs = await fetchAppqToolDefs(opts.client, READONLY_APPQ_TOOLS);
  // Argument-level gate applied outermost — see @appliqation/agent-core's
  // tools/projectContext.ts — so this agent's own attempted
  // enrich_project_context write (appq:runman's own Phase 6 instruction,
  // meant for an interactive session with a human at the confirmation gate)
  // is refused before it ever reaches appq, not silently honored just
  // because nothing is watching this particular invocation.
  const gatedAppq = createReadOnlyProjectContextDispatcher(createGatedAppqDispatcher(opts.client, READONLY_APPQ_TOOLS));

  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    const browserTools = new PlaywrightBrowserTools(page, opts.ringBufferCap);
    const dispatch: ToolDispatcher = async (name, args) => {
      if (name.startsWith('browser_')) return browserTools.dispatch(name, args);
      return gatedAppq(name, args);
    };

    const promptArgs: Record<string, unknown> = {
      prompt: opts.prompt,
      interactive: 'false',
      max_steps: opts.maxSteps,
      max_pages: opts.maxPages,
      max_minutes: opts.maxMinutes,
    };
    if (opts.projectId !== undefined) promptArgs.project_id = opts.projectId;
    if (opts.siteUrl) promptArgs.site_url = opts.siteUrl;

    const seedLines = [`Exploration intent: ${opts.prompt}`];
    if (opts.siteUrl) seedLines.push(`URL under test: ${opts.siteUrl}`);
    if (opts.projectId !== undefined) seedLines.push(`Project ID: ${opts.projectId}`);
    seedLines.push('Begin now — start with browser_snapshot.');

    return await runWorkflow({
      source: { kind: 'appq', name: 'appq:runman', args: promptArgs },
      fetchPrompt: opts.client.fetchPrompt,
      seedMessage: seedLines.join('\n'),
      tools: [...BROWSER_TOOL_DEFS, ...appqToolDefs],
      dispatch,
      adapter: opts.adapter,
      budget: opts.budget,
      onEvent: opts.onEvent,
    });
  } finally {
    await browser.close();
  }
}

import { describe, it, expect, vi } from 'vitest';
import { recordExploreRun } from './audit.js';
import type { AuditSink } from '@appliqation/agent-core';

const usage = { inputTokens: 100, outputTokens: 50, cacheWriteTokens: 0, cacheReadTokens: 0 };

describe('recordExploreRun', () => {
  it('records one call with agent/subcommand and the outcome shaped like ExploreSummary', async () => {
    const sink: AuditSink = { record: vi.fn().mockResolvedValue(undefined) };
    await recordExploreRun({
      sink,
      startedAt: 1000,
      endedAt: 3000,
      model: 'claude-sonnet-5',
      usage,
      prompt: 'Explore the signup flow',
      projectId: 1349,
      siteUrl: 'https://stage.example.com',
      result: { report: 'findings', turns: 5, budgetExceeded: false },
    });

    expect(sink.record).toHaveBeenCalledTimes(1);
    expect(sink.record).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'appliqation-explorer',
        subcommand: 'explore',
        startedAt: 1000,
        endedAt: 3000,
        durationMillis: 2000,
        model: 'claude-sonnet-5',
        usage,
        turns: 5,
        budgetExceeded: false,
        exitCode: 0,
        outcome: { prompt: 'Explore the signup flow', projectId: 1349, siteUrl: 'https://stage.example.com', turns: 5, budgetExceeded: false, report: 'findings' },
      }),
    );
  });

  it('exitCode is 1 when the pass hit its own budget cap, matching the CLI\'s own exitCodeFor()', async () => {
    const sink: AuditSink = { record: vi.fn().mockResolvedValue(undefined) };
    await recordExploreRun({
      sink,
      startedAt: 0,
      endedAt: 1,
      model: 'x',
      usage,
      prompt: 'p',
      result: { report: 'r', turns: 80, budgetExceeded: true },
    });
    const record = (sink.record as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(record.exitCode).toBe(1);
  });

  it('records exitCode 1 and an error outcome when result is undefined — explore() threw', async () => {
    const sink: AuditSink = { record: vi.fn().mockResolvedValue(undefined) };
    await recordExploreRun({
      sink,
      startedAt: 0,
      endedAt: 1,
      model: 'x',
      usage,
      prompt: 'p',
      result: undefined,
    });
    const record = (sink.record as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(record.exitCode).toBe(1);
    expect(record.turns).toBeUndefined();
    expect(record.budgetExceeded).toBeUndefined();
    expect(record.outcome).toEqual({ prompt: 'p', projectId: undefined, siteUrl: undefined, error: true });
  });

  it('a sink failure never rejects — safeRecord swallows it, no error propagates to the caller', async () => {
    const sink: AuditSink = { record: vi.fn().mockRejectedValue(new Error('down')) };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      recordExploreRun({ sink, startedAt: 0, endedAt: 1, model: 'x', usage, prompt: 'p', result: { report: 'r', turns: 1, budgetExceeded: false } }),
    ).resolves.toBeUndefined();
  });
});

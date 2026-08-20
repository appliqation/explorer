// Extracted out of cli/index.ts so this is testable without triggering that
// file's top-level program.parseAsync(process.argv) side effect — same
// reasoning as appliqation-autotest's cli/resolvers.ts.

import { safeRecord, type AuditSink, type AuditRecord } from '@appliqation/agent-core';
import type { ExploreResult } from '../orchestrator/explore.js';

export interface RecordExploreRunArgs {
  sink: AuditSink;
  startedAt: number;
  endedAt: number;
  model: string;
  usage: AuditRecord['usage'];
  prompt: string;
  projectId?: number;
  siteUrl?: string;
  /** undefined means explore() threw — the run never produced a result. */
  result: ExploreResult | undefined;
}

export async function recordExploreRun(args: RecordExploreRunArgs): Promise<void> {
  const { sink, startedAt, endedAt, model, usage, prompt, projectId, siteUrl, result } = args;
  await safeRecord(sink, {
    agent: 'appliqation-explorer',
    subcommand: 'explore',
    startedAt,
    endedAt,
    durationMillis: endedAt - startedAt,
    model,
    usage,
    turns: result?.turns,
    budgetExceeded: result?.budgetExceeded,
    // Never based on what the report found — budgetExceeded means the pass
    // ended early, an unrelated failure to explore() throwing outright.
    exitCode: result ? (result.budgetExceeded ? 1 : 0) : 1,
    outcome: result
      ? { prompt, projectId, siteUrl, turns: result.turns, budgetExceeded: result.budgetExceeded, report: result.report }
      : { prompt, projectId, siteUrl, error: true },
  });
}

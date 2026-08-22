#!/usr/bin/env node
// `explore`: run appq's real appq:runman exploratory-QA workflow headlessly
// against a live target. See src/orchestrator/explore.ts for the actual
// mechanism; this file is just Commander wiring + result rendering.

import { Command } from 'commander';
import { createMcpClient, createAnthropicAdapter, createOpenAiAdapter, createUsageAccumulator, type ProviderAdapter } from '@appliqation/agent-core';
import { config, resolveProvider, resolveModel } from '../config/env.js';
import { explore } from '../orchestrator/explore.js';
import { recordExploreRun } from './audit.js';
import { printJsonSummary, printHumanSummary, exitCodeFor } from './output.js';
import type { ExploreSummary } from './output.js';

const client = createMcpClient({ origin: config.appqOrigin, apiKey: config.appqApiKey() });

function buildAdapter(): ProviderAdapter {
  const provider = resolveProvider();
  const model = resolveModel();
  return provider === 'anthropic'
    ? createAnthropicAdapter(config.anthropicApiKey!, model, config.anthropicMaxTokens)
    : createOpenAiAdapter(config.openaiApiKey!, model, config.openaiMaxOutputTokens);
}

function logEvent(prefix: string) {
  return (e: { type: string; detail?: unknown }) => {
    if (e.type === 'assistant') {
      const text = ((e.detail as string) ?? '').trim();
      if (text) console.error(`${prefix}[thinking] ${text}`);
    } else if (e.type === 'tool') {
      const d = e.detail as { name: string; result: string };
      console.error(`${prefix}[tool] ${d.name} -> ${d.result.slice(0, 300)}`);
    } else if (e.type === 'log') {
      console.error(`${prefix}[log] ${e.detail}`);
    } else if (e.type === 'usage') {
      const u = e.detail as { inputTokens: number; outputTokens: number; cacheWriteTokens?: number; cacheReadTokens?: number };
      const cacheNote = u.cacheReadTokens
        ? ` (${u.cacheReadTokens} from cache)`
        : u.cacheWriteTokens
          ? ` (${u.cacheWriteTokens} written to cache)`
          : '';
      console.error(`${prefix}[usage] in=${u.inputTokens} out=${u.outputTokens}${cacheNote}`);
    }
  };
}

const program = new Command();
program
  .name('appliqation-explorer')
  .description("Run Appliqation's exploratory-QA workflow (appq:runman) headlessly against a live app under test.");

program
  .command('explore')
  .description(
    "Run appq:runman — surface mapping, a senior-QA heuristics pass, and mandatory security/network/caching/" +
      'mobile probes — against a real target, always headlessly (interactive: "false", no confirmation gate). ' +
      'Read-only end to end: offered appq context tools plus enrich_project_context, but its own attempted ' +
      'action=write persistence at the end of the workflow is refused, not honored — see README.md.',
  )
  .requiredOption('--prompt <text>', 'plain-English exploration intent — can embed a URL')
  .option('--project-id <id>', 'appq project id — enables reading persistent project-context memory')
  .option('--site-url <url>', "override the URL appq:runman would otherwise resolve on its own")
  .option('--max-steps <n>', 'override EXPLORE_MAX_STEPS for this run')
  .option('--max-pages <n>', 'override EXPLORE_MAX_PAGES for this run')
  .option('--max-minutes <n>', 'override EXPLORE_MAX_MINUTES for this run')
  .option('--json', 'print a single structured JSON summary on stdout instead of a human-readable report')
  .option('--ci', 'shorthand for --json')
  .action(
    async (opts: {
      prompt: string;
      projectId?: string;
      siteUrl?: string;
      maxSteps?: string;
      maxPages?: string;
      maxMinutes?: string;
      json?: boolean;
      ci?: boolean;
    }) => {
      const json = (opts.json ?? false) || (opts.ci ?? false);
      const adapter = buildAdapter();
      const projectId = opts.projectId !== undefined ? Number(opts.projectId) : undefined;

      const startedAt = Date.now();
      const usage = createUsageAccumulator();
      const baseLog = logEvent('');

      let result: Awaited<ReturnType<typeof explore>> | undefined;
      try {
        result = await explore({
          client,
          adapter,
          prompt: opts.prompt,
          projectId,
          siteUrl: opts.siteUrl,
          maxSteps: opts.maxSteps ? Number(opts.maxSteps) : config.exploreMaxSteps,
          maxPages: opts.maxPages ? Number(opts.maxPages) : config.exploreMaxPages,
          maxMinutes: opts.maxMinutes ? Number(opts.maxMinutes) : config.exploreMaxMinutes,
          budget: config.budget,
          ringBufferCap: config.evidenceRingBufferCap,
          onEvent: (e) => {
            baseLog(e);
            if (e.type === 'usage') usage.onUsage(e.detail as { inputTokens: number; outputTokens: number; cacheWriteTokens?: number; cacheReadTokens?: number });
          },
        });
      } finally {
        // Audit write happens whether the run succeeded or threw — see
        // @appliqation/agent-core's audit/sink.ts: safeRecord() (used
        // inside recordExploreRun) never lets a failed/unreachable audit
        // sink affect this process's real outcome, and this finally never
        // blocks the throw below from propagating unchanged.
        await recordExploreRun({
          sink: config.auditSink,
          startedAt,
          endedAt: Date.now(),
          model: resolveModel(),
          usage: usage.totals(),
          prompt: opts.prompt,
          projectId,
          siteUrl: opts.siteUrl,
          result,
        });
      }

      const summary: ExploreSummary = {
        prompt: opts.prompt,
        projectId,
        siteUrl: opts.siteUrl,
        turns: result.turns,
        budgetExceeded: result.budgetExceeded,
        report: result.report,
      };
      if (json) printJsonSummary(summary);
      else printHumanSummary(summary);
      process.exitCode = exitCodeFor(summary);
    },
  );

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});

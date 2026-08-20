// --json/--ci's renderer. Unlike appliqation-scriptgen/-defect-fix,
// "found bugs" is not a failure condition here — that's this agent's whole
// job. exitCodeFor() is non-zero only when the pass itself didn't
// complete (budgetExceeded), never based on what the report says it found.

export interface ExploreSummary {
  prompt: string;
  projectId?: number;
  siteUrl?: string;
  turns: number;
  budgetExceeded: boolean;
  report: string;
}

export function printJsonSummary(summary: ExploreSummary): void {
  console.log(JSON.stringify(summary, null, 2));
}

export function printHumanSummary(summary: ExploreSummary): void {
  console.log(`\n=== Exploration: "${summary.prompt}" ===\n`);
  console.log(summary.report);
  console.log(`\n(${summary.turns} turns, budget exceeded: ${summary.budgetExceeded})`);
  if (summary.budgetExceeded) {
    console.log('  Pass ended early on its own budget cap — the report above may be incomplete.');
  }
}

/** 1 only when the pass itself didn't complete — never based on what the report found. */
export function exitCodeFor(summary: ExploreSummary): number {
  return summary.budgetExceeded ? 1 : 0;
}

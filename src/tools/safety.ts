// This agent's own domain knowledge of which appq tools it may touch — the
// enforcement mechanism (assertToolAllowed / the gated dispatcher) lives in
// @appliqation/agent-core, shared with every sibling agent; only the
// allowlist content is local. Genuinely read-only end to end, including
// enrich_project_context: it's offered here because it has a real read
// mode this agent needs (known_issues/high_risk_areas inform what's worth
// exploring), but @appliqation/agent-core's createReadOnlyProjectContextDispatcher
// refuses its action=write mode unconditionally — see cli/index.ts and
// README.md's Safety section for why this agent, unlike an interactive
// appq:runman session, never gets to use it.

export const READONLY_APPQ_TOOLS = new Set([
  'get_scenario',
  'get_coverage_analysis',
  'get_defects',
  'get_failure_patterns',
  'get_quality_context',
  'get_evidence_summary',
  'get_run_evidence',
  'search_tests',
  'get_project_settings',
  'enrich_project_context',
  'get_validation_targets',
]);

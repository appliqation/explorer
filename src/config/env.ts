import 'dotenv/config';
import { DEFAULT_ANTHROPIC_MODEL, DEFAULT_OPENAI_MODEL } from '@appliqation/agent-core/providers';
import { required, optional } from '@appliqation/agent-core/config';
import { resolveAuditSink } from '@appliqation/agent-core/audit';

export const config = {
  appqOrigin: optional('APPQ_ORIGIN') ?? 'https://appq.appliqation.io',
  appqApiKey: () => required('APPQ_API_KEY'),
  anthropicApiKey: optional('ANTHROPIC_API_KEY'),
  openaiApiKey: optional('OPENAI_API_KEY'),
  anthropicModel: optional('ANTHROPIC_MODEL'),
  openaiModel: optional('OPENAI_MODEL'),
  anthropicMaxTokens: Number(optional('ANTHROPIC_MAX_TOKENS') ?? 8192),
  openaiMaxOutputTokens: Number(optional('OPENAI_MAX_OUTPUT_TOKENS') ?? 8192),

  // appq:runman's own self-regulated budget (max_steps/max_pages/max_minutes
  // args) — what the model is actually told to respect. Defaults match the
  // workflow's own (RunmanPrompt.php).
  exploreMaxSteps: Number(optional('EXPLORE_MAX_STEPS') ?? 50),
  exploreMaxPages: Number(optional('EXPLORE_MAX_PAGES') ?? 12),
  exploreMaxMinutes: Number(optional('EXPLORE_MAX_MINUTES') ?? 15),

  // A code-enforced backstop in case the model doesn't honor the
  // prompt-level limits above — set generously above them, not equal to
  // them (unlike appliqation-scriptgen's ~infinite maxPages, this agent
  // really does drive browser_navigate, so the cap has to be real).
  budget: {
    maxCalls: Number(optional('BUDGET_MAX_CALLS') ?? 150),
    maxPages: Number(optional('BUDGET_MAX_PAGES') ?? 40),
    maxMillis: Number(optional('BUDGET_MAX_MILLIS') ?? 25 * 60 * 1000),
    maxTurns: Number(optional('BUDGET_MAX_TURNS') ?? 80),
  },

  evidenceRingBufferCap: Number(optional('EVIDENCE_RING_BUFFER_CAP') ?? 500),

  // Observability, entirely opt-in — see @appliqation/agent-core's audit/sink.ts.
  // Nothing is recorded anywhere unless AUDIT_MONGO_URI or AUDIT_JSONL_PATH is
  // actually set; resolveAuditSink() falls back to a no-op sink otherwise.
  auditSink: resolveAuditSink({
    auditMongoUri: optional('AUDIT_MONGO_URI'),
    auditMongoDb: optional('AUDIT_MONGO_DB'),
    auditMongoCollection: optional('AUDIT_MONGO_COLLECTION'),
    auditJsonlPath: optional('AUDIT_JSONL_PATH'),
  }),
};

export function resolveProvider(): 'anthropic' | 'openai' {
  if (config.anthropicApiKey) return 'anthropic';
  if (config.openaiApiKey) return 'openai';
  throw new Error('Set ANTHROPIC_API_KEY or OPENAI_API_KEY');
}

export function resolveModel(): string {
  const provider = resolveProvider();
  return provider === 'anthropic' ? (config.anthropicModel ?? DEFAULT_ANTHROPIC_MODEL) : (config.openaiModel ?? DEFAULT_OPENAI_MODEL);
}

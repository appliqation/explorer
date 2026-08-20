# CLAUDE.md — appliqation-explorer

Part of the Appliqation workspace. See `~/Sites/localhost/CLAUDE.md` for how the
product fits together; this file is the map of **this repo only**.

## What this repo is

A standalone agent that runs Appliqation's real, already-production `appq:runman`
exploratory-QA workflow headlessly against a live app under test — the same 7-phase
senior-QA heuristics pass (prerequisites/URL resolution, context gathering, surface
mapping, a 13-category heuristics pass plus mandatory security/network/caching/mobile
probes, an evidence-discipline gate, findings report) a human runs interactively in
Claude Code via `/appq:runman`, just unattended. Replaces `appliqation-autotest`'s old
`runman` command outright (that was Phase 1's engine proof, thinner than this — no
resize/tabs/evaluate, no configurable budget) — see that repo's `CLAUDE.md`.

**Deliberately thin**, same pattern as `appliqation-scriptgen`: the actual exploration
methodology lives entirely in appq's own `appq:runman` MCP prompt, not duplicated here.
This repo's own code is only: the two tool surfaces `explore()` offers the model (a
real Playwright browser via `@appliqation/agent-core`'s `browser_*` palette, and a
read-only appq context allowlist), the CLI, and the argument-level project-context gate
this repo doesn't own but does enforce (see below).

## The one architectural decision that matters here

**This agent never gets to use `enrich_project_context`'s write mode, even though the
workflow it runs (`appq:runman`) explicitly asks for it.** The prompt's own Phase 6
persists findings as "persistent memory" via `enrich_project_context` `action=write`,
appropriate when a human is present at the interactive Phase 2 confirmation gate and
reads the report before anything happens next. A standalone headless invocation has no
equivalent — nothing supervises it turn to turn — so this repo holds the same
conservative default `appliqation-autopilot` already established for exactly this
reason, rather than the permissive one baked into the interactive prompt.

The enforcement is `@appliqation/agent-core`'s `createReadOnlyProjectContextDispatcher`
(promoted there from `appliqation-autopilot` once this repo needed the identical
guarantee — see that package's `CLAUDE.md`), wrapped outermost around the gated appq
dispatcher in `src/orchestrator/explore.ts`. This is a dispatch-level interceptor, not a
prompt instruction: the model can and will attempt the write (it's following its own
served prompt correctly), and gets a clear refusal back — the same "expected and
normal, not an error" shape every other agent in this family uses for a withheld
capability. No appq prompt change was needed or made; the boundary lives below what any
served prompt can widen.

## Where to find what

- `src/orchestrator/explore.ts` — `explore()`: launches a real `chromium` browser,
  builds the tool palette (`BROWSER_TOOL_DEFS` + `READONLY_APPQ_TOOLS`, the appq
  dispatcher wrapped in `createReadOnlyProjectContextDispatcher`), and calls
  `runWorkflow()` against `appq:runman` with `interactive: "false"` always passed —
  there's no human to answer a mid-run confirmation, so this is never conditional.
  Returns `{report, turns, budgetExceeded}` straight from `LoopResult` — deliberately
  doesn't try to parse a bug count or severity out of the Markdown report; this agent's
  job is producing a report for a human or `appliqation-autopilot` to read, not a
  pass/fail verdict a pipeline gates on.
- `src/tools/safety.ts` — `READONLY_APPQ_TOOLS`: this agent's own appq-tool allowlist,
  genuinely read-only end to end including `enrich_project_context` (offered here for
  its real read mode — `known_issues`/`high_risk_areas` inform what's worth exploring —
  safe to include only because the shared gate refuses its write mode unconditionally,
  not just under some flag). No local dry-run module at all: this agent never has real
  write access to anything, so there's nothing for a `--dry-run` flag to suppress.
- `src/cli/index.ts` — the `explore` command. `--prompt` is the only required input;
  `--project-id`/`--site-url` are optional (mirroring `appq:runman`'s own optional
  args), `--max-steps`/`--max-pages`/`--max-minutes` override the configured defaults
  for one run.
- `src/cli/output.ts` — `ExploreSummary`/`exitCodeFor()`: exit code is non-zero only
  when the pass itself hit its own budget cap and ended early — "found bugs" is never a
  failure condition here, that's the entire point of this agent, unlike
  `appliqation-scriptgen`'s "never trust the model's own claim" verification discipline
  (there is no external ground truth to verify an exploration report against).
- `src/config/env.ts` — `exploreMaxSteps`/`exploreMaxPages`/`exploreMaxMinutes`
  (`appq:runman`'s own self-regulated prompt-level budget, defaults matching
  `RunmanPrompt.php`'s own) plus the family's standard `BUDGET_MAX_*` (`RunBudget`, a
  code-enforced backstop set generously above the prompt-level numbers in case the
  model doesn't honor its own stated limits — unlike `appliqation-scriptgen`'s
  effectively-unreachable `maxPages`, this agent genuinely drives `browser_navigate`,
  so the cap has to be a real number, not a token ceiling). `auditSink` resolves
  `AUDIT_MONGO_*`/`AUDIT_JSONL_PATH` via `@appliqation/agent-core/audit`'s
  `resolveAuditSink()` — entirely opt-in, no-op sink when unconfigured.
- `src/cli/audit.ts` — `recordExploreRun()`: extracted out of `cli/index.ts` (same
  reasoning as `appliqation-autotest`'s `cli/resolvers.ts` — testable without
  triggering that file's top-level `program.parseAsync(process.argv)` side effect).
  Builds one `AuditRecord` per invocation and calls `safeRecord()`; `outcome` is
  exactly the same shape as `ExploreSummary` (no second schema). Records `exitCode: 1`
  and an `error: true` outcome when `explore()` itself threw (`result` undefined) —
  distinct from `exitCode: 1` for a completed-but-`budgetExceeded` pass, both map to a
  non-zero code but the `outcome` shape tells them apart.

## Commands

- `npm run dev -- explore --prompt "<text>" [--project-id <id>] [--site-url <url>] [--max-steps <n>] [--max-pages <n>] [--max-minutes <n>] [--json|--ci]`
- `npm run build` / `npm run typecheck`
- `npm test` / `npm run test:watch` — vitest, colocated `src/**/*.test.ts` files
- `npx playwright install chromium` — needed once before a real (non-mocked) run

## Config

Copy `.env.example` to `.env`. Requires `APPQ_API_KEY` (read-only access is sufficient
— this agent never calls an appq write tool, and its one tool with a write mode is
refused at the dispatch layer regardless) and one of
`ANTHROPIC_API_KEY`/`OPENAI_API_KEY`.

## Keeping this file current

When you add, remove, or rename a top-level file or a directory under `src/`, update
the map above in the same change.

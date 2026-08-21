# Appliqation Explorer

**Runs Appliqation's exploratory-QA workflow (`appq:runman`) headlessly against a live app under test — the same senior-QA heuristics pass a human runs interactively in Claude Code, without a human at the confirmation gate.**

Point it at a URL (or let it resolve one from a project) and a plain-English intent, and it drives a real Playwright browser through surface mapping, a 13-category senior-QA heuristics pass, and mandatory security/network/caching/mobile probes — the exact same methodology Appliqation already serves interactively, just run unattended.

## Why this exists

Every other agent in this family answers a narrow, structured question: does this test case pass (autotest), is there a script for it (scriptgen), can this defect be fixed (defect-fix). None of them go looking for the bugs a scripted test never checks for — accessibility gaps, race conditions, caching bugs, things that only show up when someone actually explores. Appliqation already has this covered as `appq:runman`, but until now the only way to run it was interactively. This is the standalone, unattended client for it.

## The one thing this agent deliberately can't do

`appq:runman`'s own prompt ends a pass by calling `enrich_project_context` with `action=write`, to persist findings (`known_issues`, `high_risk_areas`, `regression_watchlist`) as memory for future passes. **This agent refuses that call.**

When `appq:runman` runs interactively inside Claude Code, a human is present at its Phase 2 confirmation gate and reads the findings report before anything happens next — informal but real supervision over what gets written back as fact for future agents to trust. A standalone, headless invocation has no equivalent: nothing reviews it turn to turn. So this agent holds the conservative default instead: it can read project context (`enrich_project_context` with `action=read` — informs what's worth exploring), but a write attempt is refused at the dispatch layer, in code, before it ever reaches appq — not honored just because the served prompt asks for it. Genuinely read-only end to end; see [`@appliqation/agent-core`](https://github.com/appliqation/appliqation-agent-core)'s `createReadOnlyProjectContextDispatcher`.

## Quick start

```bash
npm install -g appliqation-explorer
npx playwright install chromium
```

Create a `.env` file (in whatever directory you'll run it from) with:

```
APPQ_API_KEY=your-appliqation-api-key   # read-only is enough
ANTHROPIC_API_KEY=your-anthropic-key    # or OPENAI_API_KEY — pick one
```

```bash
appliqation-explorer explore \
  --prompt "Explore the signup flow like a senior QA lead, focus on the phone number field" \
  --project-id 1349 \
  --site-url https://stage.example.com
```

Add `--json`/`--ci` for a structured summary. There's no `--dry-run` — this agent never has real write access to anything, so there's nothing to suppress. The exit code is 0 unless the pass hit its own budget cap and ended early; "found bugs" is never a failure — that's the entire point of running it.

## Configuration

Copy `.env.example` to `.env`. Requires `APPQ_API_KEY` (read-only access is sufficient) and one of `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`. `EXPLORE_MAX_STEPS`/`EXPLORE_MAX_PAGES`/`EXPLORE_MAX_MINUTES` are the workflow's own self-regulated budget (what the model is told to respect); `BUDGET_MAX_*` is a separate, code-enforced backstop set generously above them in case the model doesn't honor its own limits.

## Development

```bash
git clone https://github.com/appliqation/appliqation-explorer.git
cd appliqation-explorer
npm install
cp .env.example .env   # fill in APPQ_API_KEY (read-only is enough) and one LLM provider key
npm run dev -- explore --prompt "<text>" [--project-id <id>] [--site-url <url>]
npm run typecheck
npm test
```

See `CLAUDE.md` for a map of this repo if you're working in it with an AI coding assistant.

## License

MIT — see [LICENSE](./LICENSE).

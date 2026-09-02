# Phase 3 — agent-in-the-loop result: STOP

Protocol and kill rule were frozen before running: [`PHASE3_PROTOCOL.md`](PHASE3_PROTOCOL.md).

**Repo:** `dubinc/dub` @ `0d8c84e` — Next.js App Router + Prisma monorepo, 142 `route.ts`
files, 454 files with Prisma writes. Multi-hop by construction (route → `withWorkspace`
wrapper → lib/api service → Prisma or `$transaction`), unlike RealWorld.

**Arms:** same model (`grok-4.6-high`) in both, fresh context per session, 3 sessions each,
all 10 tasks per session.

- **A** — grep/read + Graphify CLI (prebuilt `graph.json`). Underdelta forbidden.
- **B** — A **plus** the Underdelta skill and `query writes|impact|unknown` (prebuilt graph).

Gold was built from source only (symbol-level import propagation, `prisma.*`/`tx.*` write
sites, `export *` legacy re-exports, jobs-registry dispatch). Underdelta output was not
used for gold. Gold was corrected twice during scoring when all six sessions agreed
against it; corrections applied to both arms identically.

## Result

| Arm | Invented claims (mean) | Mean recall | Precision | Tool calls | Files read | Wall time |
|-----|------------------------|-------------|-----------|------------|------------|-----------|
| A grep + Graphify | 2.0 | **0.85** | 1.00 | 75.7 | 29.0 | 503 s |
| B + Underdelta | 2.0 | 0.77 | 1.00 | **50.7** | **16.3** | 506 s |

Kill rule: **invented drop 0% (needed ≥50%) — FAIL. Recall B ≥ A — FAIL. Verdict: STOP.**

Per task (recall / invented), A-1..3 then B-1..3:

| Task | A-1 | A-2 | A-3 | B-1 | B-2 | B-3 |
|------|-----|-----|-----|-----|-----|-----|
| T1 impact delete-link | .68/0 | .68/0 | .68/0 | .64/0 | .68/0 | .64/0 |
| T2 impact verify-domain | 1/0 | 1/0 | 1/0 | .67/0 | 1/0 | .67/0 |
| T3 impact combine-tag-ids | .72/2 | .72/2 | .72/2 | .58/2 | .70/2 | .55/2 |
| T4 impact bulk-delete-links | .83/0 | .70/0 | .70/0 | .68/0 | .83/0 | .67/0 |
| T5 impact mark-domain-deleted | .81/0 | .81/0 | .81/0 | .73/0 | .81/0 | .73/0 |
| T6 impact archive-link (dead code trap) | 1/0 | 1/0 | 1/0 | 1/0 | 1/0 | 1/0 |
| T7 writes Tag | .88/0 | .88/0 | .88/0 | .63/0 | .56/0 | .56/0 |
| T8 writes Webhook | .70/0 | .70/0 | .70/0 | .60/0 | .60/0 | .60/0 |
| T9 nav importers | 1/0 | 1/0 | 1/0 | 1/0 | 1/0 | 1/0 |
| T10 nav importers | 1/0 | 1/0 | 1/0 | 1/0 | 1/0 | 1/0 |

The two "invented" T3 endpoints are the same two in all six sessions and are almost
certainly a residual gold gap, not hallucination. Either way they cancel.

## What actually happened

1. **The agent did not invent routes in either arm.** Precision was 1.00 everywhere.
   The premise "agents with a vicinity graph hallucinate product structure" did not hold
   for this model on this repo. The trap (T6, dead code) was answered correctly 6/6.
2. **Underdelta lowered recall.** Its Next.js adapter does not type `export const GET =
   withWorkspace(async …)` handlers, so `query impact` returned only cron routes
   (e.g. 1 of 11 for `delete-link.ts`) and `query writes Tag` missed the primary
   `/api/tags` handlers. The agent obeyed the skill ("quote only returned endpoints"),
   trusted the short list, and stopped early. Honesty about limits was present in every
   `unknown_note`; it did not translate into better answers.
3. **Underdelta did save work**: −33% tool calls, −44% files read. Wall time was equal
   because each Underdelta query cost ~20 s on a 12k-node graph.
4. Graphify was used lightly in both arms (`explain`/`affected`); `rg` did most of the
   work. Neither graph tool was decisive. Grep with a competent model was enough.

## Conclusion

On a codebase large enough for typed facts to matter, the typed facts were incomplete,
and an agent with grep alone was both more complete and no less precise. The savings
Underdelta delivered were in effort, not correctness — and the mindset doc explicitly
said saving tokens while getting worse answers means the agent thesis is not working.

Per the pre-registered rule: **stop building adapters.** Remaining options are
publish + halt, or pivot to a typed-facts layer over someone else's graph *only if*
a future run on a covered stack passes this same rule. Do not relax the rule to fit.

## Reproduce

```bash
git clone https://github.com/dubinc/dub /tmp/p3/dub && git -C /tmp/p3/dub checkout 0d8c84e
npm run build && node dist/cli.js scan /tmp/p3/dub
pip install graphifyy && graphify update /tmp/p3/dub --force --no-cluster
node benchmark/phase3/gold-build.mjs            # writes gold.json
# run 3 agent sessions per arm with benchmark/phase3/tasks.md, write results/{A,B}-{1,2,3}.json
node benchmark/phase3/score.mjs
```

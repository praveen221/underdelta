# Underdelta Autopilot Plan

Living plan for overnight / looped cloud-agent work.

**Branch lock:** `cursor/visual-system-browser-7649` only  
**Existing PR:** keep updating the draft PR for this branch — never open a second PR  
**Loop interval:** 15 minutes  
**This file:** update at the end of every successful tick

---

## End goal

Achieve a **full, readable product-architecture diagram** for a concrete stack slice (start with Underdelta itself + a TypeScript/JS product stack):

- UI / routes / components
- APIs / handlers
- DB / tables / migrations / Prisma models
- Jobs / cron / queues / pipelines
- Evidence links back to source
- Semantic projection (product nodes), not a raw function hairball

Default visualization must stay clean: **no test/fixture/verification systems in the product diagram**.

---

## Status board

Update these checkboxes and the “Next focus” section every tick.

### Done

- [x] Stack-neutral `architecture.json` contract (`src/schema.ts`)
- [x] Compile pipeline + graph assembly
- [x] TypeScript/JS extractor (routes, components, jobs, queues, calls)
- [x] Prisma + SQL extractors
- [x] Navigable viewer (lanes, pan/zoom, search, kind shapes)
- [x] Scan excludes tests/fixtures/build artifacts from default map
- [x] Autopilot plan file created (`docs/AUTOPILOT_PLAN.md`)
- [x] Side verification mini-system (`verification/mini-stack`) with pipeline + cron + queue + routes + Prisma/SQL + UI
- [x] `npm run verify` asserts fixture kinds/edges and that default `scan .` excludes `verification/`
- [x] Minimal `Pipeline` / step extraction in TypeScript extractor
- [x] Ignore `verification` and `.underdelta-verify` in product discovery
- [x] Semantic projection layer (`src/project.ts`) collapses modules into product systems
- [x] Underdelta self-map projects CLI → Compile → Extractors → Graph → Viewer (+ Schema)
- [x] Viewer defaults to Systems lane; modules/functions behind Details toggle
- [x] `npm run verify` asserts self-map semantic nodes + fixture projection
- [x] Diagram quality pass: nest routes/cron/queue/pipelines/UI under systems
- [x] Dedupe Prisma/SQL/usage table aliases (Order/orders → one table)
- [x] Distinguish Viewer vs UI projection labels; hide pipeline-steps by default
- [x] Richer verify: fixture system labels, table dedupe, API contains routes

### In progress / next

- [ ] Overview layout: rank/position systems by flows-to so the browser reads left-to-right
- [ ] Expand projection heuristics beyond filename conventions (package exports, README roles)
- [ ] Surface architecture.json / output artifact as an explicit node in Underdelta self-map
- [ ] Expand verify assertions as new architectural kinds become extractable

### Next focus (edit every tick)

> **Next focus:** This work is done (diagram quality + table dedupe + richer verify). Now make the default browser layout follow product flow (systems ordered by flows-to / depends-on) and add an explicit `architecture.json` output artifact node to the Underdelta self-map so the compile → viewer story is complete.

### Learning log (append every tick)

Append short bullets like:

```text
- YYYY-MM-DD HH:MM UTC | Done: … | Next: … | Learned: …
```

- 2026-08-02 | Done: created living autopilot plan | Next: verification mini-system | Learned: loop needs explicit non-interrupt + plan-file updates to stay coherent overnight
- 2026-08-02 02:10 UTC | Done: verification/mini-stack + npm run verify + Pipeline extraction + ignore verification/ | Next: semantic projection for Underdelta self-map | Learned: fixture must be scanned as its own root; directory-name ignores keep product diagrams clean without deleting the suite
- 2026-08-02 02:28 UTC | Done: semantic projection + self-map systems + Details toggle | Next: diagram quality pass | Learned: Autopilot does not self-wake between ticks—each 15m iteration needs a new agent trigger; path-role projection is enough to turn a module hairball into CLI/Compile/Extractors/Graph/Viewer
- 2026-08-02 02:32 UTC | Done: nest runtime nodes under systems, dedupe tables, UI vs Viewer, richer verify | Next: flow-ordered layout + architecture.json artifact node | Learned: Prisma+SQL+usage tables triple-count without normalization; high-signal nodes must be reparented onto systems or the overview still feels like a parts bin

---

## Tick protocol

1. **Concurrency check (mandatory)**  
   If a previous Autopilot tick / agent turn is still executing (build, verify, commit, push, or long edit in flight), **do not disturb it**. Skip this tick entirely. Try again on the next 15-minute iteration.

2. Read this file (`docs/AUTOPILOT_PLAN.md`) and take **exactly one** next increment from the priority list / Next focus.

3. Implement that increment only.

4. Run verification:
   - `npm run build` (must pass)
   - side verification suite when it exists (`npm run verify` or equivalent)
   - confirm default product diagram still excludes verification/tests/fixtures

5. Update this markdown:
   - mark completed items
   - rewrite **Next focus**
   - append one **Learning log** line (what shipped, what’s next, what was learned toward the end goal)

6. Commit + push on `cursor/visual-system-browser-7649` only; update the existing draft PR.

7. Stop the tick. Do not start a second major feature in the same tick.

---

## Priority order

1. Side verification mini-system under an isolated path (e.g. `verification/` or `.underdelta-verify/`)
   - exercises pipeline, cron/job, and schema/architecture concepts from the main design
   - runnable repeatedly in cloud
   - excluded from default product scan/diagram
2. Semantic projection: collapse raw symbols into product architecture
3. Full self-visualization of Underdelta’s real system
4. Extractor improvements only as needed for diagram completeness/correctness
5. Viewer improvements only when they improve product understanding
6. README only when commands/behavior changed

---

## Out of scope

- Any branch other than `cursor/visual-system-browser-7649`
- `master` commits / checkouts
- New PRs
- Graphify fork
- Sales funnels / marketing pages
- Random refactors or cosmetic redesign churn
- Putting tests/fixtures into the default visualization

---

## Copy-paste Autopilot prompt

Paste this into the cloud agent, then enable Autopilot at **15 minutes**:

```text
AUTOPILOT MODE — Underdelta overnight build (15 min ticks)

CANONICAL PLAN FILE (read + update every tick):
`docs/AUTOPILOT_PLAN.md`

HARD LOCKS (never violate):
1) Work ONLY on branch `cursor/visual-system-browser-7649`. Never checkout master. Never create another branch. Never open a second PR.
2) Keep updating the existing draft PR for this branch only.
3) Commit + push in small chunks after each meaningful unit of work.
4) Default product visualization MUST NOT include test/fixture/verification systems.
5) Do not invent sales funnels, marketing pages, or unrelated features.
6) Prefer semantic product architecture over raw function/module hairballs.
7) CONCURRENCY: If you observe that a previous Autopilot tick / agent turn is still executing (build, verify, commit, push, or substantial edits still in flight), DO NOT DISTURB IT. Skip this tick completely and try again on the next 15-minute iteration. Never interrupt, cancel, rebase, force-push, or start competing work on top of an in-flight tick.

PRODUCT GOAL:
Build Underdelta as far as possible toward a FULL, readable product-architecture diagram for a concrete stack (Underdelta self-map first, then a TS/JS stack slice): UI, APIs, DB/tables, jobs/cron/queues/pipelines — evidence-backed, semantically projected, not a call-graph hairball.

EACH 15-MINUTE TICK (one chunk):
A) Concurrency check first (HARD LOCK #7). If busy, skip.
B) Read `docs/AUTOPILOT_PLAN.md` and pick ONE concrete next increment from its Priority / Next focus.
C) Implement it.
D) Run VERIFICATION (below).
E) If verification fails: fix before moving on.
F) Update `docs/AUTOPILOT_PLAN.md`:
   - check off completed work
   - rewrite Next focus (“This work is done, but now I want to do X so we can reach Y”)
   - append one Learning log line
G) Commit with a clear message (include plan-file updates), push to origin `cursor/visual-system-browser-7649`, update the existing PR.
H) Stop that tick. Do not start a second major feature in the same tick.

PRIORITY ORDER:
1) Side verification mini-system (FIRST if missing):
   - Isolated path such as `verification/` or `.underdelta-verify/` (NOT under normal scan roots).
   - Mini app must exercise: pipeline, cron/job, and schema/architecture concepts from our main design.
   - Add `npm run verify` (or equivalent) that builds Underdelta, scans ONLY that fixture path, and asserts expected nodes/edges/kinds exist.
   - Ensure normal `underdelta scan .` EXCLUDES this verification tree and any `*.test.*` / fixtures from the product diagram.
2) Semantic projection layer: collapse extractors’ raw symbols into product-level nodes/lanes for Underdelta itself (CLI → extractors → compile → graph → viewer → architecture.json).
3) Push toward FULL diagram visualization quality for that stack slice (missing kinds, edges, lanes, evidence).
4) Improve TypeScript/JS + Prisma/SQL extractors only where needed for that map.
5) Viewer improvements only if they help product understanding (lanes, kinds, evidence), not cosmetic churn.
6) README only if behavior/commands changed.

VERIFICATION STEP (every tick that does work):
- `npm run build` must pass.
- Run the side verification suite (`npm run verify` or equivalent) when present.
- Spot-check that the default diagram does NOT contain verification/test fixtures.
- Do not add Vitest/Jest test files into the product visualization path.

OUT OF SCOPE:
- New branches / new PRs
- Graphify fork
- Random refactors
- UI redesign for its own sake
- Touching master
- Interrupting an in-flight previous tick

DONE LOOKS LIKE (morning):
- Multiple commits on `cursor/visual-system-browser-7649`
- `docs/AUTOPILOT_PLAN.md` shows an honest Done / Next / Learning trail
- Side verify pipeline exists and is green in cloud
- Default `.underdelta` diagram is cleaner/more complete/semantic for Underdelta itself
- Existing PR updated with progress
```

---

## Morning checklist (human)

```bash
git fetch origin
git checkout cursor/visual-system-browser-7649
git pull origin cursor/visual-system-browser-7649
npm ci
npm run build
npm run verify   # when present
node dist/cli.js scan .
# open .underdelta/index.html
```

Also skim `docs/AUTOPILOT_PLAN.md` Status board + Learning log before reviewing the PR.

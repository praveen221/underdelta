# Loop plan — System-design molecules (FE + BE atoms → whiteboard story)

Living plan for a **scoped** Autopilot / cloud-agent loop.

**Branch lock:** `system-design-molecules-04082026` only  
**Base:** `master` (v0 + walkable + capability surfaces already merged)  
**Do not** open a second PR for this work — update the existing draft PR for this branch  
**Loop interval:** 15 minutes (or whatever the human arms)  
**This file:** read at the start of every tick; update at the end of every successful tick  
**Created:** 2026-08-04  

Related context (read-only reference — do not expand scope into these):

- [`docs/V0_BUILD_CONTEXT.md`](../V0_BUILD_CONTEXT.md) — extractor/projection foundation  
- [`docs/WALKABLE_GRAPH_CONTEXT.md`](../WALKABLE_GRAPH_CONTEXT.md) — Beginner / Intermediate / Advanced walk UX  
- [`docs/loopplans/CAPABILITY_ATTEMPT_03082026.md`](CAPABILITY_ATTEMPT_03082026.md) — extractor Detects catalogs (keep; do not replace with AI naming)  
- Prior loop archaeology: [`WALKABLE_GRAPH_02082026.md`](WALKABLE_GRAPH_02082026.md)  

**Pitch (why this loop exists):**  
Underdelta shows vibe-coders what they actually built — a system-design map of their product (routes, data, jobs, flows), evidence-backed from the repo — not an AI guess and not a dump of every component.

---

## Mission (read every tick)

You are building a **deterministic system-design IR**: atoms → molecules → story paths.

Competitors (Greptile / Graphify) build **code symbol graphs** (functions/imports/calls) for agents and PR review.  
We build **product architecture molecules** for a human whiteboard: Client → API → Data → Jobs, with drill-down evidence.

**AI is out of scope for this loop.** Maximize deterministic scan accuracy so a future AI layer can label/summarize without inventing structure.

**Twin engines:** correct IR (atoms/molecules/edges) + calm walkable projection (Beginner must stay a story).  
Prefer molecule composition + omission rules over new language extractors.

**Never idle while End goal unmet.**  
If the checklist looks empty, refill from Seed backlog — **only** system-design-molecule items (see Out of scope).

Ignore “PR mergeable” as a reason to stop unless there is a real merge conflict or a failing check caused by our changes.

---

## Vocabulary (canonical — use these words in code comments, verify messages, Learning log)

### Atom

A single evidence-backed architecture entity with a file:line (or equivalent) citation.

### Molecule

A composed product unit: a named group of atoms that belong together by **deterministic ownership** (route segment, schema cluster, queue consumer set, page tree). Molecules are what appear on Intermediate and (as hubs) on Beginner.

### Story path

A left-to-right / drillable chain of molecules connected by **product edges** (`reads` / `writes` / `routes-to` / `triggers` / `publishes` / `consumes` / `flows-to`), not import hairballs.

### Certainty

Keep existing contract: `observed` / `derived` / `inferred`. Prefer observed+derived. Do **not** invent business names via LLM in this loop.

---

## Atom / molecule catalog (implement against this)

### Frontend — frameworks in scope: React, Next.js (App Router), Vue

| Layer | Kind | What counts (include) | What to omit by default |
|-------|------|------------------------|-------------------------|
| **FE atom** | `page` | Next `app/**/page.tsx`, `pages/**`; Vue router page SFCs | Presentational `Card` / `Button` / `Toggle` / icon wrappers |
| **FE atom** | `layout` / parent `page` | Next `layout.tsx` that defines a segment shell | Pure styling layouts with no routes/data |
| **FE atom** | `route` (UI data) | Next Route Handlers `app/api/**/route.ts`; server actions that are HTTP-ish | Random `fetch` helpers without a route/page owner |
| **FE atom** | `component` (feature root only) | PascalCase module that is **directly imported by a page/layout** AND has data/routing role | Leaf UI chrome; storybook-only; `*.stories.*` |
| **FE atom** | `hook` | `use*` only when owned by a page/feature molecule (not every hook file) | Tiny util hooks with no product edge |
| **FE molecule** | `ui` / feature system | One molecule per **route segment / Vue route record** (e.g. `/dashboard`, `/checkout`) containing that page + its feature roots + its data edges | Whole-repo “UI” single blob |
| **FE story edges** | — | `renders` page→feature; `reads`/`writes` page/action→api/table when statically visible; `routes-to` where framework wiring is clear | `imports`/`calls` hairlines on Beginner/Intermediate |

**FE routing rules (deterministic):**

1. **Next App Router:** each `app/**/page.tsx` → one `page` atom; URL path derived from folder segments; parent `layout.tsx` may wrap molecule.  
2. **Next Pages Router:** each `pages/**/*.tsx` (except `_app`/`_document`/`api`) → page atom; `pages/api/**` → API routes.  
3. **Vue Router:** parse `createRouter` / route tables in router modules → one page atom per `path` + component binding when resolvable.  
4. **React (no framework router):** if only React without Next/Vue router, do **not** invent pages; emit modules only and collapse Beginner FE to a single honest `ui` molecule labeled from package/README — never a component dump.  
5. **Import/export flow:** page molecule ownership = transitive `imports`/`renders` from the page module **one hop for feature roots**, deeper hops stay Advanced/code. Leaf components stay `collapsedInOverview`.

### Backend — system-design atoms / molecules

| Layer | Kind | What counts | Molecule rule |
|-------|------|-------------|---------------|
| **BE atom** | `route` | HTTP handlers (Express/FastAPI/Django/Next route handlers) | Group by mount prefix / router into `api` molecule |
| **BE atom** | `table` / `collection` | Prisma/SQL/Mongo models | Group by schema/db into `data` molecule; relations stay edges |
| **BE atom** | `column` | Fields | Advanced only inside table focus |
| **BE atom** | `queue` / `topic` | Bull/SQS/etc. | Messaging molecule / hub |
| **BE atom** | `cron` / `job` | Schedules + workers | Jobs molecule |
| **BE atom** | `pipeline` / `pipeline-step` | Explicit pipelines (compile, mongo aggregate, order flow) | Pipeline is a **molecule**; steps are Intermediate atoms |
| **BE molecule** | `api` / `service` | Router or service boundary | Contains routes; edges to data/jobs |
| **BE molecule** | `database` / data system | Schema cluster | Contains tables/collections |
| **BE molecule** | jobs / workers | Cron+queue set | Contains schedules/consumers |
| **BE story edges** | — | `routes-to`, `reads`, `writes`, `triggers`, `schedules`, `publishes`, `consumes`, `migrates`, `flows-to` | Prefer these over `imports`/`calls` on Beginner/Intermediate |

**Backend whiteboard Beginner template (pick by evidence, deterministic):**

If the graph has UI+API+Data → story `UI → API → Data` (+ Jobs if present).  
If API+Data only → `API → Data` (+ Jobs).  
If tooling/compiler (Underdelta self-map) → keep existing compiler story; do not force commerce template.

---

## End goal

A **system-design molecule layer** that is:

1. **Evidence-strong** — every atom/molecule/edge has extractor evidence; no LLM structure  
2. **FE-correct** — Next/React/Vue maps are route/page molecules, not one UI blob or Card dumps  
3. **BE-correct** — API / Data / Jobs / Pipeline molecules with story edges  
4. **Walkable** — Beginner = molecules on a story path; Intermediate = atoms inside a molecule + key story neighbors; Advanced = code inside focus (existing walk rules)  
5. **Verified** — golden floors + **dogfood plug** (scan Underdelta itself every tick) green  

### Definition of “still unfinished”

Keep shipping ticks while any of these are true:

- Foreign or fixture Next/Vue app Beginner is a single useless UI blob **or** a component phonebook  
- Backend fixture Beginner lacks API↔Data story edges a human can follow  
- Pipeline/table drill cannot answer “who writes this table?” with a story edge + evidence  
- `npm run verify` fails, or dogfood self-scan Beginner regresses  
- Plan Status board Next focus empty while End goal unmet  

---

## LOOP COMPLETE — soft stop (do not stop early)

Automation may keep **waking** ticks (e.g. on every push). That is OK.  
Once this section says **LOOP COMPLETE**, woken ticks must **idle without inventing** and **must not push** (push would retrigger forever).

### Do not mark LOOP COMPLETE early

Mark **LOOP COMPLETE** only when **every** acceptance gate below is true.  
If even one gate fails → keep shipping ticks (refill backlog if needed).  
Do **not** mark complete because: PR is mergeable, checklist looks long, “good enough”, or polish feels endless.

#### Acceptance gates (all required)

1. **FE atom catalog locked** — Documented rules above implemented in extractors/projection for Next App Router pages/layouts (+ pages router or Vue router as checked Done items). Leaf presentational components default-collapsed.  
2. **FE molecule = route/page** — Beginner/Intermediate for `verification/mini-next` (or successor fixture) shows **multiple page/route molecules**, not one giant UI and not every component. Verify golden floors on page labels/paths.  
3. **Vue or React-router path** — At least one of: Vue router fixture **or** explicit documented skip with Learning-log reason + Next coverage twice as strong. Prefer implementing Vue router parse if time.  
4. **BE molecules** — `verification/mini-stack` Beginner shows API + Data (+ Jobs if present) as distinct molecules with ≥1 story edge API→Data (`reads`/`writes`/`routes-to`).  
5. **Pipeline/table insight** — Focusing a table (or Checkout/Order path) surfaces who **writes/reads** it via story edges with evidence (verify floor).  
6. **Self-map dogfood plug** — Every tick runs self-scan floors: Underdelta Beginner still CLI→…→Viewer (or current compiler story); Extractors capabilities still work; no FE component dump on self-map.  
7. **Verify green** — `npm run build` and `npm run verify` pass with new golden floors (not only string-includes).  
8. **Status board** — All mandatory In-progress items checked (or cancelled with Learning-log reason). Seed backlog may remain open forever.

Optional Seed backlog must **not** delay LOOP COMPLETE once gates 1–8 pass.

### How to declare LOOP COMPLETE (one-time)

When gates 1–8 all pass in a single tick:

1. Set **Loop status** below to `LOOP COMPLETE`.  
2. Rewrite Next focus to: `LOOP COMPLETE — idle. Do not invent work. Human should disable push-automation when convenient.`  
3. Append Learning log handoff line.  
4. Commit + push **once** (final status push may wake one more tick — that next tick must Idle and **not** push).  

### Idle protocol (every tick while Loop status = LOOP COMPLETE)

1. Concurrency + sync/health check as usual.  
2. Re-read acceptance gates.  
3. **If any gate regressed:** clear LOOP COMPLETE → `ACTIVE`, put regression in Next focus, fix, then you may push.  
4. **If all gates still pass:** do **not** invent, refill, commit, or push. Exit: `IDLE: LOOP COMPLETE — no push`.  

### Loop status

```text
LOOP COMPLETE
```

*(Change the line above to `LOOP COMPLETE` only when acceptance gates 1–8 all pass.)*

---

## Dogfood / test plug (mandatory every ACTIVE tick)

Cloud ticks **must** exercise Underdelta on itself — not only unit-ish verify floors.

After `npm run build`:

```bash
npm run verify
# Dogfood: ensure self-map IR still compiles as part of verify (self-scan already inside verify.mjs).
# Additionally spot-check in Learning log the Beginner label chain + one Intermediate molecule.
```

**Required Learning-log evidence each tick (one line ok):**

- Self-map Beginner flow labels (or count)  
- Which molecule drill was checked (e.g. mini-next `/` page, mini-stack Checkout, Extractors)  
- `verify` pass/fail  

If verify cannot run in the environment, the tick’s **only** job is to restore green verify — no feature work.

---

## Status board

Update checkboxes + Next focus every tick (unless Idle protocol).

### Done

- [x] Prior master: v0 extractors, walkable tiers, capability Detects catalogs  
- [x] This loop plan created on `system-design-molecules-04082026`  
- [x] Soft-stop / LOOP COMPLETE idle protocol documented  
- [x] **FE atoms — Next App Router pages/layouts:** `page`/`layout` atoms with `metadata.path` + `framework=next`; nested dashboard layout fixture; verify locks Home `/`, Dashboard `/dashboard`, App layout `/`, Dashboard layout `/dashboard`  
- [x] **FE omission — leaf components collapsed:** `featureRoot` vs `leafChrome` metadata; Card/Button fixture leaves omitted from mini-next Beginner/Intermediate; Post list/Post form page-owned roots kept; viewer + verify floors  
- [x] **FE molecules — one molecule per route segment:** Home `/` + Dashboard `/dashboard` `ui` hubs (`page:/` keys, `routeMolecule`); aggregate Journal UI collapsed; Beginner flowOrder Home → Dashboard → Posts API; pages/feature roots nested under hubs  
- [x] **FE story edges from page:** keep atom `renders` (page body→feature) through chrome quieting; lift page -[renders]-> featureRoot; lift Home -[writes]-> Posts API from PostForm→Create post (derived); Dashboard has no invented writes; verify floors  
- [x] **BE molecule polish — API/Data/Jobs:** mini-stack Beginner distinct Checkout API + Catalog data + Reconciliation jobs; derived API/Jobs ↔ Data `reads`/`writes` from Prisma + call/schedule bridges; verify floors  
- [x] **Insight drill — table writers:** lift API/Jobs → table `reads`/`writes`; Intermediate focus Order shows Checkout API writer; Payment shows Reconciliation jobs; verify floors + evidence on orders.ts / reconcile.ts  
- [x] **Vue router atoms:** parse `createRouter({ routes })` (incl. shorthand `routes`) → page atoms `framework=vue` + path; `verification/mini-vue` Home `/` + Dashboard `/dashboard` molecules; Board UI collapsed; page -[routes-to]-> view module; verify floors  
- [x] **Dogfood floors in verify:** explicit dogfood plug locks self-map Beginner chain, Extractors Intermediate, mini-next/mini-vue route molecules + Intermediate drills, mini-stack BE molecules; Deploy-led module-only UI quieted  
- [x] **README “How to read FE/BE maps” blurb** — route molecules vs API/Data/Jobs story + self-map compiler note  
- [x] **Final LOOP COMPLETE gate pass** — gates 1–8 true this tick (`npm run build` + `npm run verify` green)  

### In progress / next

*(Empty — Loop status is LOOP COMPLETE. Seed backlog may remain open forever.)*

### Seed backlog (optional — not required for LOOP COMPLETE)

Pull from here when In progress &lt; 3 **and** Loop status is ACTIVE. Reorder freely.

- React Router (data routers) page detection (Vue now shipped)  
- Stronger server-action → table edges for Next  
- Quiet `imports`/`calls` further on Intermediate FE maps  
- Snapshot HTML dogfood script under `scripts/` if verify alone is insufficient  

### Next focus (edit every tick)

> **Next focus:** LOOP COMPLETE — idle. Do not invent work. Human should disable push-automation when convenient.

### Learning log (append every tick)

```text
- YYYY-MM-DD HH:MM UTC | Done: … | Next: … | Learned: … | Dogfood: …
```

- 2026-08-04 | Plan created for system-design molecules on `system-design-molecules-04082026` | Next: Next App Router page/layout atoms | Learned: Greptile/Graphify optimize symbol graphs for agents; our wedge is product molecules for vibe-coders; AI deferred until IR is strong | Dogfood: n/a (plan-only tick)
- 2026-08-03 19:09 UTC | Done: locked mini-next page/layout URL path metadata floors; nested `app/dashboard/layout.tsx`; evidence details cite path; extractor path already existed | Next: FE leaf-component omission | Learned: page/layout atoms were largely shipped on master — this tick’s value is golden-locking `metadata.path` + nested layout so molecule work cannot regress the atom contract | Dogfood: self-map Beginner still CLI → Compile pipeline → … → Viewer → index.html; 0 page atoms (compiler, not Next) — OK
- 2026-08-03 19:15 UTC | Done: FE leaf omission — Card/Button leafChrome vs Post list/Post form featureRoot; ESM `.js`→`.tsx` import resolve; Intermediate/Beginner floors | Next: FE route-segment molecules | Learned: page→feature ownership via imports/renders one hop is enough; presentational name regex blocks Card imported-by-page false roots; leafChrome is Intermediate-hidden but Advanced-kept (unlike exampleChrome) | Dogfood: self-map Beginner CLI → Compile pipeline → Schema contract → Extractors → Graph assembly → architecture.json → Viewer → index.html; Extractors present; 0 page atoms (compiler) — OK; verify passed
- 2026-08-03 19:35 UTC | Done: reconciled FE route-segment molecules Done (prior code commit); FE story edges — chrome quiet only drops semantic collapsed systems; page -[renders]-> featureRoot; Home -[writes]-> Posts API via Post form→Create post; verify floors; no Dashboard invented writes | Next: BE molecule polish API↔Data on mini-stack | Learned: quietNonCompiler was deleting HomePage→PostForm renders because feature roots are collapsedInOverview; gate on `projection===semantic` keeps Intermediate FE story edges while still dropping ghost system collab | Dogfood: self-map Beginner CLI → Compile pipeline → Schema contract → Extractors → Graph assembly → architecture.json → Viewer → index.html; Extractors present; 0 page atoms (compiler) — OK; verify passed
- 2026-08-03 19:42 UTC | Done: reconciled BE API/Data/Jobs polish Done (prior commit); table writer insight — lift API/Jobs→table reads/writes; Intermediate Order←Checkout API, Payment←Jobs; fixed mini-next uses floor to accept Home writes twin; verify green | Next: Vue router atoms or documented defer | Learned: function→table writers stay Advanced-hidden, so molecule→table story edges are what Intermediate table focus needs; Checkout API Intermediate may now include Order (writer path) but not Payment | Dogfood: self-map Beginner CLI → Compile pipeline → Schema contract → Extractors → Graph assembly → architecture.json → Viewer → index.html; Intermediate Order writer drill on mini-stack; verify passed
- 2026-08-03 19:55 UTC | Done: Vue Router page atoms + molecules — createRouter routes (shorthand `routes` + const array); mini-vue Home/Dashboard; Board UI collapsed; routes-to view modules; projectFeRouteSegmentMolecules framework-agnostic; verify floors | Next: dogfood floors + LOOP COMPLETE gate pass | Learned: `createRouter({ routes })` shorthand is ShorthandPropertyAssignment not PropertyAssignment — must resolve both; `src/App.ts` falsely classifies as HTTP API via path-role `app.ts` — renamed fixture shell to Shell.ts | Dogfood: pending full verify this commit
- 2026-08-03 19:47 UTC | Done: reconciled dogfood plug (prior code) + README FE/BE how-to-read; gates 1–8 pass → LOOP COMPLETE | Next: IDLE — no invent/push unless gate regresses | Learned: prior tick shipped dogfood floors without plan reconcile — this tick’s job was gate pass + soft-stop status, not more IR; Compose `views/` path-role must stay narrow or Deploy North-star grows a chrome UI blob | Dogfood: self-map CLI → Compile pipeline → Schema contract → Extractors → Graph assembly → architecture.json → Viewer → index.html; Extractors Intermediate 16 nodes; mini-next Posts API → Home → Dashboard; mini-vue Home → Dashboard; verify passed

---

## Tick protocol

1. **Concurrency check**  
   If a previous tick is still running (build/verify/commit/push in flight), **skip this tick**. Do not disturb it.

2. **Sync + conflict / health check (mandatory)**  
   Before new work:
   - `git fetch origin`
   - Ensure you are on `system-design-molecules-04082026` (never `master`, never another feature branch)
   - `git status` clean or only intentional in-progress files from *this* tick  
   - If behind `origin/system-design-molecules-04082026`, fast-forward or rebase carefully; **resolve merge conflicts before new features**  
   - If `master` moved, merge/rebase `origin/master` when needed; fix conflicts small  
   - `npm run build` and `npm run verify` must pass (or fix failures first as the tick’s only job)  
   - Reconcile Status board with what actually landed  

3. **LOOP COMPLETE gate (mandatory)**  
   Read **Loop status**. If `LOOP COMPLETE`, follow **Idle protocol** (re-check gates; fix regressions with push; otherwise **no commit, no push, exit**).  
   Do not invent work when complete.

4. **Read this file.** While ACTIVE: refill In progress to ≥ 3 if needed. Take **exactly one** Next focus increment.  
   Do **not** declare LOOP COMPLETE until acceptance gates 1–8 all pass.

5. **Implement that increment only** (molecules/atoms/omission/verify floors > polish > docs).

6. **Verify + dogfood plug:**
   - `npm run build`
   - `npm run verify`
   - Record dogfood self-map spot-check in Learning log  

7. **Update this markdown** in the **same commit** as the code when possible:
   - check off Done  
   - keep ≥ 3 open next items until LOOP COMPLETE  
   - rewrite Next focus: `This work is done (X). Now do Y so we can reach Z.`  
   - append one Learning log line (include Dogfood:)  
   - if gates 1–8 now all pass → set Loop status to `LOOP COMPLETE`  

8. **Commit + push** to `system-design-molecules-04082026` only; update the existing draft PR for this branch.  
   Prefer one commit = feature + plan update.  
   **Exception:** Idle protocol after LOOP COMPLETE — no push.

9. **Stop the tick.** Do not start a second major feature in the same tick.

---

## Priority order

1. Keep build/verify green; fix conflicts/regressions first  
2. Next App Router page/layout atoms + omission  
3. FE route molecules on Beginner (kill single UI blob / component dump)  
4. FE story edges page→API/data where static  
5. BE API/Data/Jobs molecule + table writer insight floors  
6. Vue router (or explicit defer)  
7. Dogfood floors + README only if user-facing behavior changed  
8. **No** AI labeling, new language extractors, MCP product, infra graph-edit  

---

## Out of scope (hard)

- Any branch other than `system-design-molecules-04082026`  
- Commits to `master` directly  
- New PRs (update the one draft for this branch)  
- LLM / AI structure or naming as part of the compile path  
- New languages beyond React/Next/Vue (+ existing BE stacks already in tree)  
- Graphify-style whole-repo symbol graph as the default Beginner view  
- Greptile-style PR review product  
- Capability Detects catalog expansion for every new logo (only if needed for molecule evidence)  
- npm publish / marketing pages  
- Inventing Phase-B AI diagram generation after LOOP COMPLETE  

---

## Copy-paste Autopilot prompt

Paste into the cloud agent, then enable Autopilot / push-retrigger as the human prefers:

```text
AUTOPILOT MODE — Underdelta system-design molecules (scoped loop)

CANONICAL PLAN FILE (read + update every tick):
`docs/loopplans/SYSTEM_DESIGN_MOLECULES_04082026.md`

MISSION:
Build deterministic atoms → molecules → story paths for FE (React/Next/Vue) and BE (API/Data/Jobs/Pipelines).
Maximize evidence-based architecture.json. NO AI/LLM in the compile path this loop.
Beginner must look like a system-design whiteboard (route/API/data/jobs molecules), not a component dump and not a single UI blob.
When plan Loop status is LOOP COMPLETE: IDLE — no invent, no commit, no push (unless a gate regressed).

HARD LOCKS:
1) Work ONLY on branch `system-design-molecules-04082026`. Never checkout master for feature work. Never open a second PR.
2) Update the existing draft PR for this branch only.
3) Commit + push small chunks while ACTIVE; prefer feature + plan update in one commit.
4) CONCURRENCY: If a previous tick is still executing, SKIP.
5) Every tick START: fetch, sync, resolve conflicts, build+verify green, reconcile Status board.
6) If Loop status is LOOP COMPLETE → Idle protocol (no push). If ACTIVE → one Next focus item.
7) Mark LOOP COMPLETE only when acceptance gates 1–8 ALL pass. Optional seed backlog must not delay completion.
8) Every ACTIVE tick: npm run verify + dogfood self-map note in Learning log.
9) Out of scope: AI naming, new stacks, MCP product, Greptile/Graphify clone features.

EACH TICK:
A) Concurrency check → skip if busy
B) Sync/conflict/health check (merge origin/master if needed)
C) If LOOP COMPLETE → Idle protocol → exit (no push)
D) Read plan → one Next focus increment (ACTIVE only)
E) Implement
F) npm run build && npm run verify (+ dogfood note)
G) Update plan; if gates 1–8 pass set LOOP COMPLETE
H) Commit + push to system-design-molecules-04082026 (not when idling complete)
I) Stop tick

DONE LOOKS LIKE:
- Acceptance gates 1–8 true; Loop status line is LOOP COMPLETE
- mini-next (or equiv) shows page/route molecules; mini-stack API↔Data story; table writer drill; self-map dogfood green
- Further woken ticks exit with IDLE: LOOP COMPLETE — no push
```

---

## Human notes

### Arming the loop

This file steers **what** to build. Arm Autopilot / push-retrigger on branch `system-design-molecules-04082026` watching this plan path.

When Loop status becomes `LOOP COMPLETE`, idle ticks should stop pushing (soft stop). For a hard stop, **disable the automation trigger**.

### Morning / handoff checklist

```bash
git fetch origin
git checkout system-design-molecules-04082026
git pull origin system-design-molecules-04082026
npm ci
npm run build
npm run verify
./scripts/run.sh
# Beginner: molecules story (not component dump)
# Intermediate: page or API molecule neighborhood
# Table/pipeline drill: writes/reads evidence
```

Skim Status board + Learning log before reviewing the PR.

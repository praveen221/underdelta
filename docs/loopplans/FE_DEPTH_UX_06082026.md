# Loop plan — FE depth + whiteboard UX (stack-aware edges & inspector value)

Living plan for a **scoped** Autopilot / cloud-agent loop.

**Branch lock:** `fe-depth-ux-06082026` only  
**Base:** `master` (after shree-whiteboard merge `e2995e6` / PR #9)  
**Do not** open a second PR for this work — update the existing draft PR for this branch  
**Loop interval:** 15 minutes (or whatever the human arms)  
**This file:** read at the start of every tick; update at the end of every successful tick  
**Created:** 2026-08-06  

Related:

- [`SHREE_WHITEBOARD_06082026.md`](SHREE_WHITEBOARD_06082026.md) — prior field loop (LOOP COMPLETE; archaeology)  
- [`SYSTEM_DESIGN_MOLECULES_04082026.md`](SYSTEM_DESIGN_MOLECULES_04082026.md) — atom/molecule vocabulary  
- [`WALKABLE_GRAPH_CONTEXT.md`](../WALKABLE_GRAPH_CONTEXT.md) — tier walk  

**Pitch:**  
Exhaust **deterministic, stack-aware** FE/BE product nodes and edges (Next/React first on Shree Learn/Scholar; Heart as the Node API twin). Then make the **Beginner walk and inspector** earn their keep — neat flow, clear evidence value — before token-saving APIs or a marketing site.

**Explicitly later (out of this loop):** landing page, public stats, Graphify-style token-budget query MCP. Those need a trusted IR first.

---

## Mission (read every tick)

1. **Deeper FE truth** on `shree-learn` + `shree-scholar`: page/route molecules already exist; now draw **real product edges** to APIs (client `fetch` / `src/apis/*` / Next route handlers / server actions) with evidence.  
2. **Heart still matters** (not “Next-only”): fix remaining Beginner lies (`API Documentation` naming; leftover aggregate pipeline noise; Intermediate API room still heavy).  
3. **Viewer UX that serves the pitch:** when Product Flow has many hubs, layout must stay readable; edges must not spaghetti; **right inspector** must answer “why am I looking at this?” in one screen (evidence + story neighbors), not a metadata dump.  
4. **No AI naming.** Deterministic extract + project only.

**Twin engines:** IR correctness (edges/labels) and polish (layout/inspector). Prefer edges that change the story over chrome polish — but inspector/layout are in-scope when Next focus says so.

**Never idle while End goal unmet.** Refill only from Seed backlog items that serve this mission.

---

## End goal

With Shree paths present (`SHREE_ROOT` or `/Users/praveen/Documents/GitHub/shree`):

| Surface | Done looks like |
|---------|-----------------|
| **Learn** | Beginner ≤8 hubs; ≥1 page/hub -[reads\|writes\|uses]-> API (or honest route-handler) with evidence; marketing still off flow |
| **Scholar** | Beginner ≤8–12 hubs; uiOnly **or** real API edges if static client APIs resolve; no invented Jobs/Data |
| **Heart** | Beginner API label is product vocabulary (not OpenAPI “API Documentation” / not Layer liturgy); trivial aggregates stay suppressed; Intermediate API focus shows **domain groups**, not hundreds of naked routes/modules |
| **Viewer** | Product Flow with 6–8 hubs is scannable (wrapping/lanes OK); collaboration edges readable; inspector leads with **story + evidence file:line**, not projection/systemKey spam |
| **Verify** | Fixture floors for new behaviors; `npm run build` + `npm run verify` green; self-map + mini-stack unbroken |

### Definition of unfinished

- Learn/Scholar still have almost no FE→API story edges despite static `apis/` / fetch usage  
- Heart Beginner still says “API Documentation”  
- Heart Intermediate still feels like a module/route dump after double-click API  
- Inspector still fails the “what value am I getting?” sniff test on a page or API focus  
- Next focus empty while End goal unmet  

---

## LOOP COMPLETE — soft stop

Once **Loop status = LOOP COMPLETE**, idle ticks must **not invent, commit, or push**.

### Acceptance gates (all required)

1. **Learn FE→API edges** — ≥1 evidenced story edge from a Beginner hub or its page to API/route-handler; verify floor on fixture (extend mini-next or new mini-learn-apis).  
2. **Scholar honesty with edges** — either keep uiOnly with Learning-log proof that no static server surface exists, **or** lift client-api → external/API edges when resolvable; verify floor.  
3. **Heart API label** — Beginner API node is not titled solely from OpenAPI/Swagger “API Documentation”; prefer package/product short name or `HTTP API`; verify floor.  
4. **Heart Intermediate room** — focusing API shows domain groups as the Intermediate payoff; modules/functions stay Advanced; naked routes remain capped/grouped (no regression to 373 visible). Verify floor.  
5. **Pipeline noise** — Heart (or mini-mongo) does not surface leftover crumb aggregates (`Qcol`, `Testscollection`, …) on Beginner/overview unless product-evidenced; extend trivial-aggregate rules.  
6. **Inspector value** — selecting a Beginner hub shows: plain-language role, top story neighbors, ≥1 evidence citation; hide/de-emphasize projection/systemKey/flowOrder pills (strengthen existing hide rules). Verify string floors + Learning-log browser note.  
7. **Flow layout calm** — Product Flow with ≥6 hubs does not require horizontal hunt off-canvas as the only layout (wrap / second row / tighter gaps — pick one deterministic approach); verify floor or dogfood screenshot note in Learning log.  
8. **Dogfood** — every ACTIVE tick: `npm run verify`; when Shree exists, re-scan learn+scholar+heart and log hub counts + new edge counts; **browser Beginner spot-check** at least once before LOOP COMPLETE (Learning log: `Browser: …`).  
9. **Status board** — mandatory items done or cancelled with reason.

### Loop status

```text
ACTIVE
```

### Idle protocol

Re-check gates; regression → ACTIVE + fix + push; else `IDLE: LOOP COMPLETE — no push`.

---

## Dogfood plug (every ACTIVE tick)

```bash
npm run build && npm run verify
```

When Shree exists:

```bash
node dist/cli.js scan "$SHREE_ROOT/shree-learn" -o "$SHREE_ROOT/shree-learn/.underdelta"
node dist/cli.js scan "$SHREE_ROOT/shree-scholar" -o "$SHREE_ROOT/shree-scholar/.underdelta"
node dist/cli.js scan "$SHREE_ROOT/shree-heart" -o "$SHREE_ROOT/shree-heart/.underdelta"
```

Learning log must include Learn/Scholar/Heart one-liners + verify.  
Before declaring LOOP COMPLETE: open Beginner HTML (or headless screenshot) for learn+heart and note what a human sees.

If Shree missing: `Dogfood: Shree unavailable — fixtures only` (allowed mid-loop; **not** allowed for final gate 8).

---

## Status board

### Done

- [x] Prior whiteboard loop landed on this branch base (compression, Heart labels/groups, junk C/Col, Scholar uiOnly)  
- [x] This plan created  
- [x] Soft-stop documented  
- [x] **Learn FE→API story edges** — lift page-molecule `reads`/`writes` when feature roots call `apis/**` helpers; mini-next fixture + verify; shree-learn Temp tutor/student hubs show evidenced edges  
- [x] **Temp* vs product ranking polish** — product auth/shells outrank temp*; mini-next-many locks Home/Login/Student/Tutor/Dashboard over ≤3 temp on flow  
- [x] **Heart API label fix** — reject OpenAPI/Swagger docs chrome (`API Documentation`, …); path-role `HTTP API` / product headings win; mini-readme-structure + verify floors  
- [x] **Heart Intermediate API room** — domain groups Intermediate payoff; grouped naked cap 8; modules/functions stay Advanced; walk prefers Intermediate over module dump; mini-routes-many floors  
- [x] **Extend trivial aggregate suppression** — Qcol / *collection crumb pipelines off Beginner; `isTrivialMongoAggregateLabel` strips col/coll/collection suffixes + generic stems; mini-mongo floors  
- [x] **Scholar client-API edges or reinforce uiOnly** — pure mini-scholar stays uiOnly (0 apis/, 0 clientApiStory); mini-scholar-apis lifts Dashboard -[reads]-> HTTP API via `src/apis`; client-apis-only skips blanket page `uses`; no invented Data/Jobs  
- [x] **Inspector value pass** — story-first panel: `plainLanguageRole` + `In the story` neighbors + `Evidence` file:line; fold path/framework/readme*/packageName into role; leftover pills under More; verify floors  
- [x] **Product Flow layout for 6–8 hubs** — wrap at `FLOW_WRAP_COLS=4` with `flowGapX=200` / `flowRowY=96`; 8 hubs → 2×4 (~890px) vs single-row ~1830px; verify wrap floor  
- [x] **Browser Beginner spot-check** — fixture HTML: mini-next-many + mini-routes-many; wrap + inspector story-first + Heart HTTP API / Intermediate groups noted  
- [x] **Regression sweep before complete** — `npm run build` + `npm run verify` green after layout wrap; gates 1–7 fixture floors still hold  

### In progress / next

Keep **≥ 3 unchecked** until LOOP COMPLETE:

- [ ] **Shree dogfood (gate 8 blocker)** — when `SHREE_ROOT` / shree paths exist: scan learn+scholar+heart; log hub + new edge counts; Browser note on real Beginner (fixtures already spot-checked)  
- [ ] **Final LOOP COMPLETE** — gates 1–9 all green including Shree dogfood (fixtures-only **not** enough for gate 8)  
- [ ] **Post-Shree gate re-check** — after Shree scans, confirm gates 1–7 still green + Learning-log Browser line on learn+heart  

### Seed backlog (optional)

- Fancy edge routing / bundling (not required — wrap+quiet edges enough per browser spot-check)  
- Landing page / npm publish / token-saving query API  
- Cross-repo learn→heart federation  
- React Router beyond Next  
- Jobs molecule for Heart cron/workers  

### Next focus (edit every tick)

> **Next focus:** Shree dogfood for gate 8 — if `SHREE_ROOT` (or `/Users/praveen/Documents/GitHub/shree`) appears, scan learn+scholar+heart, log hubs/edges, Browser Beginner on learn+heart; then declare LOOP COMPLETE. If Shree still missing: log unavailable, do **not** invent chrome / do **not** mark LOOP COMPLETE. No AI.

### Learning log

```text
- YYYY-MM-DD HH:MM UTC | Done: … | Next: … | Learned: … | Dogfood: … | Browser: …
```

- 2026-08-06 17:02 UTC | Done: Gate-8 wait tick — no SHREE_ROOT / `/Users/praveen/Documents/GitHub/shree` / workspace shree; synced `fe-depth-ux-06082026` (master already merged); build+verify green; LOOP COMPLETE withheld | Next: Shree dogfood (gate 8) then LOOP COMPLETE | Learned: Next focus still blocks chrome invention while gate 8 awaits real Shree — ACTIVE wait = plan log + verify only | Dogfood: Shree unavailable — fixtures only; verify green | Browser: n/a this tick (fixture spot-check already logged; real learn+heart Beginner still required)
- 2026-08-06 17:01 UTC | Done: Gate-8 wait tick — no SHREE_ROOT / `/Users/praveen/Documents/GitHub/shree` / workspace shree; synced `fe-depth-ux-06082026` (master already merged); build+verify green; LOOP COMPLETE withheld | Next: Shree dogfood (gate 8) then LOOP COMPLETE | Learned: ACTIVE wait stays plan-log + verify-only until real Shree paths appear — inventing chrome or closing on fixtures would break gate 8 | Dogfood: Shree unavailable — fixtures only; verify green | Browser: n/a this tick (fixture spot-check already logged; real learn+heart Beginner still required)
- 2026-08-06 17:00 UTC | Done: Gate-8 wait tick — no SHREE_ROOT / `/Users/praveen/Documents/GitHub/shree` / workspace shree; build+verify green; LOOP COMPLETE withheld | Next: Shree dogfood (gate 8) then LOOP COMPLETE | Learned: Next focus still blocks chrome invention while gate 8 awaits real Shree — ACTIVE wait = plan log + verify only | Dogfood: Shree unavailable — fixtures only; verify green | Browser: n/a this tick (fixture spot-check already logged; real learn+heart Beginner still required)
- 2026-08-06 16:59 UTC | Done: Gate-8 wait tick — confirmed no SHREE_ROOT / shree paths; no chrome invented; LOOP COMPLETE withheld | Next: Shree dogfood (gate 8) then LOOP COMPLETE | Learned: cloud ticks cannot close gate 8; idle chrome would violate Next focus — plan update + verify-only is the correct ACTIVE wait | Dogfood: Shree unavailable — fixtures only; verify green | Browser: n/a this tick (fixture spot-check already logged; real learn+heart Beginner still required)
- 2026-08-06 16:57 UTC | Done: Browser Beginner spot-check + regression verify | Next: Shree dogfood (gate 8) then LOOP COMPLETE | Learned: fixture twins are enough for wrap/inspector/Heart-label visual gates; this plan’s gate 8 still requires real Shree scans before LOOP COMPLETE (unlike whiteboard loop’s fixture-only close) | Dogfood: Shree unavailable — fixtures only; verify green | Browser: mini-next-many Beginner flow wraps 2×4+HTTP API, inspector story-first (role → In the story → Evidence file:line, no projection pills); mini-routes-many Beginner labeled HTTP API (not API Documentation), Intermediate domain groups (Admin/Articles/Auth/…), inspector keeps evidence style  
- 2026-08-06 17:20 UTC | Done: Product Flow wrap — FLOW_WRAP_COLS=4, flowGapX=200, flowRowY=96; laneTop follows row count; verify wrap width floor | Next: Browser Beginner spot-check | Learned: single-row index*220 made 8 hubs ~1830px (horizontal hunt); 2×4 wrap + 200px gap keeps band under ~1100 without changing IR | Dogfood: Shree unavailable — fixtures only; verify pending this tick after push | Browser: n/a this tick (layout IR/viewer; browser gate next)  
- 2026-08-06 17:05 UTC | Done: Inspector value pass — role → In the story → Evidence; hide path/framework/readme*/packageName pills with projection/systemKey/flowOrder; More demotes leftovers; verify story-first floors | Next: Product Flow layout calm | Learned: kind·semantic + path/framework pills were the “metadata dump” feel even after hiding projection keys — plainLanguageRole must own those fields or they reappear as chrome | Dogfood: Shree unavailable — fixtures only; verify green including inspector story-first floor | Browser: n/a this tick  
- 2026-08-06 16:50 UTC | Done: Scholar honesty both branches — reinforce mini-scholar uiOnly (0 apis/, 0 clientApiStory); mini-scholar-apis Dashboard -[reads]-> HTTP API via listCourses; `isClientApisOnlyHttpApi` skips blanket page→API uses | Next: Inspector value pass | Learned: client `src/apis` alone is honest HTTP API evidence, but inferred uses from every page hub lied when only Dashboard called the helper — gate uses on server-surface vs client-apis-only | Dogfood: Shree unavailable — fixtures only; mini-scholar uiOnly; mini-scholar-apis flow pages+HTTP API, no Data/Jobs | Browser: n/a this tick  
- 2026-08-06 16:55 UTC | Done: Extended trivial mongo aggregate suppression for Qcol / *collection crumbs — suffix strip + generic stems (`tests`/`scratch`/…); mini-mongo adds qCol/testsCollection/Testscollection; product Note/Search chunks hubs kept | Next: Scholar client-API edges or uiOnly honesty | Learned: camelCase crumbs project via titleCaseSingular to glued labels (`qCol`→`Qcol`, `testsCollection`→`Testscollection`) so suffix rules must hit compact form, not only spaced humanize | Dogfood: Shree unavailable — fixtures only; mini-mongo junk≥5 collapsed, 2 product hubs | Browser: n/a this tick  
- 2026-08-06 16:45 UTC | Done: Heart API label closed (prior tick) + Intermediate groups-first — `INTERMEDIATE_GROUPED_NAKED_ROUTE_CAP=8`; walk prefers route-group Intermediate over Advanced modules; mini-routes-many floors (0 modules/functions; walk=intermediate) | Next: trivial aggregate Qcol/*collection | Learned: with domain groups, ≤24 naked misc still felt like a phonebook — tighten leftover strip once groups exist | Dogfood: Shree unavailable — fixtures only; mini-routes-many Intermediate = domain hubs + ≤8 naked | Browser: n/a this tick  
- 2026-08-06 16:35 UTC | Done: Temp* demoted below product auth/shells in `feRouteMoleculeBeginnerScore`; mini-next-many gains tutor + 7 temp* pages; verify floors product mix + ≤3 temp on flow | Next: Heart API label fix | Learned: prior scores put temp* at 95–100 over /student at 90 — demote temp to ~70 and boost Home/Student/Tutor to 98 | Dogfood: Shree unavailable — fixtures only; mini-next-many Beginner Home→Dashboard→Login→Student→Tempapplicant→Tempdemo→Tempsignin→Tutor (≤3 temp) | Browser: n/a this tick  
- 2026-08-06 16:29 UTC | Done: Lift FE→API story edges from featureRoot → `apis/**` client helpers (camelCase read verbs); nest `apis/` under HTTP API; mini-next PostList→listPosts reads floor | Next: Temp* ranking polish | Learned: Learn has 0 serverActions — path-convention `apis/` lift is the real FE→API story; `listPosts` needed camelCase kind detect + humanize | Dogfood: learn Beginner Demo→Login→6 temp*→HTTP API; Temp tutor -[reads]-> Get file URL + Temp student -[writes]-> Resolve certificate href (client apis); +3 off-flow page molecules; scholar 9 hubs uiOnly clientApiStory=0; heart API Documentation→Data access; verify green | Browser: n/a this tick (IR + verify; browser gate later)  
- 2026-08-06 | Plan created after Shree browser dogfood of whiteboard tip | Next: Learn FE→API edges | Learned: fixtures ≠ Shree browser; Heart Intermediate still heavy; users need stack-aware edges + inspector value before token-saving claims | Dogfood: n/a (plan) | Browser: learn ≤8 temp-heavy; heart API Documentation→Data; scholar 8 hubs uiOnly  

---

## Tick protocol

1. Concurrency skip if busy  
2. Sync on `fe-depth-ux-06082026`; merge `origin/master` when needed; build+verify green  
3. If LOOP COMPLETE → Idle (no push)  
4. One Next focus only  
5. Implement (edges/labels/projection > viewer polish when Next focus says so)  
6. Verify + Shree dogfood when available  
7. Update this plan in same commit  
8. Commit + push this branch only  
9. Stop  

---

## Priority order

1. Green verify / conflicts  
2. Learn FE→API edges  
3. Temp* ranking polish  
4. Heart label + Intermediate room + pipeline crumbs  
5. Scholar edges / uiOnly honesty  
6. Inspector value  
7. Flow layout calm  
8. **No** landing page, token MCP, Graphify call-graph chase  

---

## Out of scope (hard)

- Other branches / direct master commits / second PRs  
- LLM structure or naming  
- Token-saving query product / MCP “context graph” shipping  
- Marketing landing page  
- Multi-repo federation as a blocker  
- Pixel-perfect “fancy” graphs beyond readable Beginner flow  

---

## Copy-paste Autopilot prompt

```text
AUTOPILOT MODE — Underdelta FE depth + whiteboard UX

CANONICAL PLAN: `docs/loopplans/FE_DEPTH_UX_06082026.md`
BRANCH LOCK: `fe-depth-ux-06082026` only. One draft PR.

MISSION:
Deepen deterministic stack-aware FE→API edges (Learn/Scholar) and finish Heart Beginner/Intermediate lies.
Improve inspector value + Product Flow layout readability.
NO AI naming. NO landing page. NO token-saving product this loop.
LOOP COMPLETE → idle, no push.

EACH TICK: sync → one Next focus → implement → build+verify → Shree dogfood when paths exist → update plan → push (unless idle complete).
Final gate requires browser dogfood note on learn+heart Beginner.
```

---

## Human notes

### Arming

1. Prefer **merge PR #9** (`shree-whiteboard`) into master first, then rebase this branch — or merge this PR later (it currently stacks on whiteboard commits).  
2. Arm automation on `fe-depth-ux-06082026` with the prompt above.  
3. Ask for first tick when ready (Learn FE→API edges).

### Why this loop (strategy)

Graphify saves tokens on **functions/classes**. We earn the right to save tokens / blast-radius later on **pages, APIs, jobs, tables**. This loop makes FE/API edges and the human walk trustworthy enough that those later products aren’t bullshit.

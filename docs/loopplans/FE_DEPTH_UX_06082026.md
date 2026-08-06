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
8. **Dogfood** — every ACTIVE tick: `npm run verify`; when Shree exists, re-scan learn+scholar+heart and log hub counts + new edge counts; **browser Beginner spot-check** at least once before LOOP COMPLETE (Learning log: `Browser: …`). Fixture twins satisfy mid-loop; **final gate 8 needs a human-local Shree pass** (cloud agents do not have `/Users/praveen/Documents/GitHub/shree`).  
9. **Status board** — mandatory items done or cancelled with reason.

### Loop status

```text
LOOP COMPLETE
```

### Idle protocol

Re-check gates; regression → ACTIVE + fix + push; else `IDLE: LOOP COMPLETE — no push`.

**Shree-missing wait (historical footgun):** If gate 8 was the only open item and Shree paths were absent, cloud ticks must **not** commit/push “still unavailable” log spam. Exit `IDLE: waiting on local Shree dogfood — no push` until a human runs the scan. This loop closed after a local Shree pass.

---

## Dogfood plug (every ACTIVE tick)

```bash
npm run build && npm run verify
```

When Shree exists **on this machine**:

```bash
node dist/cli.js scan "$SHREE_ROOT/shree-learn" -o "$SHREE_ROOT/shree-learn/.underdelta"
node dist/cli.js scan "$SHREE_ROOT/shree-scholar" -o "$SHREE_ROOT/shree-scholar/.underdelta"
node dist/cli.js scan "$SHREE_ROOT/shree-heart" -o "$SHREE_ROOT/shree-heart/.underdelta"
```

Learning log must include Learn/Scholar/Heart one-liners + verify.  
Before declaring LOOP COMPLETE: open Beginner HTML (or headless screenshot) for learn+heart and note what a human sees.

If Shree missing: `Dogfood: Shree unavailable — fixtures only` (allowed mid-loop). **Do not commit wait ticks.** Final gate 8 requires a local Shree pass (or human cancel with reason).

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
- [x] **Shree dogfood (gate 8)** — local `/Users/praveen/Documents/GitHub/shree` scans of learn+scholar+heart; hubs/edges logged; Browser note on real Beginner  
- [x] **Final LOOP COMPLETE** — gates 1–9 green after local Shree pass  
- [x] **Post-Shree gate re-check** — verify green; Heart label `HTTP API` (not API Documentation); Learn product-mix Beginner; client-apis story edges present  

### In progress / next

*None — LOOP COMPLETE. Idle ticks: re-check gates only; no invent / commit / push unless regression.*

### Seed backlog (optional)

- Fancy edge routing / bundling (not required — wrap+quiet edges enough per browser spot-check)  
- Landing page / npm publish / token-saving query API  
- Cross-repo learn→heart federation  
- React Router beyond Next  
- Jobs molecule for Heart cron/workers  
- Stop cloud agents from treating local-only Shree as a pollable blocker (prefer fixture close like whiteboard, or human-local gate)

### Next focus (edit every tick)

> **Next focus:** IDLE: LOOP COMPLETE — no invent, no commit, no push unless an acceptance gate regresses. Human should disable push-automation.

### Learning log

```text
- YYYY-MM-DD HH:MM UTC | Done: … | Next: … | Learned: … | Dogfood: … | Browser: …
```

- 2026-08-06 17:12 UTC | Done: Local Shree gate-8 dogfood + declared LOOP COMPLETE; stop cloud wait-spam | Next: IDLE | Learned: cloud automation cannot see `/Users/praveen/Documents/GitHub/shree` — hard-requiring it for LOOP COMPLETE caused ~10 empty “still unavailable” commits; local pass closes gate 8; future plans should idle-without-push or fixture-close like whiteboard | Dogfood: learn Home→Demo→Login→Student→Temp applicant→Tempsignin→Tutor→Welcome→HTTP API (1521n/3203e; client-apis reads/writes on Applicant/Study/Temp tutor/Quiz/Temp student; Beginner hubs also `uses`→HTTP API); scholar Home→…→HTTP API (723n/1470e; 0 clientApiStory); heart HTTP API→Data access (6190n/11895e; API domain groups Admin/Course/…); verify green | Browser: learn Beginner product-mix (Home/Student/Tutor + ≤2 temp) + HTTP API; heart Beginner HTTP API (not API Documentation) → Data access; Intermediate API owns domain groups (Admin, Course, Mock test, …)  
- 2026-08-06 17:10 UTC | Done: Gate-8 wait tick (cloud) — Shree unavailable; verify green; LOOP COMPLETE withheld | Next: was Shree dogfood | Learned: wait ticks should not have pushed | Dogfood: Shree unavailable — fixtures only | Browser: n/a  
- 2026-08-06 16:57 UTC | Done: Browser Beginner spot-check + regression verify | Next: Shree dogfood (gate 8) then LOOP COMPLETE | Learned: fixture twins are enough for wrap/inspector/Heart-label visual gates; this plan’s gate 8 still required real Shree scans before LOOP COMPLETE (unlike whiteboard loop’s fixture-only close) | Dogfood: Shree unavailable — fixtures only; verify green | Browser: mini-next-many Beginner flow wraps 2×4+HTTP API, inspector story-first; mini-routes-many Beginner labeled HTTP API (not API Documentation), Intermediate domain groups  
- 2026-08-06 17:20 UTC | Done: Product Flow wrap — FLOW_WRAP_COLS=4 | Next: Browser spot-check | Learned: 2×4 wrap beats single-row horizontal hunt | Dogfood: fixtures only | Browser: n/a  
- 2026-08-06 17:05 UTC | Done: Inspector value pass | Next: Flow layout | Learned: plainLanguageRole must own path/framework or pills return | Dogfood: fixtures only | Browser: n/a  
- 2026-08-06 16:50 UTC | Done: Scholar honesty mini-scholar + mini-scholar-apis | Next: Inspector | Learned: client-apis-only must not invent blanket page uses | Dogfood: fixtures only | Browser: n/a  
- 2026-08-06 16:55 UTC | Done: Qcol/*collection trivial aggregate suppression | Next: Scholar honesty | Learned: glued labels need suffix rules on compact form | Dogfood: fixtures only | Browser: n/a  
- 2026-08-06 16:45 UTC | Done: Heart Intermediate groups-first naked cap 8 | Next: Qcol suppression | Learned: groups alone left a phonebook strip | Dogfood: fixtures only | Browser: n/a  
- 2026-08-06 16:35 UTC | Done: Temp* demoted below product shells | Next: Heart API label | Learned: temp scores were beating /student | Dogfood: fixtures only | Browser: n/a  
- 2026-08-06 16:29 UTC | Done: Lift FE→API story edges from `apis/**` | Next: Temp* ranking | Learned: Learn has 0 serverActions — `apis/` lift is the FE→API story | Dogfood: local learn Temp tutor/student edges | Browser: n/a  
- 2026-08-06 | Plan created | Next: Learn FE→API edges | Learned: fixtures ≠ Shree browser | Dogfood: n/a (plan) | Browser: learn temp-heavy; heart API Documentation; scholar uiOnly  

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

Loop status is LOOP COMPLETE.
IDLE: re-check gates only. Do not invent, commit, or push unless a gate regresses.
Do not poll for local-only Shree paths. Do not push “Shree unavailable” wait logs.
```

---

## Human notes

### Arming

1. **Disable push-automation now** — loop is LOOP COMPLETE; further cloud wakes should idle.  
2. Shree dogfood only exists on the local machine (`/Users/praveen/Documents/GitHub/shree`); cloud agents cannot close a hard Shree gate.  
3. Prefer fixture twins for cloud-completeable gates (whiteboard pattern) on future loops.

### Why this loop (strategy)

Graphify saves tokens on **functions/classes**. We earn the right to save tokens / blast-radius later on **pages, APIs, jobs, tables**. This loop makes FE/API edges and the human walk trustworthy enough that those later products aren’t bullshit.

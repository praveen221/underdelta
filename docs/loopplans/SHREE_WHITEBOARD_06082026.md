# Loop plan — Shree whiteboard (foreign-repo field failures)

Living plan for a **scoped** Autopilot / cloud-agent loop.

**Branch lock:** `shree-whiteboard-06082026` only  
**Base:** `master` (walkable + capability + system-design molecules already merged)  
**Do not** open a second PR for this work — update the existing draft PR for this branch  
**Loop interval:** 15 minutes (or whatever the human arms)  
**This file:** read at the start of every tick; update at the end of every successful tick  
**Created:** 2026-08-06  

Related context (read-only — do not expand scope into these):

- [`docs/loopplans/SYSTEM_DESIGN_MOLECULES_04082026.md`](SYSTEM_DESIGN_MOLECULES_04082026.md) — atoms/molecules vocabulary (keep; this loop fixes **projection on real apps**)  
- [`docs/WALKABLE_GRAPH_CONTEXT.md`](../WALKABLE_GRAPH_CONTEXT.md) — tier walk UX  
- [`docs/V0_BUILD_CONTEXT.md`](../V0_BUILD_CONTEXT.md) — extractor foundation  

**Pitch:**  
Fixtures passed. **Shree did not.** Underdelta must open real product repos as a calm system-design whiteboard in ~60 seconds — not a page parade or a README-layer phonebook.

**Field evidence (2026-08-06 scans on master `aaee1b6`):**

| Repo | Nodes | Failure |
|------|-------|---------|
| `shree-learn` | 1520 | Product Flow ~**34 page molecules** (marketing + temp dashboards). Beginner unusable. |
| `shree-heart` | 6167 | Flow = README labels `1. Route Layer (.route.ts)` → `5. Data Access Layer…`; **373 routes** / **4933 functions**; garbage `C pipeline` / `Col pipeline`; no Jobs story. |
| `shree-scholar` | 722 | Page molecules OK-ish (~11); **no API/Data**; story edges mostly absent (`renders` only). |

Shree checkout expected at: `/Users/praveen/Documents/GitHub/shree/<repo>` (or `SHREE_ROOT` env). Cloud ticks **must** dogfood these paths when present; when absent, still ship fixture floors that encode the same rules, and note `Dogfood: Shree paths unavailable` in Learning log.

---

## Mission (read every tick)

You are fixing **Beginner / Intermediate projection on foreign product repos** so a vibe-coder (and Praveen’s Shree stack) sees:

- **Learn / Scholar (Next):** a handful of **product hubs**, not every marketing page  
- **Heart (API):** human **API → Data** (→ Jobs when evidenced), domain-grouped routes — not README folder liturgy or function dumps  
- **No junk pipelines** from Mongo aggregate crumbs  

**AI naming is out of scope.** Deterministic ranking, caps, path heuristics, README *section* hygiene (do not promote numbered layer docs to Product Flow labels).

**Twin engines:** correct IR still matters, but this loop prefers **projection + omission + grouping** over new extractors.

**Never idle while End goal unmet.** Refill only from Seed backlog items that serve these field failures.

Ignore “PR mergeable” as a stop reason unless merge conflict / failing check from our changes.

---

## End goal

On **shree-learn**, **shree-heart**, and **shree-scholar** (when paths exist) + matching verify fixtures:

1. **Learn Beginner** ≤ **8** Product Flow hubs (product roles preferred: e.g. Student / Tutor / Demo / Auth / Marketing-or-Site — exact labels evidence-based). Marketing exam pages must **not** each own a flow slot.  
2. **Heart Beginner** shows calm **API → Data** with **human product labels** (not `1. Route Layer (.route.ts)`). Intermediate API focus shows **domain route groups** (or capped route samples), not 373 naked routes.  
3. **Heart pipelines:** no overview/Beginner junk named `C pipeline` / `Col pipeline` / single-letter aggregate crumbs; real product pipelines may remain if evidenced and labeled.  
4. **Scholar Beginner** stays page-hub calm (≤ 12) **and** either gains an honest API/Data neighbor when static evidence exists **or** documents UI-only with no fake backend.  
5. **Standing:** `npm run build` + `npm run verify` green; mini-next / mini-stack / self-map dogfood must not regress.  
6. **Self-map** compiler story unchanged (CLI → … → Viewer).

### Definition of “still unfinished”

Keep shipping while any of these are true:

- Learn Product Flow hub count > 8 (or marketing pages still sit on Beginner flow)  
- Heart API/Data labels still look like README layer headings / file globs  
- Heart Intermediate API is an uncapped route phonebook  
- Garbage short Mongo pipelines visible on Beginner/overview  
- Verify broken or mini-next Beginner page flood reintroduced  
- Next focus empty while End goal unmet  

---

## LOOP COMPLETE — soft stop

Automation may keep waking. Once **Loop status = LOOP COMPLETE**, idle ticks must **not invent, commit, or push**.

### Do not mark LOOP COMPLETE early

All acceptance gates below must be true in one tick.

#### Acceptance gates (all required)

1. **Learn Beginner compression** — With Shree path present: Product Flow / Beginner hubs ≤ 8; marketing exam/landing pages collapsed under a Marketing/Site hub or omitted from flow. Verify floor on a multi-page fixture (≥12 pages) proving the same cap/ranking.  
2. **Heart human labels** — API + Data system labels are product vocabulary (from package name / short README title / folder product nouns — **not** numbered “N. Layer (`*.glob`)” README structure lines). Verify floor with a README-structure fixture.  
3. **Heart route grouping** — Intermediate focus on Heart API (or fixture twin) shows domain groups or ≤ N representative routes (N documented in verify, suggest ≤ 24 visible route atoms unless grouped). No uncapped 373-route Intermediate dump.  
4. **Pipeline noise kill** — Heart (or mongo fixture) does not surface single-letter / `Col` / trivial aggregate pipelines on Beginner/overview; verify floor locks suppression.  
5. **Scholar honesty** — Scholar Beginner remains calm; Learning log records either evidence-backed API edge **or** explicit UI-only (no invented Jobs/Data).  
6. **Dogfood plug** — Every ACTIVE tick: `npm run verify` green; when Shree paths exist, re-scan learn+heart (+scholar if touched) and record hub counts / labels in Learning log.  
7. **No self-map / mini-stack regression** — compiler flow + mini-stack API↔Data floors still pass.  
8. **Status board** — All mandatory In-progress items checked (or cancelled with Learning-log reason).

### How to declare LOOP COMPLETE (one-time)

1. Set Loop status to `LOOP COMPLETE`.  
2. Next focus → idle line.  
3. Append Learning log handoff.  
4. Commit + push **once**; next woken tick follows Idle protocol (**no push**).

### Idle protocol

Re-check gates; on regression → ACTIVE + fix + push; else exit `IDLE: LOOP COMPLETE — no push`.

### Loop status

```text
LOOP COMPLETE
```

---

## Dogfood / test plug (mandatory every ACTIVE tick)

```bash
npm run build
npm run verify
```

**When Shree repos exist** (prefer `SHREE_ROOT` else `/Users/praveen/Documents/GitHub/shree`):

```bash
node dist/cli.js scan "$SHREE_ROOT/shree-learn" -o "$SHREE_ROOT/shree-learn/.underdelta"
node dist/cli.js scan "$SHREE_ROOT/shree-heart" -o "$SHREE_ROOT/shree-heart/.underdelta"
# after scholar ticks:
# node dist/cli.js scan "$SHREE_ROOT/shree-scholar" -o "$SHREE_ROOT/shree-scholar/.underdelta"
```

Learning log **must** include (one line OK):

- Learn: Product Flow hub count + labels  
- Heart: API/Data labels + Intermediate route/group count when touched  
- `verify` pass/fail  
- If Shree missing: `Dogfood: Shree paths unavailable — fixture floors only`

---

## Status board

### Done

- [x] Field scan baseline on master (learn / heart / scholar) recorded in this plan  
- [x] This loop plan created on `shree-whiteboard-06082026`  
- [x] Soft-stop / LOOP COMPLETE idle protocol documented  
- [x] **Learn Beginner compression:** `compressFeBeginnerRouteMolecules` — cap 8, score>10 only (no marketing fill); `verification/mini-next-many` floors; shree-learn dogfood ≤8 page hubs  
- [x] **Heart label hygiene:** `isReadmeStructureHeading` rejects numbered Layer / file-glob / folder-map README lines; API/Data stay path-role product vocabulary (`HTTP API` / `Data access`); good headings (Notes API / Catalog data) still refine; `verification/mini-readme-structure` + verify floors  
- [x] **Heart Intermediate route groups:** `projectApiRouteDomainGroups` + `INTERMEDIATE_NAKED_ROUTE_CAP` (24); OpenAPI/GraphQL contract surfaces skipped; `verification/mini-routes-many` floors  
- [x] **Kill junk pipelines:** `isTrivialMongoAggregateLabel` + `trivialMongoAggregate` collapse; C/Col crumbs off Beginner/overview; product aggregates stay hubs; mini-mongo fixture + verify floors  
- [x] **Scholar calm + honesty:** `markUiOnlyProductHonesty` + `SCHOLAR_BEGINNER_HUB_MAX` (12); `verification/mini-scholar` FE-only floor (≤12 hubs, `uiOnly`, no invented API/Data/Jobs); mini-next stays non-uiOnly when Posts API exists  
- [x] **Shree dogfood floors in verify (CI proxy):** gates 1–4 locked without Shree paths — Learn=`mini-next-many`; Heart labels=`mini-readme-structure`; routes=`mini-routes-many` (naked≤24); pipelines=`mini-mongo`  
- [x] **Final LOOP COMPLETE gate pass** (gates 1–8 in one tick; verify green; self-map + mini-stack OK)

### In progress / next

*None — LOOP COMPLETE. Idle ticks: re-check gates only; no invent / commit / push unless regression.*

### Seed backlog (optional — not LOOP COMPLETE blockers)

- Cross-repo Shree map (learn→heart) — out of single-repo scan unless trivial  
- Jobs molecule for Heart when real cron/workers evidenced  
- Temp* vs production route ranking polish beyond the ≤8 cap (Home/Student/Tutor vs temp* shells)  
- React Router / other Shree FE repos after learn+heart+scholar green  

### Next focus (edit every tick)

> **Next focus:** IDLE: LOOP COMPLETE — no invent, no commit, no push unless an acceptance gate regresses.

### Learning log (append every tick)

```text
- YYYY-MM-DD HH:MM UTC | Done: … | Next: … | Learned: … | Dogfood: …
```

- 2026-08-06 | Plan created from Shree field scans (learn 34 flow hubs; heart README-layer labels + junk pipelines; scholar FE-only) | Next: Learn Beginner compression | Learned: molecules loop fixed fixtures; foreign Next apps still flood Beginner; Heart README structure is poisoning system labels | Dogfood: learn=34 flow, heart=API→Data with layer names, scholar=11 hubs
- 2026-08-06 15:33 UTC | Done: Beginner route-molecule compression (cap 8, never fill with score≤10 marketing); mini-next-many fixture + verify; mini-next 2-hub path unchanged | Next: Heart label hygiene | Learned: cap must be a maximum not a fill target — filling to 8 re-admits exam pages; temp* shells outrank /student on learn (seed polish) | Dogfood: shree-learn page hubs=8 (Demo → Login → Temp applicant dashboard → Temp demo → Tempsignin → Temp student → Temp tutor → Temp welcome → HTTP API); omitted 25; verify passed
- 2026-08-06 15:36 UTC | Done: Heart label hygiene — `isReadmeStructureHeading` + mini-readme-structure fixture; API/Data stay HTTP API → Data access; good README product headings unchanged | Next: Heart Intermediate route groups | Learned: first-match README hints meant Route Layer won the api key before any human product heading could; reject structure liturgy entirely rather than sanitize Layer wording | Dogfood: Shree paths unavailable — fixture floors only; mini-readme-structure flow=HTTP API → Data access; verify passed
- 2026-08-06 15:48 UTC | Done: reconciled Heart Intermediate route groups (prior commits: domain groups + naked cap 24 + skip OpenAPI/GraphQL) + kill junk Mongo pipelines (`isTrivialMongoAggregateLabel` / `trivialMongoAggregate`; mini-mongo C/Col crumbs collapsed; product hubs kept) | Next: Scholar calm + honesty | Learned: short receiver handles (`C` / `col`) mint overview hubs unless projection treats label quality separately from extraction; keep product aggregates visible | Dogfood: Shree paths unavailable — fixture floors only; verify pending in this tick
- 2026-08-06 15:54 UTC | Done: Scholar honesty code (`markUiOnlyProductHonesty` + mini-scholar fixture floors) landed prior tick without plan update | Next: reconcile board + LOOP COMPLETE | Learned: uiOnly is a product metadata flag + diagnostic, not a fake Jobs/Data system | Dogfood: Shree paths unavailable — fixture floors only
- 2026-08-06 16:00 UTC | Done: gates 1–8 green in one tick — Scholar calm+uiOnly locked; CI proxy floors (mini-next-many / mini-readme-structure / mini-routes-many / mini-mongo / mini-scholar); self-map + mini-stack OK; declared LOOP COMPLETE | Next: IDLE | Learned: without SHREE_ROOT, fixture twins are the acceptance surface; mini-scholar=7 hubs uiOnly; mini-next-many=5 hubs; Heart flow=HTTP API→Data access; routes naked≤24; C/Col pipelines suppressed | Dogfood: Shree paths unavailable — fixture floors only; verify passed

---

## Tick protocol

1. **Concurrency** — skip if prior tick still running.  
2. **Sync** — `git fetch`; stay on `shree-whiteboard-06082026`; merge `origin/master` when needed; resolve conflicts; `npm run build` + `npm run verify` green (or fix first).  
3. **LOOP COMPLETE gate** — if complete → Idle protocol (no push).  
4. **Read this file** — one Next focus increment only.  
5. **Implement** — projection/omission/grouping > new extractors > docs.  
6. **Verify + Shree dogfood** when paths exist.  
7. **Update this markdown** in the same commit when possible; rewrite Next focus; append Learning log.  
8. **Commit + push** to `shree-whiteboard-06082026` only (not when idling complete).  
9. **Stop the tick.**

---

## Priority order

1. Build/verify green; conflicts first  
2. Learn Beginner compression (biggest vibe-coder fail)  
3. Heart label hygiene  
4. Heart route grouping / caps  
5. Junk pipeline suppression  
6. Scholar honesty  
7. README only if user-facing behavior changed  

---

## Out of scope (hard)

- Any branch other than `shree-whiteboard-06082026`  
- Commits to `master` directly  
- New PRs (one draft for this branch)  
- LLM / AI structure or naming  
- Graphify-style call-graph default Beginner  
- Multi-repo federated Shree graph (unless a one-line discovery falls out)  
- New language extractors  
- Rewriting walkable tiers / capability Detects catalogs  

---

## Copy-paste Autopilot prompt

```text
AUTOPILOT MODE — Underdelta Shree whiteboard (field-failure loop)

CANONICAL PLAN FILE (read + update every tick):
`docs/loopplans/SHREE_WHITEBOARD_06082026.md`

MISSION:
Make real Shree repos (learn/heart/scholar) open as calm system-design whiteboards.
Fix Beginner page flood, Heart README-layer labels, route phonebooks, junk pipelines.
NO AI naming. Prefer projection/omission/grouping.
When Loop status is LOOP COMPLETE: IDLE — no invent, no commit, no push (unless gate regressed).

HARD LOCKS:
1) Work ONLY on branch `shree-whiteboard-06082026`. Never checkout master for feature work. Never open a second PR.
2) Update the existing draft PR for this branch only.
3) Commit + push small chunks while ACTIVE; prefer feature + plan update in one commit.
4) CONCURRENCY: If a previous tick is still executing, SKIP.
5) Every tick START: fetch, sync, resolve conflicts, build+verify green, reconcile Status board.
6) If LOOP COMPLETE → Idle protocol (no push). If ACTIVE → one Next focus item.
7) Mark LOOP COMPLETE only when acceptance gates 1–8 ALL pass.
8) Every ACTIVE tick: npm run verify; when /Users/praveen/Documents/GitHub/shree or SHREE_ROOT exists, re-scan learn+heart and log hub counts/labels.
9) Out of scope: AI, new languages, Graphify clone, multi-repo federation.

EACH TICK:
A) Concurrency check → skip if busy
B) Sync/conflict/health check
C) If LOOP COMPLETE → Idle protocol → exit (no push)
D) Read plan → one Next focus increment
E) Implement
F) npm run build && npm run verify (+ Shree dogfood when available)
G) Update plan; if gates 1–8 pass set LOOP COMPLETE
H) Commit + push to shree-whiteboard-06082026 (not when idling complete)
I) Stop tick

DONE LOOKS LIKE:
- Learn ≤8 Beginner hubs; Heart human API→Data; grouped/capped routes; no junk pipelines; scholar honest; verify green
- Further woken ticks: IDLE: LOOP COMPLETE — no push
```

---

## Human notes

### Branch name

`shree-whiteboard-06082026`

### Arming

Arm Autopilot / push-retrigger on that branch with the prompt above. First Next focus = Learn Beginner compression.

### Morning checklist

```bash
git fetch origin && git checkout shree-whiteboard-06082026 && git pull
npm ci && npm run build && npm run verify
node dist/cli.js scan /Users/praveen/Documents/GitHub/shree/shree-learn -o /Users/praveen/Documents/GitHub/shree/shree-learn/.underdelta
open /Users/praveen/Documents/GitHub/shree/shree-learn/.underdelta/index.html
# Beginner hubs ≤ 8?
```

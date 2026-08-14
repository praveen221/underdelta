# Loop plan — Navigable graph (cardinality, walk, operation edges)

Living plan for a **scoped** Autopilot / overnight loop.

**Branch lock:** `navigable-graph-14082026` only
**Base:** `master` (post change-impact #22; do not wait on open PRs)
**Do not** open a second PR for this work — one draft PR for this branch
**Loop interval:** 30 minutes
**This file:** read at the **start** of every tick; **rewrite** at the end of every successful tick
**Created:** 2026-08-14

Related (read-only unless a tick must cite them):

- [`../WALKABLE_GRAPH_CONTEXT.md`](../WALKABLE_GRAPH_CONTEXT.md) — 3-tier walk already shipped
- [`WALKABLE_GRAPH_02082026.md`](WALKABLE_GRAPH_02082026.md) — archaeology of that loop
- [`../PRODUCT_MVP.md`](../PRODUCT_MVP.md) — map + change impact; do not reopen adapter breadth
- [`../ARCHITECTURE_V02.md`](../ARCHITECTURE_V02.md) — facets / evidence contract

**Pitch:**
The 3-tier walk exists. It still fails on real product repos: open HTTP API and
200 route nodes explode the canvas. The graph must feel like a **map you walk**,
not a physics demo of every sibling.

---

## Mission (read every tick)

Make the Underdelta viewer **100× more navigable on real repositories**.

Human direction that this loop must honor (do not drop these):

1. **Cardinality collapse.** When similar nodes of one kind/role exceed ~10 in
   the current view, cluster them (e.g. `HTTP endpoints (47)`), do not lay out
   200 API nodes and zoom to a postage stamp.
2. **Better back.** After double-click / drill, Back / Esc / crumb must feel
   obvious and reliable. You should never feel trapped inside a fan-out.
3. **Operation-meaningful connections.** Edges in Intermediate should read as
   what the operation does (`POST /checkout → writes Order`), not as anonymous
   spaghetti or unlabeled `calls`.
4. **Feel, don’t guess.** Every tick dogfoods at least one real repo. If it
   still feels zoomed-out and unreadable, the tick is not done.

**Twin engines:** correct IR/projection first when clustering needs a hub node;
viewer layout/nav second. Prefer walkability over new extractors.

**Never idle while End goal unmet.** If In progress looks empty, refill from
Seed backlog — **only** navigable-graph items.

Ignore “PR mergeable” as a reason to stop.

---

## Recurrent plan rule (mandatory — this is the loop)

This file is **not a frozen spec**. It is the memory of the overnight run.

Every successful tick **must**:

1. Start from a **hypothesis** written in **Next focus** (or write one).
2. Implement the smallest slice that can falsify or support that hypothesis.
3. **Dogfood** (see protocol below). Write how it *felt*, not only that tests passed.
4. **Mutate this plan in the same commit:**
   - Promote what worked into Done / standing rules
   - Demote or rewrite hypotheses that felt wrong
   - Add newly felt problems to Seed backlog or In progress
   - Change Next focus to the next hypothesis
   - Append a Learning log line that includes **felt** + **plan change**
5. Do **not** keep executing a dead hypothesis because it was in the original
   plan. The morning reader should see the plan *drift toward what actually
   made repos readable*.

Example Learning log shape:

```text
- 2026-08-14 HH:MM UTC | Hypothesis: cluster routes >10 under API | Done: … | Felt: RealWorld API still a hairball because X | Plan change: next tick cluster by resource prefix not by kind | Next: …
```

If you only ship code and leave this file untouched, the tick **failed**.

---

## Dogfood protocol (mandatory every ACTIVE tick)

Do not ship a navigation change that you have only seen on Underdelta’s self-map.

**Repos (gitignored, already present under `.dogfood-repos/`):**

| Priority | Path | Why |
|----------|------|-----|
| 1 | `.dogfood-repos/node-express-realworld` | Many Express routes — the 200-API problem |
| 2 | `.` (self-map) | Compiler story; must not regress |
| 3 | `.dogfood-repos/fastapi-realworld` | Second HTTP fan-out (Python) |
| 4 | `.dogfood-repos/celery-flask-full` | Jobs + HTTP mix |
| 5 | `.dogfood-repos/node-cron-betterstack` | Small; use when checking “don’t over-cluster tiny graphs” |
| 6 | `.dogfood-repos/kubernetes-training` | Deploy density; only if HTTP clustering is already calm |

**Each tick:**

```bash
npm run build
# Prefer local build:
./scripts/run.sh .dogfood-repos/node-express-realworld
# or: node dist/cli.js scan .dogfood-repos/node-express-realworld -o .dogfood-scans/express-realworld
```

If a listed repo is missing, skip it and say so in the Learning log — do not
clone new OSS unless the human added it. Never commit `.dogfood-repos/` or
`.dogfood-scans/`.

**Feel checklist (write answers in the Learning log):**

- Can I read Beginner in 10 seconds without pinch-zooming?
- After double-clicking the API (or largest system), do I see **clusters** or a starfield?
- Can I Back out without thinking?
- Do 2–3 visible edges explain an **operation**, or are they just lines?
- Would I show this screenshot to a stranger?

Scan **at least one** priority-1 or priority-2 repo every tick. Rotate a second
repo when the change might regress it.

---

## End goal

A stranger opens a real Express/Next-sized product map and can:

| Moment | Done looks like |
|--------|-----------------|
| Cold open | Beginner stays a small product story (systems, not 200 routes) |
| Fan-out | Any view with >~10 same-kind siblings collapses to a named cluster hub |
| Drill | Double-click cluster → a **bounded** page of those siblings (paged or grouped), not the whole set if still huge |
| Back | One obvious Back/Esc/crumb step; never a dead end |
| Edges | Intermediate story edges carry operation labels (method/path, reads/writes, publishes) |
| Density | Fit-to-view does not shrink nodes to unreadable dots to accommodate a dump |
| Honesty | Clusters are projection, not invented product systems; evidence still reaches the real route/table |

Standing guarantee: `npm run build` + `npm run verify` green; self-map Beginner
still CLI → … → Viewer, not a parts bin.

### Definition of unfinished

- Opening HTTP API (or equivalent) still sprays tens/hundreds of peer nodes
- Back is hidden, broken, or surprising after drill
- Edges are unlabeled hairballs at Intermediate
- Plan Next focus is empty while the above is true
- Verify/build red

---

## Starting hypotheses (living — reorder, kill, add)

The overnight loop should **not** implement this list blindly. It is the
opening bet. After each dogfood, rewrite the list.

| ID | Hypothesis | Why start here | Kill if |
|----|------------|----------------|---------|
| H1 | **Kind clusters at >10 (fallback).** Ungrouped same-kind siblings under a product parent collapse to `HTTP endpoints (N)` when count > 10. **Do not nest** inside an existing domain route group. | Human request; ungrouped phonebooks | Tiny graphs grow fake hubs; wrapping Articles hides the 11 routes you drilled for |
| H5 | **Sub-prefix groups inside a domain cluster.** Oversized domain hubs (>10 routes) peel 2+ member subresources (`comments`, `favorite`) into nested groups. Singleton `feed` stays a route. | RealWorld dogfood: API is calm; Articles was a 11-verb phonebook | Prefixes are noise on non-REST apps — fall back to H1; 1-member hubs |
| H2 | **Back stack = focus stack + cluster stack.** Entering a `routeGroup` / `kindCluster` hub seeds ancestors (API → Articles) so Find/double-click cannot land in Comments with only Overview as the exit. | Nested Comments room from H5 | Extra frames on Extractors/self-map — only seed for cluster hubs |
| H3 | **Operation labels on story edges.** Lift route→table (`routes-to` or in-range controller `calls`) as `writes Article`; Intermediate always-on badges; hide raw `calls`/`imports`. | “What’s happening in the operation” | Labels collide / unreadable at scale — then label only on select/hover |
| H4 | **Don’t fit-to-dump.** If visible node count > N, fit the **hubs**, not every leaf. | Zoom-out postage stamp | **Cancelled:** RealWorld rooms are readable; k8s 135-service dump needed a Services hub (H1), not a smaller zoom. Reopen if a mixed room still postage-stamps after clustering |
| H6 | **Hallway tables stay in the room they explain.** API Intermediate hides tables unless a *visible* leftover route stories to them (`GET /tags → Tag`). Grouped Article/User/Comment stay in their domain rooms. | H3 dogfood: API hallway still 4 labeled tables | Hiding them also hides GET /tags → Tag on the ungrouped leftover |
| H7 | **Data Intermediate is tables, not API leftovers.** Focusing Data access hides HTTP API + leftover routes (`GET /tags`). Table focus still shows who writes. | H4 peel: Data room still had GET /tags + HTTP API | Table Intermediate loses writers — then keep API on table focus only |
| H8 | **Table Intermediate shows the writing routes.** Double-click Article from Data should read `POST /articles → writes`, not only an HTTP API box. Prefer writes; fall back to reads; cap 10. | H7 dogfood: Article room is HTTP API + Article | Phonebook of every GET — then mutations-only or page |
| H9 | **Hide the HTTP API box on table Intermediate when writer routes are already visible.** POST /articles is the story; the molecule hub restates it. | H8 dogfood: Article room is 5 mutations + leftover HTTP API | Table with no writer routes loses “who writes this?” |
| H10 | **Page large kind-cluster drills.** First 10 members + a `N more` node that reveals the next 10. Services (135) must not dump on double-click. | k8s dogfood: hallway calm, drill is a starfield | 12-route Playwright floor must still reach all 12 via one more-click |
| H11 | **Density legend on kind-cluster hubs.** Hub subtitle is `N endpoints clustered` plus a hatch bar (not `system · semantic`). | H10 dogfood: hallway hub looked like any other system | Caption collides with the title — then bar-only |
| H12 | **Peel huge service clusters by native deploy kind.** Services (135) drill is still a mixed phonebook (42 Service / 37 Deployment / 17 Ingress / …). Nested groups when a native kind has ≥2 members. | H11 dogfood: hub is honest; drill is still 10 random + 125 more | One-kind repos grow a fake wrapper; 12-route Playwright must stay flat |
| R1 | **[P1] Gate route→resource lifts on typed `endpoint` facets.** Fastify (unsupported-http-framework, 0 endpoint facets) must not get `POST /articles → writes article`. | Human review 2026-08-14: `src/projection/data.ts` ~575 loops raw `route` nodes | Express RealWorld loses operation badges — then keep facet gate and fix adapter coverage, do not reopen raw routes |
| R2 | **[P2] Skip `intermediateOmitted` nodes when building kind clusters.** 11 SQL migrations must not become empty `Schemas (11)` under Data. | Human review: `kindClusters.ts` ~122 includes omitted members | RealWorld Data room grows a fake empty hub — then omit clustering for that parent |
| R3 | **[P2] Generic clusters keep their walkable parent on Back.** `Services (135)` under Introduction to Kubernetes must crumb/Back to that room, not jump to Beginner. HTTP API is not the only non-cluster frame. | Human review: `clusterWalk.ts` ~17 only special-cases HTTP API | Extractors / CLI crumbs regress — then add Deploy→Services Playwright, keep existing 12-route HTTP floor |
| R4 | **[P2] Compute table-focus allowed route IDs once per focus/render.** `isTableFocusOperationRoute` is quadratic in endpoint count (full route scan per node). | Human review: `viewer.ts` ~430 | Writer-route rooms go empty — then keep the set, fix the filter |

**Standing rules (from tick 1 dogfood):**

- Kind clusters are `projection: semantic` + `kindCluster: true` — not product systems.
- Threshold is **>10** (10 siblings stay naked). Never cluster modules/functions/capabilities.
- Deploy `service` units are kind-clusterable (`Services (N)`). kubernetes-training’s 135 workloads collapse under Introduction to Kubernetes; a single App image / Express deploy unit stays naked.
- Skip parents that are already `routeGroup` hubs (Users / Articles). H1 is the fallback when prefixes do not form.
- Domain groups (already on master) are what made RealWorld API Intermediate readable.
- Nested subresource groups (`routeGroupNested`) only form when the domain hub has **>10** routes and the bucket has **≥2** members. Hide them on ancestor Intermediate (same as kind-cluster hubs).
- Entering a cluster hub sets `history` to `clusterWalkAncestors` (API → Articles under Comments). Do **not** rewrite history for Extractors / CLI / modules.
- Lifted data-story labels are operations (`writes Article`), never handler names (`createArticle`). Route→table lifts only via `routes-to` or a same-file `calls` inside the route evidence span. Do **not** lift route→Data (that would drag Data access into every Articles room).
- Intermediate always-on badges for reads/writes/queries and labeled uses/renders/triggers. Route→table badge prefers `writes` over `writes · reads`. Beginner stays unlabeled except narrative/relation. `calls`/`imports` stay off Intermediate.
- Neighborhood seeds skip hidden cluster members so Comments routes cannot park a stray Comment table in the Articles room.
- API Intermediate hides tables/collections when the focus has `routeGroup` children and no visible leftover route stories to that table. Do **not** hide `GET /tags → Tag`. Do not apply this in the Data access room or on Advanced.
- SQL migration `schema` nodes (`role: migration`) omit from Intermediate when tables already tell the data story (`intermediateOmitReason: migration-lineage`). Keep them on Advanced; table `migrates` evidence stays. Do not hide the Prisma/database hub.
- Data access Intermediate hides HTTP API and leftover routes. Do **not** apply that hide when the focus is a table/collection — that room still answers “who writes this?”.
- Table Intermediate shows routes that `writes` the focused table (cap 10). If there are no writers, show `reads`/`queries`. Grouped/nested membership does not hide those operation routes. GETs stay in the domain room.
- Hide the HTTP API box on table Intermediate when writer routes are already visible. Keep it when the table has no writers (Tag + GET /tags still needs a “who touches this?” neighbor).
- Playwright locks the H1+H2 walk: 12 dummy ungrouped routes collapse to `HTTP endpoints (12)`; Back/Esc is Overview ‹ HTTP API ‹ hub. Keep that fixture if clustering or history changes.
- Find ranks an exact-match table/collection above a same-label `routeGroup`. Enter focuses the table room (writer routes), not Data access and not the User route group. The group stays in the list as “route group”.
- Kind-cluster Intermediate pages members: first 10, then a `N more` node / inspector button adds 10. Advanced still shows the full set. Playwright 12-route drill: 10 + `2 more` → 12.
- Kind-cluster hubs carry `densityLegend` (`135 services clustered` / `12 endpoints clustered`) and a hatch bar (`densityFill` 22–100%). Dashed border + caption — never `system · semantic`. Playwright asserts the 12-route hallway caption.

---

## Out of scope (do not “just quickly”)

- New language / framework adapters (Flask, LangGraph, more deploy)
- AI naming of clusters or systems
- Change-impact CLI features (unless a cluster id breaks impact — then fix only that)
- Historical git tree compile
- Landing page / marketing
- Matcher DSLs
- Turning clusters into fake product systems without `projection: semantic` honesty

---

## LOOP COMPLETE — soft stop

### Acceptance gates (all required)

1. **Cluster gate.** On node-express-realworld (or equivalent), focusing HTTP API /
   routes does **not** show >10 peer route nodes at Intermediate without a
   cluster hub. Record the scan in the Learning log.
2. **Small-graph gate.** A small repo (self-map or node-cron-betterstack) does
   **not** grow a useless “1 endpoint” cluster that hides the story.
3. **Back gate.** After double-clicking a system and then a cluster, Back/Esc
   returns one frame at a time to Beginner. Verify floors + dogfood note.
4. **Operation-edge gate.** Intermediate story edges show a human operation
   hint (method/path or reads/writes/publishes), not only kind=`calls`.
   **Unsupported HTTP frameworks (Fastify) must not receive those lifts.**
5. **Verify green.** `npm run build` + `npm run verify`.
6. **Self-map standing.** Beginner compiler story intact (no FE/API dump).
7. **Plan is current.** This file’s hypotheses and Next focus match the last
   dogfood feeling (no stale “next: invent clusters” after clusters shipped).
8. **Status board.** Mandatory In-progress items checked or cancelled with
   Learning-log reason.

Do **not** mark complete because “we clustered something on the self-map only.”

### How to declare LOOP COMPLETE

When gates 1–8 all pass in one tick: set Loop status to `LOOP COMPLETE`, rewrite
Next focus to idle, append Learning log, commit + push **once**. Next woken tick
follows Idle protocol (**no push**).

### Idle protocol

If Loop status is `LOOP COMPLETE`: re-check gates. Regression → ACTIVE and fix.
Otherwise: no invent, no commit, no push. Exit: `IDLE: LOOP COMPLETE — no push`.

### Loop status

```text
ACTIVE
```

---

## Status board

### Done

- [x] This loop plan created on `navigable-graph-14082026`
- [x] Soft-stop / idle protocol written
- [x] Prior 3-tier walk exists on master (do not rebuild tiers from scratch)
- [x] **H1 spike:** `projectKindClusters` collapses ungrouped >10 same-kind siblings to a projection hub; viewer hides members until the hub is focused; 10-or-fewer stay naked
- [x] **Dogfood note:** RealWorld + self-map + node-cron after H1 (see Learning log)
- [x] **H5:** oversized domain hubs peel Comments / Favorite nested groups; feed stays a route; viewer hides nested hubs on API Intermediate
- [x] **H2:** cluster enter seeds `clusterWalkAncestors`; crumb Overview › HTTP API › Articles › Comments; Back/Esc hint names the parent; Extractors walk unchanged
- [x] **H3:** route→table operation lifts + Intermediate always-on badges (`POST /articles → writes Article`); API→table labels are `writes Article` not `createArticle`
- [x] **H6:** API Intermediate hides grouped hallway tables; `GET /tags → Tag` stays; Articles/Users rooms still own their tables
- [x] **Data access migrations:** SQL migration schemas omit from Intermediate; 4 RealWorld `migration.sql` files left the Data room
- [x] **H7:** Data Intermediate hides HTTP API + leftover routes; room is 4 tables + Prisma database
- [x] **H8:** Table Intermediate shows writer routes (`POST /articles`, favorite, comment mutations); GETs stay in the domain room
- [x] **H9:** hide HTTP API on table Intermediate when writer routes are visible; Tag (no writers) still keeps HTTP API
- [x] **Playwright:** 12 dummy routes → `HTTP endpoints (12)`; Back/Esc HTTP API → Beginner (`kind cluster of 12 dummy routes walks Back through HTTP API`)
- [x] **Find User:** exact table beats same-label route group; Enter opens the User table room
- [x] **H4 cancelled:** no fit-to-view change — k8s dump was 135 unclustered services; `service` now kind-clusters to `Services (135)`
- [x] **Service kind clusters:** `KIND_CLUSTERABLE` includes `service`; Express Deploy (1 unit) stays naked
- [x] **H10:** kind-cluster drills page 10 + `N more`; Playwright 12-route walk clicks `2 more` to see all 12
- [x] **H11:** kind-cluster hubs show `N … clustered` + hatch bar; k8s hallway is `135 services clustered`; Playwright 12-route hallway caption locked

### In progress / next (keep ≥ 3 unchecked until LOOP COMPLETE)

- [ ] **R1 [P1]:** gate route→resource lifting on `endpoint` facet; negative Fastify compile test
- [ ] **R2 [P2]:** skip `intermediateOmitted` nodes in kind-cluster builders; projection test with >10 migration schemas
- [ ] **R3 [P2]:** `clusterWalkAncestors` includes walkable parent of generic clusters; Deploy → Services browser test
- [ ] **R4 [P2]:** precompute table-focus operation-route ids once per focus/render
- [ ] H12 peel Services (135) by native deploy kind (Deployment / Service / Ingress) — **after R1–R4**
- [ ] Hover/select-only labels if always-on badges collide on a later repo
- [ ] Keyboard: ` [` / `]` sibling clusters

### Seed backlog

- Hover/select-only labels if always-on labels collide
- Keyboard: ` [` / `]` sibling clusters
- Peel huge service clusters by native k8s kind (H12) — blocked until R1–R4
- Playwright: cluster + Back path on a fixture with 12 dummy routes (shipped)
- Density legend on kind-cluster hubs (shipped H11)
- Page large clusters (first 10 + “show more”) (shipped H10)

### Next focus (edit every tick)

> **Next focus:** Human review interrupt (2026-08-14) — **do not start H12 this tick.** First R1 [P1]: `src/projection/data.ts` (~575) must lift route→resource only when the route has a typed `endpoint` facet. Fastify already emits `unsupported-http-framework` and has zero endpoint facets but still gets `POST /articles → writes article`. Add a negative Fastify compile test. Then R2 empty `Schemas (11)` clusters, R3 k8s Services Back parent, R4 quadratic table-focus scan. Dogfood Express RealWorld + kubernetes-training + a Fastify fixture. Then rewrite this Next focus.

---

## Human review interrupt (2026-08-14)

Another agent reviewed the branch **between ticks**. These compose-policy bugs beat H12.

Do **not** mark LOOP COMPLETE while any of R1–R4 are open. Do **not** “just quickly” peel k8s kinds first.

### R1 [P1] Unsupported HTTP frameworks gain product operation claims

`src/projection/data.ts` (~575) loops every raw `route` node instead of requiring a normalized `endpoint` facet. Fastify correctly warns `unsupported-http-framework` and has **zero** endpoint facets, but still receives `POST /articles → writes article`. That is a confident product story from unsupported syntax.

**Fix:** gate route-to-resource lifting on the typed `endpoint` facet. Add a negative Fastify compile test (no operation lift, diagnostic still present).

### R2 [P2] Omitted migration schemas become a visible empty cluster

`src/projection/kindClusters.ts` (~122–128) includes nodes already marked `intermediateOmitted`. A repo with 11 SQL migrations produces `Schemas (11)` under Data access; the viewer hides all 11 members, so the hub opens an **empty room**.

**Fix:** skip Intermediate-omitted nodes when building clusters. Add a full projection test with more than 10 migration schemas.

### R3 [P2] Generic clusters lose their parent on Back

`src/projection/clusterWalk.ts` (~17–23) only treats HTTP API as a non-cluster frame. On kubernetes-training, `Services (135)` sits under `Introduction to Kubernetes`, but `clusterWalkAncestors()` returns `[]`; Back jumps to Beginner.

**Fix:** include the walkable parent of generic clusters. Add a Deploy → Services browser test. Keep the existing 12-route HTTP API Back floor.

### R4 [P2] Table focus recomputes every route for every route

`src/viewer.ts` (~430–448) scans all routes (twice) inside a per-node predicate. Table focus is quadratic in endpoint count.

**Fix:** compute allowed operation-route IDs **once** per focused resource/render and reuse the set. Do not change which routes are allowed unless a test proves the old set was wrong.

### Review assessment (do not argue it away)

Direction is useful (bounded drills, semantic labels, calmer rooms). The loop validated hypotheses on **narrow fixtures** without composing policies. Do not merge until R1–R3 are fixed; R4 before calling the viewer large-repo-ready. `git diff --check` also noted a non-blocking trailing blank line at the end of `test/projection.test.mjs` — tidy if you touch that file.

---

## Learning log (append every tick)

```text
- YYYY-MM-DD HH:MM UTC | Hypothesis: … | Done: … | Felt (repo): … | Plan change: … | Next: …
```

- 2026-08-14 (human interrupt, between ticks) | Hypothesis: n/a — external review | Done: parked H12; wrote R1–R4 into this plan | Felt: n/a (human + second agent, not this loop) | Plan change: **correctness compose bugs first** (Fastify operation lifts, empty Schemas cluster, k8s Back parent, quadratic table focus). H12 only after R1–R4. Do not LOOP COMPLETE until those are closed. | Next: R1 P1 endpoint-facet gate + Fastify negative test

- 2026-08-14 | Plan created on `navigable-graph-14082026` | Done: living plan + dogfood protocol | Felt: n/a (no code yet) | Plan change: opening bet is H1 cardinality collapse, then Back frames, then operation labels | Next: H1 on Express RealWorld
- 2026-08-13 19:30 UTC | Hypothesis: H1 kind-cluster >10 same-kind siblings | Done: `src/projection/kindClusters.ts` + viewer hide-until-focus; skip nest inside `routeGroup`; verify 66 pass | Felt (node-express-realworld): Beginner is HTTP API → Data access (readable in 10s). API Intermediate is **clusters** (Articles/Profiles/User/Users + GET / + GET /tags + 4 story tables) — not a 20-route starfield. Wrapping Articles’ 11 routes in `HTTP endpoints (11)` felt like a trap (extra click to see the routes you drilled for); skipped. Articles still a 11-verb phonebook. Self-map: no fake clusters; Beginner still CLI → Compile pipeline → … → Viewer. node-cron-betterstack: 1 cron + 1 job, no 1-endpoint hub. Edges still unlabeled `reads`/`writes` (H3). Would show Beginner + API Intermediate to a stranger; not Articles yet. | Plan change: H1 is fallback for ungrouped dumps; promote H5 (sub-prefix inside Articles) over nesting kind clusters; standing rule: never wrap a domain group | Next: H5 Articles feed/comments/favorite
- 2026-08-13 19:55 UTC | Hypothesis: H5 sub-prefix groups inside Articles | Done: `httpRouteSubresourceKey` + nested `routeGroupNested` hubs for ≥2 member buckets when domain has >10 routes; viewer hides nested hubs on API Intermediate; verify 69 pass | Felt (node-express-realworld): Beginner still 10s (HTTP API → Data). API Intermediate unchanged (4 domain groups + GET / + GET /tags + 4 tables) — Comments/Favorite do **not** leak. Articles Intermediate is a **map**: 5 CRUD + GET /articles/feed + Comments + Favorite (9 nodes, 6 peer routes). Comments drill = 3 comment routes. Singleton feed correctly stayed a route. fastapi-realworld matches (same Articles room). Self-map: no nested/kind hubs; CLI → … → Viewer intact. Edges still unlabeled (H3). Would show Articles to a stranger now. | Plan change: H5 standing rule (only peel >10 domain hubs, ≥2 members, hide nested on ancestors); next is H2 because the extra Comments room makes Back the trap risk | Next: H2 Back through Articles → Comments
- 2026-08-13 20:24 UTC | Hypothesis: H2 cluster enter is a Back frame | Done: `clusterWalkAncestors` + viewer seeds history for routeGroup/kindCluster hubs; walk-hint and Back title name the parent frame; verify 70 pass | Felt (node-express-realworld): Comments crumb is Overview › HTTP API › Articles › Comments; Back → Articles (not a trap). Articles → HTTP API → Beginner. Find into Comments from cold open would have skipped the path before; now it cannot. Self-map Extractors is not a cluster hub — ancestors empty, existing Esc Advanced→Intermediate→Beginner walk unchanged. Beginner still 10s; API still clusters; edges still unlabeled (H3). Would show the Comments crumb to a stranger. | Plan change: standing rule — only rewrite history for cluster hubs; next is H3 operation labels (the remaining “just lines” feel) | Next: H3 operation labels on Intermediate story edges
- 2026-08-14 03:42 UTC | Hypothesis: H3 operation labels on Intermediate story edges | Done: `operationStoryLabel` + route→table lift (`routes-to` or in-range controller `calls`); viewer always-on operation badges; neighborhood seeds skip hidden cluster members; verify 74 pass | Felt (node-express-realworld): Beginner still 10s (HTTP API → Data). Articles Intermediate is the payoff — `POST /articles → writes`, GETs `reads` Article; Comments is POST `writes` Comment; Favorite is two `writes` Article. 19/20 routes bound; GET / (no table) correctly unbound. API Intermediate clusters remain, now with `writes · reads Article` on the 4 hallway tables — labeled but still clutter beside Articles/Users. Self-map: no fake reads/writes; CLI → Compile → … → Viewer intact; Intermediate uses stay `extract`/`normalize`. node-cron-betterstack: 1 cron + 1 job, no operation spam. fastapi-realworld has routes-to but no table IO, so no new badges. Would show Articles/Comments/Users rooms to a stranger; not the API hallway yet. | Plan change: H3 standing rules (operation labels, span-bound route lifts, no route→Data, skip hidden seeds); promote H6 hallway tables over H4 | Next: H6 hide API hallway tables when domain groups exist
- 2026-08-14 04:05 UTC | Hypothesis: H6 hallway tables stay in the room they explain | Done: `isHallwayTable` — hide table/collection on Intermediate when focus has routeGroup children and no visible leftover route stories to it; verify 74 pass | Felt (node-express-realworld): Beginner still 10s. API Intermediate is now a **map** (Articles/Profiles/User/Users + GET / + GET /tags → Tag + Data access) — Article/Comment/User left the hallway. Kill-if did **not** fire: Tag stays with GET /tags. Articles still `POST /articles → writes` Article; Comments/Users rooms unchanged. Self-map: CLI → Compile → … → Viewer intact; no fake tables/clusters. node-cron-betterstack: 1 cron + 1 job. Would show the API hallway to a stranger now. Data access Intermediate still 4 tables + 4 migration schemas. | Plan change: H6 standing rule (hide grouped hallway tables; keep leftover route→table); next is H4 on the Data access dump | Next: H4 fit-to-view / peel Data access migrations
- 2026-08-14 04:37 UTC | Hypothesis: H4 fit-to-view / peel Data access migrations | Done: H4 falsified on RealWorld Data access (12 nodes, not dust). `isSqlMigrationSchema` + `intermediateOmitReason: migration-lineage`; viewer hides migration schemas on Intermediate; verify 75 pass | Felt (node-express-realworld): Beginner still 10s; API hallway still groups + GET /tags → Tag. Data access Intermediate is now 8 nodes (4 tables + Prisma database + HTTP API + GET /tags) — migrations gone, tables readable, not a postage stamp. Self-map: no migration schemas; CLI → … → Viewer intact. node-cron-betterstack: unchanged. Would show Data tables to a stranger; GET /tags still feels like API leftover in the Data room. | Plan change: standing rule — omit SQL migrations on Intermediate when tables exist; demote H4 to true dumps; add H7 leftover API neighbors in Data | Next: H7 hide GET /tags + HTTP API from Data access Intermediate
- 2026-08-14 05:04 UTC | Hypothesis: H7 Data Intermediate is tables not API leftovers | Done: `isDataRoomApiLeftover` hides HTTP API + routes when focus is Data access; table focus still keeps HTTP API; verify 75 pass | Felt (node-express-realworld): Beginner still 10s. API hallway unchanged (groups + GET /tags → Tag). Data Intermediate is now a **map**: Prisma database + Article/Comment/Tag/User (6 nodes). GET /tags and HTTP API left. Double-click Article still shows HTTP API (kill-if did not fire) but not the writing routes — those stay in the Articles room. Self-map: no Data access; CLI → … → Viewer intact. node-cron-betterstack: unchanged. Would show the Data room to a stranger. | Plan change: H7 standing rule (hide API leftovers only on Data hub focus); next is H8 table→writing-routes | Next: H8 table Intermediate shows POST /articles → writes
- 2026-08-14 05:34 UTC | Hypothesis: H8 table Intermediate shows writing routes | Done: `isTableFocusOperationRoute` — prefer `writes` (cap 10), else reads/queries; grouped/nested routes become visible on table focus; verify 75 pass | Felt (node-express-realworld): Beginner still 10s; API/Data rooms unchanged. Article Intermediate is **POST /articles, PUT, DELETE, favorite mutations → writes** (7 nodes with HTTP API). No GET /articles phonebook — kill-if did not fire. Comment is POST/DELETE comments. Tag (no writers) falls back to GET /tags. Self-map: CLI → … → Viewer intact. node-cron-betterstack: unchanged. Would show the Article table room to a stranger; HTTP API box is now the leftover. | Plan change: H8 standing rule (table focus shows writer routes, cap 10); next is H9 hide API box when writers are visible | Next: H9 hide HTTP API on table Intermediate when mutations are on canvas
- 2026-08-14 06:04 UTC | Hypothesis: H9 hide HTTP API on table Intermediate when writers are visible | Done: `isTableFocusApiLeftover` — hide API hub only when the focused table has writer routes; verify 75 pass | Felt (node-express-realworld): Beginner still 10s. API hallway / Data / Articles rooms unchanged. Article Intermediate is now **five mutations + Article** (6 nodes) — POST /articles → writes, no molecule box. Comment is POST/DELETE comments. User table is four writers. Tag (no writers) still shows HTTP API + GET /tags — kill-if did not fire. Self-map: no tables; CLI → … → Viewer intact. node-cron-betterstack: unchanged. Would show Article/Comment/User table rooms to a stranger. | Plan change: H9 standing rule (hide API box only when writers exist); next is Playwright Back floor | Next: Playwright cluster + Back fixture
- 2026-08-14 06:35 UTC | Hypothesis: Playwright cluster + Back fixture | Done: 12 Express `/r0`…`/r11` compile to `HTTP endpoints (12)`; browser walk API → hub → 12 routes; crumb Overview › HTTP API › hub; Back then Esc; verify 75 + playwright 10 pass | Felt (fixture + node-express-realworld): cluster Back is obvious in the browser — no trap. RealWorld walk still a map (API hallway / Data tables / Article mutations). Self-map compiler story intact. Would show the cluster Back walk to a stranger. | Plan change: standing rule — keep the 12-route Playwright floor; next is Find User collision | Next: Find User prefers the table over the route group
- 2026-08-14 07:05 UTC | Hypothesis: Find User prefers the table over the route group | Done: `searchMatchScore` exact table +8 vs routeGroup +1; clusterRootFor tables enter the table room; list meta says “route group”; verify 76 pass | Felt (node-express-realworld): Find “user” ranks User table (108) above User route group (101) and Users (81). Enter would open the table’s writer routes, not the GET /user hallway. Self-map Find “extractors” / “cli” still hits the product systems first. Would show Find User to a stranger. | Plan change: standing rule — exact table beats same-label route group; next cancel H4 if still no dump | Next: cancel H4 unless a room postage-stamps
- 2026-08-14 07:35 UTC | Hypothesis: cancel H4 unless a room postage-stamps | Done: H4 **cancelled** (not a zoom bug). kubernetes-training hallway was 135 naked `service` units — added `service` to `KIND_CLUSTERABLE` → `Services (135)`; Express Deploy stays 1 naked unit; verify 77 pass | Felt (kubernetes-training): Beginner/hallway now one Services hub, not a 135-box starfield. Double-click still dumps 135 workloads (H10). RealWorld unchanged (API hallway / Data / Article mutations). Self-map: no fake Services hub; CLI → … → Viewer intact. node-cron: 1 cron + 1 job. Would show the k8s hallway to a stranger; not the Services drill yet. | Plan change: cancel H4; standing rule service kind-clusters; next H10 page cluster drills | Next: H10 page Services (135) drill
- 2026-08-14 08:06 UTC | Hypothesis: H10 page large kind-cluster drills | Done: `kindClusterPage` first 10 + `N more` node / inspector Show more (+10); Advanced still full; Playwright 12-route: 10 then `2 more` → 12; verify 77 + playwright 10 pass | Felt (kubernetes-training + 12-route fixture): Services (135) drill is now a **page**, not a starfield (10 + 125 more). RealWorld unchanged (no kind-cluster drill). Self-map: CLI → … → Viewer intact. Would show the paged Services drill to a stranger; hub still looks like a generic system (density legend next). | Plan change: H10 standing rule (page 10); next density legend on the hub | Next: density legend on kind-cluster hubs
- 2026-08-14 08:37 UTC | Hypothesis: H11 density legend on kind-cluster hubs | Done: `kindClusterDensityLegend` + `densityFill` on hub metadata; viewer hatch bar + caption; Playwright 12-route hallway `12 endpoints clustered`; verify 78 + playwright 10 pass | Felt (kubernetes-training): hallway Services hub now reads **135 services clustered** (full hatch) — not a generic system. Drill still 10 mixed + 125 more (42 Service / 37 Deployment / 17 Ingress mashed). RealWorld: no kind-cluster hub (domain groups); API hallway / Data / Article mutations unchanged. Self-map: no fake hubs; CLI → Compile pipeline → … → Viewer intact. Would show the k8s hallway hub to a stranger; not the Services drill. | Plan change: H11 standing rule (caption + hatch); promote H12 native-kind peel over hover-only | Next: H12 peel Services (135) by native deploy kind

---

## Tick protocol

1. **Concurrency.** If a previous tick is still running, skip.

2. **Sync + health.**
   - `git fetch origin`
   - Stay on `navigable-graph-14082026` (never master, never another feature)
   - Clean or only this tick’s files
   - Fast-forward `origin/navigable-graph-14082026` if behind
   - Absorb `origin/master` only if needed; keep conflicts small
   - `npm run build` && `npm run verify` (fix first if red)

3. **LOOP COMPLETE gate.** If complete, Idle protocol. Stop.

4. **Read this entire file.** Take **exactly one** hypothesis increment from
   Next focus. If Next focus is stale vs last Learning log, fix the plan first
   (that *is* allowed work).

5. **Implement only that increment.** Navigable graph > merge hygiene > docs.

6. **Verify + dogfood.**
   - `npm run build` && `npm run verify`
   - Scan ≥1 dogfood repo (prefer Express RealWorld) with the local build
   - Answer the feel checklist in the Learning log

7. **Update this markdown in the same commit** as the code:
   - check Done / keep ≥3 open next items
   - rewrite hypotheses if the feel disagrees
   - rewrite Next focus: `This work is done (X). Now try Y because dogfood felt Z.`
   - append Learning log (felt + plan change required)

8. **Commit + push** to `navigable-graph-14082026` only; update the existing
   draft PR if one exists, otherwise create **one** PR for the branch.
   One commit = code + plan update when possible.

9. **Stop the tick.** Do not start a second hypothesis in the same 30 minutes.

---

## Concurrency / branch hygiene

- Never commit on `master`.
- Never start `navigable-graph-2` or a parallel viewer branch.
- Do not “helpfully” add Flask/LangGraph/impact CLI work.
- Do not commit dogfood clones or `.underdelta` / `.dogfood-scans` output.

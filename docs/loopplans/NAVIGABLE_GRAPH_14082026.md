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
| H1 | **Kind clusters at >10.** Same `kind` (or endpoint facet) under one parent collapses to a hub when count > 10. | Human request; RealWorld API fan-out | Tiny graphs grow fake hubs; clusters hide the only 3 routes |
| H2 | **Back stack = focus stack + cluster stack.** Entering a cluster is a navigation frame, same as focusing a system. | Drill without Back is the trapped feeling | Extra frames confuse existing crumb tests |
| H3 | **Operation labels on story edges.** Show `POST /articles`, `writes Article`, `publishes X` on Intermediate edges; hide raw `calls`/`imports`. | “What’s happening in the operation” | Labels collide / unreadable at scale — then label only on select/hover |
| H4 | **Don’t fit-to-dump.** If visible node count > N, fit the **hubs**, not every leaf. | Zoom-out postage stamp | People miss that more nodes exist — need a “47 more” affordance |
| H5 | **Prefix / resource groups inside a cluster.** `/articles*` vs `/users*` beats a flat 47-endpoint list. | Second-level calm after H1 | Prefixes are noise on non-REST apps — fall back to kind clusters |

**Default first tick:** H1 on Express RealWorld API neighborhood. Smallest
projection or viewer grouping that collapses >10 routes. Then dogfood. Then
rewrite this table.

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

### In progress / next (keep ≥ 3 unchecked until LOOP COMPLETE)

- [ ] **H1 spike:** collapse >10 same-kind siblings (start: routes under API) on Express RealWorld
- [ ] **Dogfood note:** write felt result for RealWorld + self-map after H1
- [ ] **H2:** cluster enter/leave is a Back frame (crumb + Esc)
- [ ] **H4:** stop fit-to-view from shrinking a dump into dust
- [ ] **H3:** operation labels on Intermediate story edges
- [ ] Verify floors for cluster hubs + Back through a cluster

### Seed backlog

- H5 prefix groups inside an endpoint cluster
- Page large clusters (first 10 + “show more”) if grouping still overflows
- Hover/select-only labels if always-on labels collide
- Keyboard: ` [` / `]` sibling clusters
- Inspector: “this cluster is a view, here are the members + evidence”
- Density legend (“47 endpoints clustered”)
- Playwright: cluster + back path on a fixture with 12 dummy routes

### Next focus (edit every tick)

> **Next focus:** Hypothesis H1 — on `.dogfood-repos/node-express-realworld`, focusing the HTTP API / route neighborhood should not paint every route as a peer. Implement the smallest kind-cluster (>10) that keeps evidence. Then scan RealWorld + self-map, write how it felt, and rewrite the hypothesis table if prefix groups (H5) or fit-to-dump (H4) hurt more than raw sibling count.

---

## Learning log (append every tick)

```text
- YYYY-MM-DD HH:MM UTC | Hypothesis: … | Done: … | Felt (repo): … | Plan change: … | Next: …
```

- 2026-08-14 | Plan created on `navigable-graph-14082026` | Done: living plan + dogfood protocol | Felt: n/a (no code yet) | Plan change: opening bet is H1 cardinality collapse, then Back frames, then operation labels | Next: H1 on Express RealWorld

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

# Underdelta Autopilot Plan

Living plan for overnight / looped cloud-agent work.

**Branch lock:** `cursor/visual-system-browser-7649` only  
**Existing PR:** keep updating the draft PR for this branch — never open a second PR  
**Loop interval:** 15 minutes  
**This file:** update at the end of every successful tick

---

## Mission (read every tick)

You are **building the product**, not babysitting merge readiness.

Cursor’s `/autopilot` skill may talk about conflicts / CI / review comments. Those are **secondary hygiene** only:

1. If the branch has a real merge conflict or a failing check caused by our changes → fix that first (small).
2. Otherwise **ignore “PR is already mergeable / no CI / no comments” as a reason to stop**.
3. Always spend the tick making the architecture diagram more true, complete, or understandable.

**Never idle while the end goal is unmet.**  
If the checklist looks empty, invent the next useful increment (see Self-renewing backlog). Do not report “nothing to do.”

**Capability and polish are twin engines — never let either starve.** The Capability ladder (below) moves the frontier to new stacks and real repos. Visual polish is what makes every map actually land — it is **extremely high value, permanently**. The generated browser IS the product: a technically correct map that reads like a debugger dump has failed. "Cosmetic" is the wrong word for it; legibility, hierarchy, beauty, and calm are core product capability. The only failure mode to avoid is a *stall*: a long streak of polish-only ticks on already-excellent diagrams while a ladder rung sits untouched. Rough cadence: don't run more than two consecutive polish-only ticks while the current rung has an obvious next step, and give every newly mapped stack/repo a dedicated polish pass as soon as it scans — a capability is not done until its map is beautiful.

---

## North star user (why polish is core capability)

Underdelta is for the new wave of builders who ship real products with AI agents but are not career engineers — designers, product managers, founders, complete beginners. They vibe-code something real, then lose the plot of their own codebase. Underdelta's job is to hand them a **mind map of what they actually built**, readable with zero coding vocabulary.

That means the default browser must be:

- **Instantly legible to a non-coder** — product words, not jargon; systems and stories, not symbols
- **Beautiful and calm** — visual hierarchy, spacing, color, labels, and interaction carry the narrative
- **Trustworthy** — every visual claim clicks through to evidence

Judge every tick's output through this user's eyes. If a random designer opened the map cold and couldn't retell the product story in a minute, the work is not done — no matter how correct the extraction is.

---

## End goal

Achieve a **full, readable product-architecture diagram** for a concrete stack slice (start with Underdelta itself + a TypeScript/JS product stack):

- UI / routes / components
- APIs / handlers
- DB / tables / migrations / Prisma models
- Jobs / cron / queues / pipelines
- Evidence links back to source
- Semantic projection (product nodes), not a raw function hairball
- Default browser should tell the product story left-to-right without turning on Details

Default visualization must stay clean: **no test/fixture/verification systems in the product diagram**.

### Definition of “still unfinished”

The end goal is **not** met if any of these are true:

- Underdelta’s self-map is still mostly modules/functions instead of product systems + flows
- The mini-stack diagram is missing or weakly connected for UI / API / DB / jobs / queues / pipelines
- Overview layout does not follow real product flow
- Evidence is missing or misleading for major nodes
- `npm run verify` is missing coverage for a capability we just added
- A founder scanning Underdelta or the mini-stack would still ask “what did I actually build?”
- The default browser would confuse or repel the North star non-coder (visual noise, jargon labels, weak hierarchy)
- **Any Capability ladder rung below remains un-locked** (no golden verify lock for it)

Until those are false, **keep shipping ticks**.

---

## Capability ladder (human directive — 2026-08-02, overrides seed backlog)

Underdelta must map the stacks people actually build products with — Node.js/Express, React, Next.js, and Python servers — on **real repositories it did not write**. The ladder exists to keep the frontier moving; it does not devalue polish (see Mission — twin engines). Work the **lowest unfinished rung**. A rung counts as done only when `npm run verify` golden-locks it **and its map is polished enough for the North star user**.

1. **Real-repo generalization (Node/Express/React).** Prove the compiler on a real open-source repository this loop did not author. Pick a well-known small/medium Express + React (or similar Node) app, pin an exact commit SHA in this file, and wire it into verification as an isolated scan target: shallow-clone at the pinned SHA into a gitignored path (e.g. `.underdelta-real/<name>`), cache it between runs, and never let it enter the product diagram. The scan must complete without crashing and produce a legible product-systems map. Every place the real repo breaks extractors or projection **is the actual work** — fix those, then golden-lock a summary (floors, required systems/labels) in verify.
2. **Next.js semantics.** App-router pages/layouts/route handlers, server actions, API routes, client vs server component split. Add a small `verification/mini-next` fixture plus a pinned real Next.js repo as scan targets. Golden-lock both.
3. **Python servers.** New extractor family: FastAPI and Django routes, SQLAlchemy models, Celery tasks/schedules. Add `verification/mini-python` plus a pinned real Python repo. Golden-lock both.
4. **Self-renewal — the ladder must never be empty.** When rungs 1–3 are locked, promote the next most popular capability from the README roadmap (MongoDB collections, GraphQL, OpenAPI, Docker/monorepo layouts, …) to rung 4, 5, … and keep climbing. There is always a next stack; never conclude the mission is complete.

Rules:

- Rungs are sequential by default. Skip ahead only if genuinely blocked, and record why in the Learning log.
- Real-repo targets are pinned by commit SHA and cloned into gitignored paths — **do not vendor third-party code into this repo**.
- If cloning fails in the loop environment, fall back to enriching the local fixture for that rung and note it in the Learning log — but try the real repo first.
- Polish is **always in scope** — improving the default browser’s legibility and beauty is core capability, not a distraction. The ladder only forbids stalling: don’t string together polish-only ticks while the current rung has an obvious next step.
- Every rung ends with a polish pass on its new output: a freshly mapped stack/repo must look as good as the self-map before the rung is called locked.

### Standing guarantee: flawless on itself

Whatever else the loop builds, `node dist/cli.js scan .` on Underdelta itself — and the mini-stack — must **always** produce a stunning, accurate, demo-ready map. That is what the human opens first every morning to judge the whole project. Golden locks in verify protect correctness; regular polish attention protects beauty. Never let the self-map or mini-stack rot while chasing new stacks — if a capability change degrades them visually, fixing that is immediately the highest-priority work.

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
- [x] Plan hardened: product-build > merge-prep, never-idle, self-renewing backlog
- [x] Flow-ordered Product flow band in viewer (`metadata.flowOrder`)
- [x] Explicit `architecture.json` artifact node on Underdelta self-map (compile/graph → artifact → viewer)
- [x] Verify asserts artifact node, flowOrder chain, and artifact flows-to links
- [x] Humanized cron labels (`handler (expression)`)
- [x] Extracted `checkout` pipeline nested under Pipelines + collapsed in overview
- [x] Overview collapses system leaves (routes/components/cron/queue/…) until focus/Details
- [x] package.json `bin`/exports projection (CLI binCommands, product exposes CLI)
- [x] Inspector shows Key files (+ Package bin) for systems before raw evidence
- [x] Queue publish/consume clarity on the default map (messaging hubs stay visible)
- [x] Generated browser artifact node (`index.html`) beside architecture.json
- [x] Capture a “scan Underdelta” golden summary in verify (counts + required labels)
- [x] Richer Underdelta self-map collaboration edges (uses/renders/exposes/triggers/configures)
- [x] Surface extractor roster on Extractors system (keyFiles / child labels)
- [x] Mini-stack flowOrder band so fixture diagram reads left-to-right like Underdelta
- [x] SQL + Prisma table unification polish (names, relations, migrations edge, column dedupe)
- [x] README heading roles as weak projection hints
- [x] Viewer inspector: show collaboration edges (uses/renders/exposes) before raw imports
- [x] Inspector: surface migration + sqlName/prismaName on unified tables
- [x] Collapse relation-only Prisma fields on overview while keeping table↔table edges
- [x] Inspector: show collaboration edge detail text (not just kind · label)
- [x] Canvas: style collaboration edges differently from imports/calls
- [x] Inspector: show table↔table relation labels beside Data access nodes
- [x] Mini-stack: labeled publish/consume/migrates narrative edges on the default browser
- [x] Overview: selection badges for collaboration + table relation edges
- [x] Cron schedule hubs stay visible on overview (like messaging hubs)
- [x] Filter Map.get-style false-positive HTTP routes from TypeScript extractor
- [x] Rung 1: pin `gothinkster/node-express-realworld-example-app` @ `30b68e1e881462b2f4164ea09ab4c4f5699c7b0b`; clone into gitignored `.underdelta-real/`; wire isolated scan into `npm run verify` (smoke floors: routes/tables/core RealWorld paths)
- [x] Rung 1: strip README markdown-image / how-to heading pollution from product + system labels; collapse Prisma/SQL join-table aliases (`_ArticleToTag`, `ArticleTags`, …) on the default map
- [x] Rung 1: RealWorld default map legible — HTTP API + Data access, all routes nested under API (incl. `GET /` from `main.ts`), product tables under Data, flowOrder API→Data, routes collapsed on overview
- [x] Rung 1: golden-lock real-repo summary in verify (product title, systems/labels, 20 nested routes, 4 visible tables, flowOrder + flows-to, join collapse)

### Real-repo pins (Capability ladder)

| Rung | Repo | SHA | Local cache (gitignored) |
|------|------|-----|--------------------------|
| 1 | `gothinkster/node-express-realworld-example-app` | `30b68e1e881462b2f4164ea09ab4c4f5699c7b0b` | `.underdelta-real/node-express-realworld` |

### In progress / next

Keep **at least 3 unchecked items** here at all times (refill from Self-renewing backlog).

- [ ] Rung 1: surface User↔Article favorites (and clean User↔User follows) relation edges on the RealWorld data story — Article↔Tag already projects via `tagList`
- [ ] Rung 1 polish: RealWorld default browser pass for the North star non-coder (hierarchy/spacing/labels once the data story edges are true)
- [ ] Rung 2 prep: multi-file route frameworks / Next-style app router hints
- [ ] Rung 2: `verification/mini-next` fixture (app router, server actions, API routes, client/server components)

### Seed backlog (pull from here when In progress < 3)

Not a full roadmap — a menu the agent may reorder. Pick what most improves the **Capability ladder** now.

- Rung 2: pinned real Next.js OSS repo as scan target + golden lock
- Rung 3: Python extractor family (FastAPI/Django routes, SQLAlchemy models, Celery tasks) + `verification/mini-python`
- Rung 3: pinned real Python OSS repo as scan target + golden lock
- Rung 4+: promote next README-roadmap capability (Mongo, GraphQL, OpenAPI, Docker/monorepos, …)
- Performance pass only if scanning a real repo becomes painfully slow
- Docs only when CLI/behavior changed

### Next focus (edit every tick)

> **Next focus:** This work is done (RealWorld routes nested under HTTP API incl. `GET /`, tables under Data, flowOrder+flows-to golden-locked). Now surface User↔Article favorites (+ clean follows) relation edges so the RealWorld data story reads without opening join tables.

### Learning log (append every tick)

Append short bullets like:

```text
- YYYY-MM-DD HH:MM UTC | Done: … | Next: … | Learned: …
```

- 2026-08-02 | Done: created living autopilot plan | Next: verification mini-system | Learned: loop needs explicit non-interrupt + plan-file updates to stay coherent overnight
- 2026-08-02 02:10 UTC | Done: verification/mini-stack + npm run verify + Pipeline extraction + ignore verification/ | Next: semantic projection for Underdelta self-map | Learned: fixture must be scanned as its own root; directory-name ignores keep product diagrams clean without deleting the suite
- 2026-08-02 02:28 UTC | Done: semantic projection + self-map systems + Details toggle | Next: diagram quality pass | Learned: Autopilot does not self-wake between ticks—each 15m iteration needs a new agent trigger; path-role projection is enough to turn a module hairball into CLI/Compile/Extractors/Graph/Viewer
- 2026-08-02 02:32 UTC | Done: nest runtime nodes under systems, dedupe tables, UI vs Viewer, richer verify | Next: flow-ordered layout + architecture.json artifact node | Learned: Prisma+SQL+usage tables triple-count without normalization; high-signal nodes must be reparented onto systems or the overview still feels like a parts bin
- 2026-08-02 02:50 UTC | Done: hardened plan (product-build > merge-prep, never-idle, self-renewing backlog) | Next: flow-ordered layout + artifact node | Learned: checklist exhaustion and merge-ready autopilot skill can falsely idle a build loop unless the plan forbids it
- 2026-08-02 02:55 UTC | Done: flowOrder Product flow band + architecture.json artifact + verify | Next: cron labels, nest checkout pipeline, collapse duplicate leaves | Learned: left-to-right product story needs a dedicated flow band above lanes; artifact should sit between compile/graph and viewer
- 2026-08-02 03:00 UTC | Done: humanized cron labels, nest checkout under Pipelines, collapse overview leaves | Next: package.json projection + inspector key files | Learned: parent semantic systems should own the overview; leaves stay available on focus/Details so the map stops restating itself
- 2026-08-02 03:05 UTC | Done: package.json bin→CLI projection + keyFiles in inspector | Next: queue publish/consume clarity + index.html artifact | Learned: bin entries are strong CLI evidence and should map dist entrypoints back to src modules for keyFiles
- 2026-08-02 03:15 UTC | Done: queue `.add`→publishes + Worker→consumes, system-lifted pub/sub, messaging hubs stay on overview | Next: index.html artifact beside architecture.json | Learned: collapsing every queue hides the product story; hubs with both publishers and consumers must stay visible and edges must lift onto API/workers systems
- 2026-08-02 03:20 UTC | Done: index.html browser artifact (prior commit) + Underdelta golden summary in verify (counts/labels/floors + flowOrder) | Next: richer self-map collaboration edges | Learned: previous tick can land code without updating the plan—first reconcile Status board, then take the next open increment; golden floors beat exact counts for overnight loops
- 2026-08-02 03:25 UTC | Done: collaboration edges (compile uses extractors/graph/schema, viewer renders graph+IR, CLI triggers compile + exposes artifacts, schema configures extractors/graph) + verify | Next: extractor roster on Extractors system | Learned: flows-to alone reads as a pipeline; uses/renders/exposes/triggers make system collaboration legible without overcrowding the Product flow band
- 2026-08-02 03:30 UTC | Done: reconciled extractor roster + mini-stack flowOrder on Status board; polished SQL+Prisma table unify (labels/sources, migrates edges, FK relations, column dedupe, fix retarget-before-attach) + verify | Next: README heading roles as weak projection hints | Learned: retargeting SQL table ids after attach resurrects product→table contains; merge redirects must land before Data access nesting; column camel/snake aliases otherwise restates the schema twice
- 2026-08-02 03:40 UTC | Done: reconciled README heading hints on Status board; inspector Collaboration section (uses/renders/exposes/triggers/configures/flows-to) before Imports & calls + verify | Next: inspector migration/sqlName/prismaName on unified tables | Learned: prior tick can land a feature without updating the plan—reconcile Done first; product-story edges must outrank module imports in the inspector or founders still see a dependency dump
- 2026-08-02 03:45 UTC | Done: reconciled Prisma/SQL inspector on Status board; collapse relation-only Prisma fields (order/payments) with relationOnly + viewer hide; keep Payment↔Order edges + verify | Next: inspector collaboration edge detail text | Learned: ORM navigation fields restate table↔table edges as fake columns once Details is on; collapse them at projection time and hide unless searched so Data access stays schema-true
- 2026-08-02 03:50 UTC | Done: reconciled collaboration inspector detail on Status board; canvas `.edge.collab` / `.flows-to` styling + legend + verify | Next: inspector table↔table relation labels | Learned: prior tick can land inspector detail without plan update—reconcile first; collaboration edges were inferred-purple like noise until given a dedicated canvas class apart from import/call hairlines
- 2026-08-02 03:48 UTC | Done: reconciled table-relation inspector + narrative publish/consume/migrate badges + selection collab/relation labels + cron scheduleHub on Status board; reject Map.get-style false HTTP routes (path must look like `/…` + handler arg) + tighten narrative badge verify | Next: mini-stack system collaboration edges | Learned: `systems.get("cli")` was polluting Application with GET cli/data/…; Express extraction needs HTTP-shaped paths, and string-presence verifies must match setAttribute output not imagined static HTML
- 2026-08-02 03:56 UTC | Human directive: Capability ladder added (real Node/React repo → Next.js → Python servers → self-renewal); polish deprioritized below capability rungs; tick-start health check added because push-triggered reruns cancel in-flight ticks | Next: rung 1 — pin a real Node/Express/React repo and wire it into verify | Learned: the loop had locally optimized its two self-authored targets; the frontier is generalization to repos it did not write
- 2026-08-02 03:59 UTC | Done: rung 1 pin+wire — `gothinkster/node-express-realworld-example-app` @ `30b68e1e8814` cloned to `.underdelta-real/`, ignored by product discovery, `npm run verify` smoke-scans it (20 routes / 8 tables / core RealWorld paths) | Next: fix README markdown-image product label + join-table aliases; legible API+Data map; golden-lock | Learned: foreign Express+Prisma already extracts routes/tables; first real-repo breakage is projection (README `![…](img)` becomes the product title; implicit M2M join tables double-count)
- 2026-08-02 04:10 UTC | Done: sanitize README image titles → product label; H2/H3-only system hints; skip how-to headings; collapse `_ArticleToTag`/`ArticleTags`/favorites/follows join tables; verify locks clean labels + 4 Prisma models | Next: nest RealWorld routes/tables + flowOrder; golden-lock | Learned: scoped package names (`@api/source`) need README H1; bare `\bprisma\b`/`\bdatabase\b` in how-to headings will rename Data access unless imperatives are filtered; length-based README refine is unsafe
- 2026-08-02 04:12 UTC | Human directive #2: polish restored as first-class twin engine (North star user = non-coder vibe-builders; the browser IS the product); ladder now only forbids polish-only stalls, and each rung ends with a polish pass; standing guarantee added — self-map + mini-stack always demo-ready | Next: continue rung 1 (README image label + join-table aliases) | Learned: steering must not swing the pendulum — deprioritizing polish would rot the exact surface the product is judged on
- 2026-08-02 04:15 UTC | Done: nest all RealWorld routes under HTTP API (entrypoint `GET /` from `main.ts` was leaking); golden-lock API+Data nesting, overview route collapse, visible product tables, flowOrder API→Data + flows-to | Next: User↔Article favorites / follows relation edges | Learned: path-role owningSystem lift misses routes defined outside `/routes/`/`/api/`; when an API system exists, attach every `route` node to it before overview collapse

---

## Self-renewing backlog (mandatory)

At the **start** of every tick, after reading this file:

1. Count unchecked items under **In progress / next**.
2. If fewer than **3**, move/create items from **Seed backlog** (or invent new ones aimed at the End goal) until there are ≥ 3.
3. Rewrite **Next focus** as one concrete chunk:  
   `This work is done (X). Now do Y so we can reach Z.`
4. Never end a tick with an empty Next focus while Definition of “still unfinished” still applies.

When inventing work, ask only:

> What single change most helps the North star non-coder finally understand what they built — moving the **lowest unfinished Capability ladder rung** forward, or making an existing map meaningfully clearer and more beautiful? (If the last two ticks were polish-only and the rung has an obvious next step, pick the rung.)

---

## Tick protocol

1. **Concurrency check (mandatory)**  
   If a previous Autopilot tick / agent turn is still executing (build, verify, commit, push, or long edit in flight), **do not disturb it**. Skip this tick entirely. Try again on the next 15-minute iteration.

2. **Health check (mandatory — reruns can cancel in-flight ticks)**  
   A push on this branch restarts the loop, so the previous tick may have been cancelled mid-work (e.g. code pushed but plan not updated, or work half-landed). Before taking new work: working tree must be clean and synced with origin, `npm run build` and `npm run verify` must pass, and the Status board must match what actually landed on the branch. Reconcile and fix any of that **first**, as its own small step.

3. Read this file. Refill backlog if needed. Take **exactly one** next increment from Next focus.

4. Implement that increment only (product progress > merge hygiene).

5. Run verification:
   - `npm run build` (must pass)
   - `npm run verify` (must pass)
   - confirm default product diagram still excludes verification/tests/fixtures and gitignored real-repo clones

6. Update this markdown:
   - check off completed work
   - ensure **In progress / next** still has ≥ 3 items
   - rewrite **Next focus**
   - append one **Learning log** line

7. Commit + push on `cursor/visual-system-browser-7649` only; update the existing draft PR.  
   Prefer **one commit** containing both the feature and this plan update, so a cancellation cannot split them.

8. Stop the tick. Do not start a second major feature in the same tick.  
   (Stopping the tick ≠ being done with the product. The next Autopilot ping should continue.)

---

## Priority order

1. Keep verification green and isolated (`verification/`, `npm run verify`, gitignored real-repo clones)
2. **Standing guarantee** — self-map + mini-stack always demo-ready; fix any visual/correctness regression there immediately
3. **Capability ladder rungs** (real-repo generalization → Next.js → Python servers → self-renewal)
4. **Visual quality of the default browser** — legibility, hierarchy, beauty for the North star non-coder (equal partner to rungs; just don’t stall a rung with polish-only streaks)
5. Semantic projection + product systems/flows (as needed by the current rung)
6. Extractor improvements as needed for the current rung’s completeness/correctness
7. README only when commands/behavior changed
8. Merge conflicts / CI failures caused by our changes (hygiene only)

---

## Out of scope

- Any branch other than `cursor/visual-system-browser-7649`
- `master` commits / checkouts
- New PRs
- Graphify fork
- Sales funnels / marketing pages
- Random refactors or redesign churn with no legibility gain
- Polish-only **streaks** (3+ consecutive ticks) while the current ladder rung has an obvious next step — polish itself is high value; alternate, don’t stall
- Vendoring third-party repo code into this repository (clones stay gitignored)
- Putting tests/fixtures into the default visualization
- Stopping because the PR is draft/mergeable/no CI/no comments
- Waiting for the human to write a fuller roadmap
- Declaring the mission complete — the ladder self-renews (rung 4+)

---

## Copy-paste Autopilot prompt

Paste this into the cloud agent, then enable Autopilot at **15 minutes**:

```text
AUTOPILOT MODE — Underdelta overnight build (15 min ticks)

CANONICAL PLAN FILE (read + update every tick):
`docs/AUTOPILOT_PLAN.md`

MISSION:
Build the product toward a full readable architecture diagram. Do NOT idle just because the PR is mergeable, draft, has no CI, or has no review comments. Cursor merge-ready autopilot guidance is secondary hygiene only.

HARD LOCKS (never violate):
1) Work ONLY on branch `cursor/visual-system-browser-7649`. Never checkout master. Never create another branch. Never open a second PR.
2) Keep updating the existing draft PR for this branch only.
3) Commit + push in small chunks after each meaningful unit of work.
4) Default product visualization MUST NOT include test/fixture/verification systems.
5) Do not invent sales funnels, marketing pages, or unrelated features.
6) Prefer semantic product architecture over raw function/module hairballs.
7) CONCURRENCY: If a previous tick is still executing, DO NOT DISTURB IT. Skip and try next 15m iteration.
8) NEVER IDLE while docs/AUTOPILOT_PLAN.md says the end goal is unfinished. If the checklist is empty, refill from Seed backlog / invent the next diagram-improving chunk.
9) Keep ≥ 3 items in “In progress / next” at all times.

PRODUCT GOAL:
Climb the Capability ladder in the plan file: (1) prove the compiler on a REAL Node/Express/React repo the loop did not write (pinned SHA, gitignored clone, golden-locked in verify), (2) Next.js app-router semantics, (3) Python servers (FastAPI/Django/SQLAlchemy/Celery), (4) self-renew from the README roadmap. Evidence-backed, semantically projected, flow-readable. Capability and polish are TWIN ENGINES: the browser is the product and must stay beautiful and legible for non-coders; the ladder only forbids polish-only stalls. The Underdelta self-map and mini-stack must ALWAYS stay demo-ready.

EACH 15-MINUTE TICK (one chunk):
A) Concurrency check. If busy, skip.
A2) Health check: a push-triggered rerun may have cancelled the previous tick mid-work. Ensure clean synced tree, green build+verify, and plan matches what landed. Reconcile first.
B) Read `docs/AUTOPILOT_PLAN.md`. Refill backlog if < 3 open items. Pick ONE Next focus increment (lowest unfinished ladder rung).
C) Implement it (product progress first).
D) Run VERIFICATION.
E) If verification fails: fix before moving on.
F) Update `docs/AUTOPILOT_PLAN.md`:
   - check off completed work
   - keep ≥ 3 open next items
   - rewrite Next focus (“This work is done, but now I want to do X so we can reach Y”)
   - append one Learning log line
G) Commit, push to `cursor/visual-system-browser-7649`, update existing PR.
H) Stop that tick only (not the mission). Wait for next Autopilot ping.

PRIORITY ORDER:
1) Keep verification green/isolated
2) Standing guarantee: self-map + mini-stack always demo-ready
3) Capability ladder rungs (real repo → Next.js → Python → self-renew)
4) Visual quality/legibility of the default browser (equal partner to rungs; no polish-only stalls)
5) Semantic systems/flows as needed by the current rung
6) Extractors as needed by the current rung
7) README only for behavior changes
8) Merge/CI hygiene only if blocking

VERIFICATION:
- `npm run build` must pass
- `npm run verify` must pass
- Default scan must not include verification/tests/fixtures

OUT OF SCOPE:
- New branches / new PRs / master
- Graphify fork / sales / random refactors
- Stopping because PR looks “done” while the architecture diagram goal is unfinished
- Interrupting an in-flight previous tick

DONE LOOKS LIKE (morning):
- Many commits on `cursor/visual-system-browser-7649`
- Plan file shows a long Done / Next / Learning trail (backlog never starved)
- verify green
- Underdelta produces a legible, golden-locked map of at least one REAL repo it did not write
- Ladder rungs visibly climbed (Next.js / Python progress underway)
- Self-map + mini-stack still stunning when the human opens them first thing
```

---

## Human notes

### Loop setup reminder

This markdown steers **what** to build. **Autopilot/Automation in Cursor** must still be ON to wake the agent every 15 minutes. If no ping arrives, the agent will not continue by itself.

### Morning checklist

```bash
git fetch origin
git checkout cursor/visual-system-browser-7649
git pull origin cursor/visual-system-browser-7649
npm ci
npm run build
npm run verify
node dist/cli.js scan .
# open .underdelta/index.html
# optional: node dist/cli.js scan verification/mini-stack -o .underdelta-verify
```

Skim Status board + Learning log before reviewing the PR.

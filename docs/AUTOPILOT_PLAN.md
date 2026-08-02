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

Until those are false, **keep shipping ticks**.

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

### In progress / next

Keep **at least 3 unchecked items** here at all times (refill from Self-renewing backlog).

- [ ] Overview layout: rank/position systems by flows-to so the browser reads left-to-right
- [ ] Surface `architecture.json` / output artifact as an explicit node in Underdelta self-map
- [ ] Expand projection heuristics beyond filename conventions (package exports, README roles)
- [ ] Expand verify assertions as new architectural kinds become extractable

### Seed backlog (pull from here when In progress < 3)

Not a full roadmap — a menu the agent may reorder. Pick what most improves the end goal now.

- Flow-ordered / dependency-ordered overview layout in the viewer
- Explicit artifact node(s): `architecture.json`, generated browser, CLI commands
- Richer Underdelta self-map edges (compile uses extractors, viewer renders graph, etc.)
- Projection from package.json exports / bin entries / README headings
- Better cron/job labeling (not raw `"0 * * * *"` only)
- Queue publish/consume clarity on the default map
- Nest or relate extracted `checkout` pipeline under Pipelines without duplicate confusion
- Collapse noisy default-visible leaves when a parent system already tells the story
- Inspector: show system → key files prominently
- Multi-file route frameworks / Next-style app router hints (only if it helps the chosen stack)
- SQL + Prisma table unification polish (names, relations, migrations edge)
- Verify: assert flow-order metadata / artifact node / no duplicate tables forever
- Capture a “scan Underdelta” golden summary in verify (counts + required labels)
- Performance pass only if scan becomes painful on mini-stack / self repo
- Docs only when CLI/behavior changed

### Next focus (edit every tick)

> **Next focus:** This work is done (plan hardened for unattended product building). Now implement flow-ordered overview layout (systems ranked by flows-to / depends-on) and add an explicit `architecture.json` artifact node on the Underdelta self-map so compile → artifact → viewer reads as one story.

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

---

## Self-renewing backlog (mandatory)

At the **start** of every tick, after reading this file:

1. Count unchecked items under **In progress / next**.
2. If fewer than **3**, move/create items from **Seed backlog** (or invent new ones aimed at the End goal) until there are ≥ 3.
3. Rewrite **Next focus** as one concrete chunk:  
   `This work is done (X). Now do Y so we can reach Z.`
4. Never end a tick with an empty Next focus while Definition of “still unfinished” still applies.

When inventing work, ask only:

> What single change would make the default diagram more accurately answer “what did I actually build?” for Underdelta or the mini-stack?

---

## Tick protocol

1. **Concurrency check (mandatory)**  
   If a previous Autopilot tick / agent turn is still executing (build, verify, commit, push, or long edit in flight), **do not disturb it**. Skip this tick entirely. Try again on the next 15-minute iteration.

2. Read this file. Refill backlog if needed. Take **exactly one** next increment from Next focus.

3. Implement that increment only (product progress > merge hygiene).

4. Run verification:
   - `npm run build` (must pass)
   - `npm run verify` (must pass)
   - confirm default product diagram still excludes verification/tests/fixtures

5. Update this markdown:
   - check off completed work
   - ensure **In progress / next** still has ≥ 3 items
   - rewrite **Next focus**
   - append one **Learning log** line

6. Commit + push on `cursor/visual-system-browser-7649` only; update the existing draft PR.

7. Stop the tick. Do not start a second major feature in the same tick.  
   (Stopping the tick ≠ being done with the product. The next Autopilot ping should continue.)

---

## Priority order

1. Keep verification green and isolated (`verification/`, `npm run verify`)
2. Semantic projection + product systems/flows
3. Full self-visualization of Underdelta (CLI → compile → extractors → graph → artifact → viewer)
4. Full diagram quality for the mini-stack stack slice
5. Extractor improvements only as needed for diagram completeness/correctness
6. Viewer improvements only when they improve product understanding
7. README only when commands/behavior changed
8. Merge conflicts / CI failures caused by our changes (hygiene only)

---

## Out of scope

- Any branch other than `cursor/visual-system-browser-7649`
- `master` commits / checkouts
- New PRs
- Graphify fork
- Sales funnels / marketing pages
- Random refactors or cosmetic redesign churn
- Putting tests/fixtures into the default visualization
- Stopping because the PR is draft/mergeable/no CI/no comments
- Waiting for the human to write a fuller roadmap

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
FULL, readable product-architecture diagram for a concrete stack (Underdelta self-map first, then TS/JS mini-stack): UI, APIs, DB/tables, jobs/cron/queues/pipelines — evidence-backed, semantically projected, flow-readable in the default browser.

EACH 15-MINUTE TICK (one chunk):
A) Concurrency check. If busy, skip.
B) Read `docs/AUTOPILOT_PLAN.md`. Refill backlog if < 3 open items. Pick ONE Next focus increment.
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
2) Semantic systems/flows + self-map completeness
3) Diagram quality / layout / evidence for Underdelta + mini-stack
4) Extractors only as needed
5) Viewer only for understanding
6) README only for behavior changes
7) Merge/CI hygiene only if blocking

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
- Default diagrams for Underdelta + mini-stack clearly answer “what did I build?”
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

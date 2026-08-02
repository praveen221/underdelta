# Loop plan — Walkable graph (3-tier progressive disclosure)

Living plan for a **scoped** Autopilot / cloud-agent loop.

**Branch lock:** `walkable-graph-02082026` only  
**Base:** `master` (v0 already merged)  
**Do not** open a second PR for this work — update the existing draft PR for this branch  
**Loop interval:** 15 minutes (or whatever the human arms)  
**This file:** read at the start of every tick; update at the end of every successful tick  
**Created:** 2026-08-02  

Related context (do not expand scope into these yet):

- [`docs/V0_BUILD_CONTEXT.md`](../V0_BUILD_CONTEXT.md) — what v0 already shipped  
- Broader roadmap (query API, more stacks, graph→infra) is **out of scope** for this loop  

---

## Mission (read every tick)

You are making the Underdelta browser a **place you walk**, not a dump of every node and edge.

The v0 self-map already has a strong Product Flow. With **Details: on**, it becomes a function phonebook and edge spaghetti (269+ components). Fix that with **three tiers** and **cluster-scoped** advanced detail.

**Twin engines still apply:** capability (correct IR / projection) and polish (calm, legible UI). Prefer walkability over new extractors.

**Never idle while this plan’s End goal is unmet.**  
If the checklist looks empty, refill from Seed backlog — but **only** with walkable-graph items (see Out of scope).

Ignore “PR mergeable / no CI / no comments” as a reason to stop unless there is a real merge conflict or a failing check caused by our changes.

---

## End goal

A **3-tier navigable architecture browser** for Underdelta self-map + `verification/mini-stack` (and no regressions on `npm run verify`):

| Tier | Name | What the user sees |
|------|------|--------------------|
| 0 | **Beginner** | Product Flow + top systems only. Calm. Answers “what did I build?” in ~1 minute. Default cold open. |
| 1 | **Intermediate** | Focus a system/hub → its important children (routes, tables, jobs, deploy units, collab edges) — still clustered, not every function. |
| 2 | **Advanced** | Functions, modules, dense edges — **only inside the current focus/cluster**, never the whole repo at once. |

Must also have:

- Clear **enter / back / breadcrumb** (or equivalent) so tiers feel like navigation, not a toggle that explodes the canvas  
- **Details-on must not** mean “show every function in the repository”  
- Standing guarantee: self-map + mini-stack still demo-ready; `npm run build` + `npm run verify` green  
- Golden locks in verify for tier behavior where practical (floors, not brittle pixel tests)  

### Definition of “still unfinished”

Keep shipping ticks while any of these are true:

- Cold open (Beginner) still feels like a parts bin or requires Details to understand the product  
- Turning Details on (or Advanced) still fans out whole-repo function lists + edge hairballs  
- There is no way to focus a system and see only its neighborhood  
- No breadcrumb / back path after drilling in  
- Verify/build broken, or self-map/mini-stack visually regressed  
- Plan Status board Next focus empty while End goal unmet  

When the End goal definition above is met, **stop inventing work**. Mark the plan **LOOP COMPLETE**, push, and leave a short “handoff” note under Learning log. Do **not** start query APIs, new languages, or infra editing on this branch.

---

## Status board

Update checkboxes + Next focus every tick.

### Done

- [x] v0 on `master` (extractors, projection, viewer, verify, one-command scan) — prior work  
- [x] This loop plan created  

### In progress / next

Keep **at least 3 unchecked items** here until LOOP COMPLETE (refill from Seed backlog).

- [ ] Define tier model in viewer UX: Beginner (default) / Intermediate / Advanced — labels a non-coder understands (not only “Details on/off”)  
- [ ] Beginner cold open: Product Flow + systems; hide function/module hairballs by default on self-map + mini-stack  
- [ ] Focus / enter a system: Intermediate neighborhood (hubs + important children + key collab edges only)  
- [ ] Advanced only for current focus: functions/edges scoped to cluster; no whole-repo Details dump  
- [ ] Navigation: breadcrumb + back to Beginner (and Intermediate if nested)  
- [ ] Verify golden floors for tier/focus behavior (self-map and/or mini-stack)  
- [ ] Polish pass: legend/inspector copy matches tiers; standing guarantee self-map cold-read  

### Seed backlog (walkable-graph only)

Pull from here when In progress &lt; 3. Reorder freely.

- Collapse or restyle derived edge fans so Intermediate isn’t yellow spaghetti  
- Search jumps to a node and **enters its cluster** (not only highlights in a god-graph)  
- Keyboard: Esc = back one tier  
- Persist last tier/focus in `sessionStorage` for reload comfort  
- Mini-stack + one real-repo pin spot-check in Learning log (manual note OK if verify covers floors)  
- Docs: short “How to read the map” blurb in README only if behavior changed  

### Next focus (edit every tick)

> **Next focus:** Plan armed. First implement a clear Beginner vs Intermediate vs Advanced model in the viewer (replace or wrap “Details: on/off”) so cold open stays Product-Flow-led and Details no longer means “show every function in the repo.”

### Learning log (append every tick)

```text
- YYYY-MM-DD HH:MM UTC | Done: … | Next: … | Learned: …
```

- 2026-08-02 | Plan created for walkable 3-tier graph on `walkable-graph-02082026` | Next: tier model in viewer | Learned: v0 Product Flow is strong; Details-on whole-repo dump is the failure mode to kill  

---

## Tick protocol

1. **Concurrency check**  
   If a previous tick is still running (build/verify/commit/push in flight), **skip this tick**. Do not disturb it.

2. **Sync + conflict / health check (mandatory)**  
   Before new work:
   - `git fetch origin`
   - Ensure you are on `walkable-graph-02082026` (never `master`, never another feature branch)
   - `git status` clean or only intentional in-progress files from *this* tick  
   - If behind `origin/walkable-graph-02082026`, fast-forward or rebase carefully; **resolve merge conflicts before new features**  
   - If `master` moved and this branch should absorb it, merge/rebase `origin/master` when needed; fix conflicts small  
   - `npm run build` and `npm run verify` must pass (or fix failures first as the tick’s only job)  
   - Reconcile Status board with what actually landed (prior tick may have been cancelled mid-push)

3. **Read this file.** Refill In progress to ≥ 3 if needed. Take **exactly one** Next focus increment.

4. **Implement that increment only** (walkable graph > merge hygiene > docs).

5. **Verify:**
   - `npm run build`
   - `npm run verify`
   - Spot-check: Beginner cold open on self-map must not show whole-repo function lists  

6. **Update this markdown** in the **same commit** as the code when possible:
   - check off Done  
   - keep ≥ 3 open next items until LOOP COMPLETE  
   - rewrite Next focus: `This work is done (X). Now do Y so we can reach Z.`  
   - append one Learning log line  

7. **Commit + push** to `walkable-graph-02082026` only; update the existing draft PR for this branch.  
   Prefer one commit = feature + plan update (avoids desync if a push-triggered rerun cancels the tick).

8. **Stop the tick.** Do not start a second major feature in the same tick.  
   Stopping ≠ mission complete — unless End goal is met (then mark LOOP COMPLETE and stop inventing).

---

## Priority order

1. Keep build/verify green; fix conflicts/regressions first  
2. Beginner cold open calm (Product Flow–led)  
3. Focus → Intermediate neighborhood  
4. Advanced scoped to focus only  
5. Breadcrumb / back navigation  
6. Verify locks + polish copy  
7. README only if user-facing behavior changed  
8. **No** new extractors, languages, query MCP, or infra graph-editing on this branch  

---

## Out of scope (hard)

- Any branch other than `walkable-graph-02082026`  
- Commits to `master` directly  
- New PRs (update the one draft for this branch)  
- New capability ladder rungs / new language extractors  
- Graphify-style full symbol graph as the default view  
- Greplica-style session memory  
- Graph edit → infra suggestions  
- npm publish / marketing pages  
- Expanding scope because “the PR looks done” while End goal unmet — or the reverse: inventing Phase B/C work after LOOP COMPLETE  

---

## Copy-paste Autopilot prompt

Paste into the cloud agent, then enable Autopilot / push-retrigger as the human prefers:

```text
AUTOPILOT MODE — Underdelta walkable graph (scoped loop)

CANONICAL PLAN FILE (read + update every tick):
`docs/loopplans/WALKABLE_GRAPH_02082026.md`

MISSION:
Make the architecture browser 3-tier and walkable (Beginner / Intermediate / Advanced).
Advanced detail must be cluster-scoped. Do NOT dump whole-repo functions when Details is on.
Do NOT idle just because the PR is mergeable. Do NOT invent new extractors or languages.

HARD LOCKS:
1) Work ONLY on branch `walkable-graph-02082026`. Never checkout master for feature work. Never open a second PR.
2) Update the existing draft PR for this branch only.
3) Commit + push small chunks; prefer feature + plan update in one commit.
4) CONCURRENCY: If a previous tick is still executing, SKIP.
5) Every tick START: fetch, sync, resolve conflicts, build+verify green, reconcile Status board — then one Next focus item.
6) Keep ≥ 3 items in “In progress / next” until End goal met; then mark LOOP COMPLETE and stop inventing.
7) Out of scope: new stacks, MCP/query product, infra graph-edit, Greplica memory.

EACH TICK:
A) Concurrency check → skip if busy
B) Sync/conflict/health check
C) Read plan → one Next focus increment
D) Implement
E) npm run build && npm run verify
F) Update plan (Done / Next / Learning log)
G) Commit + push to walkable-graph-02082026
H) Stop tick

DONE LOOKS LIKE:
- Beginner cold open is Product-Flow-led and calm
- User can enter a system (Intermediate) and open Advanced only inside that focus
- Breadcrumb/back works
- verify green; plan shows LOOP COMPLETE
```

---

## Human notes

### Arming the loop

This file steers **what** to build. The human turns on Autopilot / automation (e.g. push-retrigger or 15m ticks). If no ping arrives, the agent will not continue.

### Morning / handoff checklist

```bash
git fetch origin
git checkout walkable-graph-02082026
git pull origin walkable-graph-02082026
npm ci
npm run build
npm run verify
./scripts/run.sh
# confirm Beginner calm; drill into Extractors / Compile; Advanced scoped; back works
```

Skim Status board + Learning log before reviewing the PR.

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

---

## LOOP COMPLETE — soft stop (do not stop early)

Automation may keep **waking** ticks (e.g. on every push). That is OK.  
Once this section says **LOOP COMPLETE**, woken ticks must **idle without inventing** and **must not push** (push would retrigger forever).

### Do not mark LOOP COMPLETE early

Mark **LOOP COMPLETE** only when **every** acceptance gate below is true.  
If even one gate fails → keep shipping ticks (refill backlog if needed).  
Do **not** mark complete because: PR is mergeable, checklist looks long, “good enough”, or polish feels endless.

#### Acceptance gates (all required)

1. **Tier UX exists** — User-visible Beginner / Intermediate / Advanced (or equivalent plain-language controls). Not only a raw “Details on/off” that dumps the repo.  
2. **Beginner cold open** — Default view is Product Flow + top systems; no whole-repo function/module phonebook; self-map answers “what did I build?” without drilling.  
3. **Intermediate focus** — User can enter/focus a system (e.g. Extractors, Compile, mini-stack API) and see that system’s important neighborhood only.  
4. **Advanced is cluster-scoped** — Functions/modules/dense edges appear only for the current focus; Advanced/Details must **not** fan out every function in the repository.  
5. **Navigation** — Breadcrumb and/or Back returns to Intermediate then Beginner (Esc back is a plus, not a gate).  
6. **Verify green** — `npm run build` and `npm run verify` pass; tier/focus behavior has golden floors where practical.  
7. **Standing guarantee** — Self-map + mini-stack still demo-ready (no visual regression that makes Beginner worse than pre-loop).  
8. **Status board** — All seven In-progress walkable items checked (or explicitly cancelled with Learning-log reason); Seed backlog items may remain unchecked forever — they are optional polish, **not** blockers for LOOP COMPLETE.

Optional Seed backlog (edge restyle, search-enters-cluster, Esc, sessionStorage, README blurb) is **nice-to-have**. Prefer LOOP COMPLETE over infinite polish once gates 1–8 pass.

### How to declare LOOP COMPLETE (one-time)

When gates 1–8 all pass in a single tick:

1. Set **Loop status** below to `LOOP COMPLETE`.  
2. Rewrite Next focus to: `LOOP COMPLETE — idle. Do not invent work. Human should disable push-automation when convenient.`  
3. Append Learning log handoff line.  
4. Commit + push **once** (this final status push may wake one more tick — that next tick must follow Idle protocol and **not** push).  

### Idle protocol (every tick while Loop status = LOOP COMPLETE)

A woken agent must:

1. Concurrency + sync/health check as usual.  
2. Re-read acceptance gates.  
3. **If any gate regressed** (verify fail, Beginner dumps functions again, focus broken): clear LOOP COMPLETE → set Loop status back to `ACTIVE`, put the regression in Next focus, fix it, then you may push.  
4. **If all gates still pass:**  
   - Do **not** invent features, polish, or backlog items  
   - Do **not** refill In progress  
   - Do **not** commit  
   - Do **not** push (critical: avoids push→wake→push loops)  
   - Exit the tick immediately with a one-line summary: `IDLE: LOOP COMPLETE — no push`  

Human still turns off automation for a hard stop; Idle protocol stops the **runaway commit cycle**.

### Loop status

```text
LOOP COMPLETE
```

*(Change the line above to `LOOP COMPLETE` only when acceptance gates 1–8 all pass.)*

---

## Status board

Update checkboxes + Next focus every tick (unless Idle protocol).

### Done

- [x] v0 on `master` (extractors, projection, viewer, verify, one-command scan) — prior work  
- [x] This loop plan created  
- [x] Soft-stop / LOOP COMPLETE idle protocol documented  
- [x] Tier model in viewer UX: `View: Beginner | Intermediate | Advanced` (replaces Details on/off); Advanced kinds require focus (no whole-repo dump); verify golden floor  
- [x] Beginner cold open polish: `intermediateKinds` + Product Flow gate; mini-stack/self-map stay flow-led; verify golden floor  
- [x] Focus / enter a system: Intermediate neighborhood via `focusNeighborhood` (contains + story neighbors); calmOverview so Intermediate/Advanced without focus do not global-uncollapse; Focus crumb + auto-tier; verify floors  
- [x] Advanced inside focus: `showsAdvancedKind` — modules/columns at Advanced+focus; functions after drilling into a code container (module/api/…); “code in focus” tier/crumb copy; verify floors (Extractors modules, Checkout functions, typescript module functions)  
- [x] Navigation: `Overview › …` breadcrumb + Back via `navigateFocusStack` / `goOverview`; `syncTierToFocus` keeps View label on Intermediate then Beginner; verify floors  
- [x] Polish pass: `walk-hint` + `emptyInspectorMessage` tier copy; Code lane (not Details); self-map Beginner cold-read floor (CLI→…→Viewer)  
- [x] Intermediate edge calm: collapse `contains` ownership fans; gate/quiet derived `depends-on`/`calls`/`imports` hairlines (`showsStructuralEdge`); verify floors  
- [x] Keyboard: Esc = back one tier (`goBack` / `handleEscapeKey`; search clear first when typing); verify floors  
- [x] Search enters cluster: `clusterRootFor` + `enterSearchMatch` (Enter/click); results list; calmOverview ignores query (no god-graph dump); verify floors  
- [x] Persist last tier/focus in `sessionStorage` (`persistWalkState` / `restoreWalkState`, key per project root); stale ids fall back to Beginner; verify floor  
- [x] Mini-stack + self-map pin spot-check recorded in Learning log (`npm run verify` floors as evidence)  
- [x] Docs: short “How to read the map” blurb in README (tiers + search enters cluster + reload keeps walk)  
- [x] Final LOOP COMPLETE gate pass (gates 1–8 re-checked in one tick; Loop status set)  

### In progress / next

Keep **at least 3 unchecked items** here until LOOP COMPLETE (refill from Seed backlog).  
These remaining items are the **mandatory** walkable slice — finishing them (with gates 1–8) is what completes the loop:

- [x] Final LOOP COMPLETE gate pass (re-check gates 1–8 in one tick; set Loop status)  
- [x] *(slot — cancelled: completion tick only; no polish invented — LOOP COMPLETE)*  
- [x] *(slot — cancelled: completion tick only; no polish invented — LOOP COMPLETE)*  

### Seed backlog (optional — not required for LOOP COMPLETE)

Pull from here when In progress &lt; 3 **and** Loop status is ACTIVE. Reorder freely.  
**Do not** use this list to delay LOOP COMPLETE after gates 1–8 pass.

- *(empty — LOOP COMPLETE; do not invent polish)*  

### Next focus (edit every tick)

> **Next focus:** LOOP COMPLETE — idle. Do not invent work. Human should disable push-automation when convenient.

### Learning log (append every tick)

```text
- YYYY-MM-DD HH:MM UTC | Done: … | Next: … | Learned: …
```

- 2026-08-02 | Plan created for walkable 3-tier graph on `walkable-graph-02082026` | Next: tier model in viewer | Learned: v0 Product Flow is strong; Details-on whole-repo dump is the failure mode to kill  
- 2026-08-02 | Soft-stop hardened: acceptance gates 1–8, Loop status ACTIVE/COMPLETE, idle ticks must not push | Next: tier model in viewer | Learned: push-triggered automation only runs away if idle ticks still commit/push  
- 2026-08-02 | Done: replaced Details on/off with View: Beginner/Intermediate/Advanced; advancedKinds only when Advanced+focus; verify locks tier control | Next: Beginner cold-open polish + Intermediate focus neighborhood | Learned: Intermediate = reveal collapsedInOverview hubs/routes; Advanced without focus must stay non-dumping or the old failure mode returns under a new label  
- 2026-08-02 | Done: Beginner hides intermediateKinds + non-flowOrder when Product Flow exists; verify cold-open floors for self-map + mini-stack | Next: Focus → Intermediate neighborhood (not global uncollapse) | Learned: IR “visible on overview” for cron/queue hubs meant Intermediate availability; viewer Beginner must denylist those kinds or mini-stack stays a parts bin  
- 2026-08-02 13:55 UTC | Done: focusNeighborhood (contains + story neighbors); calmOverview stops Intermediate global dump; focus auto-tiers + Focus crumb; verify Extractors/Checkout floors | Next: Advanced-in-focus modules/functions + “code in focus” copy | Learned: many Product Flow systems only contain modules — without collab/story neighbor expansion Intermediate focus would be empty; Intermediate-without-focus must stay calm or the parts-bin returns under a new label 
- 2026-08-02 13:58 UTC | Done: showsAdvancedKind (modules at system Advanced; functions inside module/api focus); “code in focus” tier/crumb; verify Extractors/Checkout/typescript-module floors | Next: Navigation breadcrumb + Back tier sync | Learned: Extractors contains 140 functions — Advanced on a system must reveal modules first or cluster-scope still feels like a phonebook; drill into a module for functions  
- 2026-08-02 14:01 UTC | Done: Overview › breadcrumb + navigateFocusStack/goOverview; syncTierToFocus demotes Advanced→Intermediate→Beginner on Back; verify nav floors | Next: Polish legend/inspector/empty-state copy + self-map cold-read | Learned: history used to push null on first focus — filter/stack helpers keep crumbs honest; Back must sync tier on every step, not only when focus becomes null  
- 2026-08-02 14:05 UTC | Done: walk-hint + emptyInspectorMessage by tier; Code lane; verify self-map Beginner story labels | Next: restyle derived edge fans in Intermediate focus | Learned: static “Select a component…” empty copy still said Details-era dump; tier-aware chrome makes Beginner/Advanced failure modes self-explanatory without new controls  
- 2026-08-02 14:10 UTC | Done: showsStructuralEdge — contains fans never painted; derived depends-on/calls/imports selection- or Advanced-gated + quiet `.edge.structural` restyle; verify Extractors fan floor | Next: Esc = back one tier | Learned: Extractors Intermediate had 12 yellow contains edges — ownership is already the neighborhood layout, so painting contains is pure spaghetti; keep story edges (flows-to/collab/narrative) always-on  
- 2026-08-02 14:12 UTC | Done: Esc → goBack (same stack step as Back); search clear/blur first when typing; verify Escape handler floor | Next: Search enters cluster | Learned: reuse goBack for mouse + keyboard so Esc cannot drift from Back; clear search before navigating or Esc steals the find affordance mid-type  
- 2026-08-02 14:25 UTC | Done: Search Enter/click → clusterRootFor + enterSearchMatch; results list; calmOverview ignores query; verify createCheckout/Order/Extractors floors | Next: sessionStorage tier/focus | Learned: query-driven visibleNodes was the god-graph; jump via cluster roots (function→module, table→system) keeps Find aligned with double-click walk  
- 2026-08-02 14:28 UTC | Done: sessionStorage persistWalkState/restoreWalkState (tier+focus+history+selected; key per project root; stale ids → Beginner); verify floor | Next: mini-stack + real-repo pin spot-check in Learning log | Learned: restore must keep manual Advanced-without-focus (don’t always syncTierToFocus on hydrate) or reload fights the View cycle; validate every id against byId  
- 2026-08-02 14:30 UTC | Done: spot-check — `npm run build` + `npm run verify` green; mini-stack Beginner 6 flow (Storefront→…→Catalog; no Order/Payment/queue leak); Checkout Intermediate 9 nodes (routes+collab, no tables); self-map Beginner 8 (CLI→…→index.html); Extractors Intermediate 16 / Advanced 13 modules (no function dump); typescript module Advanced 20 functions; search createCheckout→src/server.ts | Next: README “How to read the map” | Learned: verify walkable floors already pin both demo surfaces; a separate manual browser pass would only restate the same Beginner/focus/Advanced assertions  
- 2026-08-02 14:35 UTC | Done: README “How to read the map” — Beginner/Intermediate/Advanced walk, Find→cluster, Back/Esc/Overview, reload keeps tab-session walk | Next: LOOP COMPLETE gate pass | Learned: keep the blurb under Try it so scan users hit tiers before the schema dump; mirror viewer chrome words (View / Find / Back / Esc) so docs and UI stay one vocabulary  
- 2026-08-02 14:40 UTC | Done: LOOP COMPLETE gate pass — gates 1–8 true (`npm run build` + `npm run verify` green; Beginner/focus/Advanced/nav floors hold; filler In-progress slots cancelled) | Next: IDLE — no invent, no push | Learned: declare complete only after a fresh verify in the same tick; leftover ≥3 filler slots are cancel-with-reason, not polish bait; next woken tick must Idle protocol (no push)  

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

3. **LOOP COMPLETE gate (mandatory)**  
   Read **Loop status**. If it is `LOOP COMPLETE`, follow **Idle protocol** above (re-check gates; fix regressions with push; otherwise **no commit, no push, exit**).  
   Do not proceed to invent work.

4. **Read this file.** While ACTIVE: refill In progress to ≥ 3 if needed (mandatory seven first; optional seed only to fill). Take **exactly one** Next focus increment.  
   Do **not** declare LOOP COMPLETE until acceptance gates 1–8 all pass.

5. **Implement that increment only** (walkable graph > merge hygiene > docs).

6. **Verify:**
   - `npm run build`
   - `npm run verify`
   - Spot-check: Beginner cold open on self-map must not show whole-repo function lists  

7. **Update this markdown** in the **same commit** as the code when possible:
   - check off Done  
   - keep ≥ 3 open next items until LOOP COMPLETE  
   - rewrite Next focus: `This work is done (X). Now do Y so we can reach Z.`  
   - append one Learning log line  
   - if gates 1–8 now all pass → set Loop status to `LOOP COMPLETE` (see How to declare)

8. **Commit + push** to `walkable-graph-02082026` only; update the existing draft PR for this branch.  
   Prefer one commit = feature + plan update (avoids desync if a push-triggered rerun cancels the tick).  
   **Exception:** Idle protocol after LOOP COMPLETE — no push.

9. **Stop the tick.** Do not start a second major feature in the same tick.

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
Do NOT idle early (PR mergeable ≠ done). Do NOT invent new extractors or languages.
When plan Loop status is LOOP COMPLETE: IDLE — no invent, no commit, no push (unless a gate regressed).

HARD LOCKS:
1) Work ONLY on branch `walkable-graph-02082026`. Never checkout master for feature work. Never open a second PR.
2) Update the existing draft PR for this branch only.
3) Commit + push small chunks while ACTIVE; prefer feature + plan update in one commit.
4) CONCURRENCY: If a previous tick is still executing, SKIP.
5) Every tick START: fetch, sync, resolve conflicts, build+verify green, reconcile Status board.
6) If Loop status is LOOP COMPLETE → Idle protocol (no push). If ACTIVE → one Next focus item.
7) Mark LOOP COMPLETE only when acceptance gates 1–8 ALL pass. Optional seed backlog must not delay completion.
8) Out of scope: new stacks, MCP/query product, infra graph-edit, Greplica memory.

EACH TICK:
A) Concurrency check → skip if busy
B) Sync/conflict/health check
C) If LOOP COMPLETE → Idle protocol → exit (no push)
D) Read plan → one Next focus increment (ACTIVE only)
E) Implement
F) npm run build && npm run verify
G) Update plan; if gates 1–8 pass set LOOP COMPLETE
H) Commit + push to walkable-graph-02082026 (not when idling complete)
I) Stop tick

DONE LOOKS LIKE:
- Acceptance gates 1–8 true; Loop status line is LOOP COMPLETE
- Beginner calm; Intermediate focus; Advanced cluster-scoped; breadcrumb/back; verify green
- Further woken ticks exit with IDLE: LOOP COMPLETE — no push
```

---

## Human notes

### Arming the loop

This file steers **what** to build. The human turns on Autopilot / automation (e.g. push-retrigger or 15m ticks). If no ping arrives, the agent will not continue.

When Loop status becomes `LOOP COMPLETE`, idle ticks should stop pushing (soft stop). For a hard stop, **disable the push/automation trigger** in Cursor.

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

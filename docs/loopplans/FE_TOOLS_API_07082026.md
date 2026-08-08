# Loop plan — FE tools → API story (route drill)

Living plan for a **scoped** Autopilot / cloud-agent loop.

**Branch lock:** `fe-tools-api-07082026` only  
**Base:** `master` @ post FE-shells merge (`1ab6074` or later)  
**Backup of pre-shells era:** `backup-07082026-1749` (do not commit on)  
**Do not** open a second PR — update the existing draft PR for this branch  
**Loop interval:** 15–30 minutes (human-armed)  
**This file:** read at start of every tick; update at end of every successful tick  
**Created:** 2026-08-07  

Related:

- [`FE_SHELLS_07082026.md`](FE_SHELLS_07082026.md) — LOOP COMPLETE (shells exist; Intermediate routes-only is necessary but **not sufficient**)  
- [`FE_DEPTH_UX_06082026.md`](FE_DEPTH_UX_06082026.md) — FE→API edges exist at aggregate/`apis/**` level  
- Human feedback (2026-08-07): Scholar `Home → Protected → Auth → HTTP API` is **not** a win — drill must show tools then API calls from those tools  

**Pitch:**  
Beginner is the **access walk** (Public / Auth / Protected). Intermediate is **product tools** inside a shell. Focusing a tool shows **which API surfaces it calls** (with evidence), not a sibling HTTP API blob or empty route list.

**Shree / local-only repos:** **Out of loop automation.** Do **not** scan `shree-*` or require Shree paths. All acceptance is **fixture + verify**. Humans may optionally spot-check Shree locally; cloud ticks must never wait on it or push “unavailable” spam.

---

## Redesign principle (read every tick)

> Shells frame the door. Tools are the room. API edges are the wiring — always attached to the tool that calls them, never as a peer that replaces the product walk.

---

## Why shells-only failed the sniff test

| Focus | What you get | What’s wrong |
|-------|----------------|--------------|
| Beginner | Home → Protected → Auth → HTTP API | HTTP API as peer of shells; Auth page mixed with Protected shell |
| Protected | Dashboard, Onboarding, Profile (routes only) | No API wiring — looks like a sitemap |
| Whole graph | mostly `UI -uses-> HTTP API` | Aggregate lie; not “Dashboard reads profiles API” |

Target mental model:

```text
Beginner:  Public  →  Auth  →  Protected
                (HTTP API off Beginner / not co-equal shell peer)

Protected Intermediate:
  Dashboard ——reads/writes——▶ HTTP API
  Settings ——reads——▶ HTTP API
  …
```

---

## Mission (read every tick)

1. **Beginner cleanup** — shells are the story; demote or nest bare auth *pages* under Auth shell; **do not** put HTTP API as a co-equal Beginner peer of Protected.  
2. **Tool Intermediate** — focus Protected → show **product tools** **with** `reads`/`writes`/`uses` edges to API — not routes-only silence.  
3. **Tool → API evidence** — lift from feature roots **and** Scholar-shaped page bodies that call `apis/**`.  
4. **Fixtures only for automation** — `mini-next-shells` (+ existing mini-* floors). No Shree dogfood gates.  
5. **No AI naming.** Deterministic only.

**Keep:** shells contract, access honesty, leafChrome off Intermediate, verify floors, Heart Beginner calm.

**Stop:** Shree scan requirements; aggregate `UI → HTTP API` as the only FE story.

---

## End goal

| Surface | Done looks like |
|---------|-----------------|
| **Beginner (fixture)** | `Home → Auth → Protected` (or equivalent). **HTTP API not** a co-equal Beginner peer beside Protected on shell maps. |
| **Protected Intermediate** | Tools + ≥1 tool→API story edge visible (verify) |
| **Page-body lift** | Settings (or twin) page body calling `apis/**` without featureRoot still lifts molecule→API |
| **Tool focus** | Focusing Dashboard shows API neighbor(s); Card/Button stay off. Verify. |
| **Verify** | Floors green; prior shell + mini-next floors green |
| **Heart** | No FE-shell regression (`HTTP API → Data`) |

### Definition of unfinished

- Beginner still `… → HTTP API` as shell peer on mini-next-shells  
- Protected Intermediate with **zero** tool→API edges  
- Page-body → `apis/**` does not lift (Scholar-shaped regression)  
- Tool focus dumps design system / functions  
- Next focus empty while End goal unmet  

---

## LOOP COMPLETE — soft stop

Once **Loop status = LOOP COMPLETE**, idle ticks must **not invent, commit, or push**.

### Acceptance gates (all required)

1. **Beginner FE flow** — mini-next-shells: no HTTP API as co-equal Beginner hub beside Protected; Auth collapsed under Auth shell when present. Verify floor.  
2. **Fixture tool→API** — Protected tool has evidenced `reads`/`writes`/`uses` to API; Intermediate on Protected shows API neighbor.  
3. **Page-body lift** — Settings (or equivalent) page body → API without featureRoot. Verify floor.  
4. **Tool focus** — focusing Dashboard surfaces API neighbor(s); Card/Button stay off. Verify.  
5. **Honesty** — no new fake Protected walls; Heart Beginner unchanged.  
6. **Regression** — `npm run build` + `npm run verify` green.  
7. **Status board** — done or cancelled with reason.  

**Cancelled / not required:** Shree Scholar/Learn dogfood, Browser notes on Shree, any gate that needs `/Users/praveen/Documents/GitHub/shree`.

### Loop status

```text
ACTIVE
```

### Idle protocol

Regression → ACTIVE + fix + push; else when complete: `IDLE: LOOP COMPLETE — no push`.

---

## Dogfood plug (every ACTIVE tick)

```bash
npm run build && npm run verify
```

**Do not** scan Shree repos in automation ticks.

---

## Status board

### Done

- [x] Human rejection of “shells Beginner = win” accepted  
- [x] Branch `fe-tools-api-07082026` created  
- [x] This plan created  
- [x] Extend mini-next-shells: DashboardPanel → `apis/listDashboardStats`  
- [x] Viewer: `shellToolStoryVisible` — shell Intermediate = tools + HTTP API story neighbors  
- [x] Verify: Protected Intermediate shows Dashboard→HTTP API  
- [x] Lift page-body / page-atom callers (not only featureRoot) → molecule→API  
- [x] Settings Scholar-shaped page-body → API verify floor  
- [x] Remove Shree dogfood gates from this plan  
- [x] Beginner: demote client-apis-only HTTP API peer on FE shell maps; auth pages nested under Auth  
- [x] Recover Autopilot work from `cursor/fe-tools-api-plan-bbcb` into this locked branch; delete stray `cursor/fe-tools-api-plan-*`  

### In progress / next

- [ ] Tool focus: API neighbors without Card/Button flood (verify)  
- [ ] LOOP COMPLETE  

### Seed backlog (after gates)

- Product regions inside a tool  
- Learn Protected unlock (human-local / later loop)  
- Parts bin for design-system  
- Public shell tool→API parity polish  
- Optional: multi-tool fixtures from abandoned `cursor/fe-tools-api-plan-4f56` (onboarding/profile/hooks) if still useful  

### Next focus (edit every tick)

> **Next focus:** Tool focus verify — focusing Dashboard surfaces API neighbor(s); Card/Button stay off Intermediate/focus flood. **Push only to `fe-tools-api-07082026` — never create `cursor/*` side branches.**

### Learning log

```text
- YYYY-MM-DD HH:MM UTC | Done: … | Next: … | Learned: … | Dogfood: … | Browser: …
```

- 2026-08-08 12:15 UTC | Done: merge bbcb Beginner demotion into fe-tools-api-07082026; delete stray cursor/* plan branches | Next: Tool focus verify | Learned: cloud Autopilot was pushing cursor/fe-tools-api-plan-* instead of locked branch so push-wakeup died; branch lock must be absolute | Dogfood: npm run verify green after merge | Browser: n/a |
- 2026-08-08 08:25 UTC | Done: shell maps collapse client-apis-only HTTP API from Beginner; verify Home→Auth→Protected (no API peer); auth pages already nested | Next: Tool focus Dashboard→API without Card/Button | Learned: removing Protected→API flowPair alone is not enough — assignFlowOrder still bands non-collapsed api; collapse client-apis-only; keep full-stack Protected→API→Data | Dogfood: npm run verify green (Beginner shell walk no HTTP API peer) | Browser: n/a |
- 2026-08-08 08:20 UTC | Done: pageMoleculeKeyForCaller + Settings page-body fixture floor; stripped Shree dogfood from plan | Next: Beginner API peer demotion | Learned: Scholar Dashboard page body called apis/** with featureRoot=undefined so old lift skipped; resolve molecule via page body→page atom→page:* key | Dogfood: npm run verify green (Settings page-body → API reads); optional local Scholar now Dashboard→API ×6 (not a gate) | Browser: n/a |
- 2026-08-08 05:25 UTC | Done: fixture Dashboard→apis/listDashboardStats + shellToolStoryVisible + verify tool→API floor | Next: was Scholar lift | Learned: routes-only filter hid API neighbors | Dogfood: verify green | Browser: n/a |
- 2026-08-07 13:20 UTC | Done: plan + branch | Next: fixture tool→API | Learned: shells Intermediate alone is a sitemap | Dogfood: n/a (plan) | Browser: n/a |

---

## Tick protocol

1. Concurrency skip if busy  
2. Sync on `fe-tools-api-07082026`; merge `origin/master` when needed  
3. If LOOP COMPLETE → Idle  
4. One Next focus  
5. Implement → verify → update plan → commit → push  
6. **Fixtures only** — never require Shree  
7. No AI naming; no fake Auth walls  

### Copy-paste Autopilot prompt

```text
Underdelta loop: docs/loopplans/FE_TOOLS_API_07082026.md on branch fe-tools-api-07082026 only.
Read the plan. Shells frame the door; tools are the room; API edges wire tools — not Beginner peers.
Do NOT scan Shree or any local-only path. Fixtures + npm run verify only.
One Next focus. Update Learning log. Commit and push this branch.
When LOOP COMPLETE: no invent/commit/push.
```

---

## Implementation notes

1. **Reuse** `liftFePageStoryEdges` / `pageMoleculeKeyForCaller` — page bodies + feature roots.  
2. **Viewer:** `shellToolStoryVisible` — tools + API hubs.  
3. **Beginner `assignFlowOrder`:** FE maps with shell hubs should not force `api` into the cold-open lane as Protected peer.  
4. **Auth:** if `shell:auth` exists, auth pages must not also sit on Beginner as peers.  

## Priority

1. ~~Fixture tool→API + page-body lift~~  
2. Beginner API peer demotion  
3. Tool focus verify  
4. LOOP COMPLETE  

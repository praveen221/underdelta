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

---

## Redesign principle (read every tick)

> Shells frame the door. Tools are the room. API edges are the wiring — always attached to the tool that calls them, never as a peer that replaces the product walk.

---

## Why shells-only failed the sniff test

On Scholar today (local dogfood after shells merge):

| Focus | What you get | What’s wrong |
|-------|----------------|--------------|
| Beginner | Home → Protected → Auth → HTTP API | HTTP API as peer of shells; Auth is a page hub mixed with Protected shell |
| Protected | Dashboard, Onboarding, Profile (routes only) | No API wiring — looks like a sitemap |
| Home | layout chrome | No public tools / no API story |
| Whole graph | mostly `UI -uses-> HTTP API` | Aggregate lie; not “Dashboard reads profiles API” |

Target mental model:

```text
Beginner:  Public  →  Auth  →  Protected
                (optional: API stays off Beginner or as a quiet neighbor, not a co-equal hub)

Protected Intermediate:
  Dashboard ——reads/writes——▶ profiles / results / …
  Onboarding ——uses——▶ …
  Profile ——reads/writes——▶ …

Focus Dashboard (or a tool region later):
  product regions / feature modules that matter
  + evidenced edges to API modules or route handlers
  (Card/Button still Advanced / library)
```

Same pattern under **Public** for marketing/tools that call APIs (e.g. Schools → compare APIs).

---

## Mission (read every tick)

1. **Beginner cleanup** — shells are the story; demote or nest bare auth *pages* under Auth shell; **do not** put HTTP API as a co-equal Beginner peer of Protected (prefer omit from FE Beginner flow, or attach as story neighbor only when focused).  
2. **Tool Intermediate** — focus Protected (or Public) → show **product tools** (route molecules / role tools) **with** `reads`/`writes`/`uses` edges to API (modules under HTTP API, route handlers, or server actions) — not routes-only silence.  
3. **Tool → API evidence** — each edge must cite the calling page/featureRoot/`apis/**` helper (file:line). Prefer lifting existing FE→API machinery onto **shell children**, not inventing new scrape.  
4. **Scholar first** — primary dogfood. Learn Protected still weak (no middleware; `(dashboard)` honesty) — improve Learn only when Scholar tool→API walk is honest, or when a cheap layout-guard unlocks Protected without lying.  
5. **No AI naming.** Deterministic only.

**Keep:** shells contract, access honesty (no fake Protected), leafChrome off Intermediate, verify floors, Heart Beginner calm.

**Stop:** declaring shell Beginner labels a product win; Intermediate that only lists route names; aggregate `UI → HTTP API` as the only FE story.

---

## End goal

| Surface | Done looks like |
|---------|-----------------|
| **Beginner (Scholar)** | `Public/Home → Auth → Protected` (labels flexible). **HTTP API not** a fourth co-equal shell peer. Auth pages nested under Auth shell when shell exists. |
| **Protected Intermediate** | Tools visible (e.g. Dashboard, Onboarding, Profile) **and** ≥1 tool shows story edge to API surface with evidence |
| **Tool focus** | Focusing Dashboard (or equivalent) shows API neighbors it uses — not empty / not Card-Button flood |
| **Public Intermediate** | At least one public tool with API edge **or** honest “no client API from this shell” note in Learning log |
| **Fixture** | Extend `mini-next-shells` (or twin): protected page calls `apis/**` or server action → Intermediate shows tool→API edge |
| **Verify** | Floors for Beginner (no API peer), Protected Intermediate edges, tool focus API neighbor; prior shell + mini-next floors green |
| **Heart** | No FE-shell regression (`HTTP API → Data`) |

### Definition of unfinished

- Beginner still `… → HTTP API` as shell peer on Scholar  
- Protected Intermediate is routes-only with **zero** tool→API edges  
- Only aggregate `UI → HTTP API` exists  
- Tool focus dumps design system / functions  
- Next focus empty while End goal unmet  

---

## LOOP COMPLETE — soft stop

Once **Loop status = LOOP COMPLETE**, idle ticks must **not invent, commit, or push**.

### Acceptance gates (all required)

1. **Beginner FE flow** — Scholar (or fixture twin): no HTTP API as co-equal Beginner hub beside Protected; Auth collapsed under Auth shell when present. Verify floor.  
2. **Fixture tool→API** — mini-next-shells (extended): Protected tool has evidenced `reads`/`writes`/`uses` to API/action; Intermediate on Protected shows that edge (or tool focus does — pick one and lock both if cheap).  
3. **Scholar Protected Intermediate** — ≥1 protected tool→API story edge visible in Intermediate neighborhood (not only after Advanced). Learning log lists tool + API labels.  
4. **Tool focus** — focusing that tool surfaces API neighbor(s); Card/Button stay off. Verify.  
5. **Honesty** — no new fake Protected walls; Heart Beginner unchanged.  
6. **Regression** — `npm run build` + `npm run verify` green; shell Intermediate routes still available as scaffolding under tools.  
7. **Dogfood** — every ACTIVE tick verify; Scholar re-scan when local; **Browser** note before COMPLETE (`Browser: Protected → Dashboard → API …`). Cloud may fixture-close mid-loop; final Scholar browser may be human-local — **no** empty wait commits.  
8. **Status board** — done or cancelled with reason.

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

When Shree exists:

```bash
node dist/cli.js scan "${SHREE_ROOT:-/Users/praveen/Documents/GitHub/shree}/shree-scholar" -o .dogfood-scans/tools_scholar
node dist/cli.js scan "${SHREE_ROOT:-/Users/praveen/Documents/GitHub/shree}/shree-learn" -o .dogfood-scans/tools_learn
```

Log: Beginner hubs; Protected Intermediate tool labels + tool→API edge counts; Browser line when available.

---

## Status board

### Done

- [x] Human rejection of “shells Beginner = win” accepted  
- [x] Branch `fe-tools-api-07082026` created  
- [x] This plan created  
- [x] Extend mini-next-shells: DashboardPanel → `apis/listDashboardStats`  
- [x] Viewer: `shellToolStoryVisible` — shell Intermediate = tools + HTTP API story neighbors  
- [x] Verify: Protected Intermediate shows Dashboard→HTTP API (not routes-only silence)  
- [x] Broaden FE lift: page body + hook→apis bridge onto page molecules (not featureRoot-only)  
- [x] Fixture: Profile (page body→apis) + Onboarding (feature→hook→apis); Protected Intermediate ≥3 tool→API edges  

### In progress / next

- [ ] Beginner: demote HTTP API peer on FE shell maps; nest auth pages under Auth  
- [ ] Tool focus: API neighbors without Card/Button flood  
- [ ] Scholar dogfood + Browser note (human-local; cloud has no Shree)  
- [ ] LOOP COMPLETE  

### Seed backlog (after gates)

- Product regions inside a tool (Phase 2 of earlier brief)  
- Learn Protected unlock via layout guard / real middleware  
- Parts bin for design-system  
- Public shell tool→API parity polish  

### Next focus (edit every tick)

> **Next focus:** Beginner cleanup — demote HTTP API as co-equal shell peer on FE shell maps (`Home → Auth → Protected`, not `… → HTTP API`); nest bare auth pages under Auth when shell exists; verify floor.

### Learning log

```text
- YYYY-MM-DD HH:MM UTC | Done: … | Next: … | Learned: … | Dogfood: … | Browser: …
```

- 2026-08-08 05:40 UTC | Done: page-body + hook→apis lift; Profile/Onboarding fixture twins; verify 3 Protected tool→API edges | Next: Beginner demote HTTP API peer | Learned: client-apis-only already skips blanket page uses — featureRoot-only lift left Scholar-shaped page-body/hook callers silent (aggregate UI→API only); resolve molecule via page atom when body lacks routeMolecule stamp | Dogfood: npm run verify green; mini-next-shells Beginner still Home→Auth→Protected→HTTP API; Protected Intermediate tools Dashboard/Onboarding/Profile/Settings + HTTP API (3 tool edges); Scholar n/a (no SHREE_ROOT) | Browser: n/a (fixture closed) |
- 2026-08-08 05:25 UTC | Done: fixture Dashboard→apis/listDashboardStats + shellToolStoryVisible + verify tool→API floor | Next: Scholar per-tool API lift | Learned: routes-only filter was actively hiding API neighbors even when molecule→API edges existed; viewer must allow api hubs in shell Intermediate; fixture edge lifts via featureRoot calls client apis helper | Dogfood: npm run verify green; Scholar still mostly aggregate UI→API (0 Dashboard/Onboarding/Profile story edges) — next tick | Browser: n/a (fixture closed) |
- 2026-08-07 13:20 UTC | Done: plan + branch after Scholar drill critique | Next: fixture tool→API | Learned: shells Intermediate routes-only + aggregate UI→API is still a sitemap; product map needs tool→API wiring; Scholar Protected children exist (Dashboard/Onboarding/Profile) but zero story edges on focus | Dogfood: prior shells scan Scholar Beginner Home→Protected→Auth→HTTP API; Protected kids routes only | Browser: n/a (plan) |

---

## Tick protocol

1. Concurrency skip if busy  
2. Sync on `fe-tools-api-07082026`; merge `origin/master` when needed  
3. If LOOP COMPLETE → Idle  
4. One Next focus  
5. Implement → verify → update plan → commit → push  
6. Scholar over Learn until tool→API works  
7. No AI naming; no fake Auth walls  

### Copy-paste Autopilot prompt

```text
Underdelta loop: docs/loopplans/FE_TOOLS_API_07082026.md on branch fe-tools-api-07082026 only.
Read the plan. Shells frame the door; tools are the room; API edges wire tools — not Beginner peers.
One Next focus. npm run build && npm run verify. Update Learning log. Commit and push this branch.
When LOOP COMPLETE: no invent/commit/push.
```

---

## Implementation notes

1. **Reuse** `liftFeClientApiStoryEdges` / featureRoot → `apis/**` — ensure edges attach to **page molecules** that are children of shells (parentId), and Intermediate neighborhood includes those edges.  
2. **Viewer:** `shellRoutesOnlyVisible` was MVP — evolve to “shell tools + their API story neighbors,” still excluding leafChrome/modules/functions.  
3. **Beginner `assignFlowOrder`:** FE maps with shell hubs should not force `api` into the same cold-open lane as Protected.  
4. **Auth:** if `shell:auth` exists, `page:/auth` / signin must not also sit on Beginner as a peer.  

## Priority

1. Fixture tool→API  
2. Viewer Intermediate shows tool→API  
3. Scholar dogfood  
4. Beginner API peer demotion  
5. LOOP COMPLETE  

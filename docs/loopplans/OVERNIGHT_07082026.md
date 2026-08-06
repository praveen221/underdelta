# Loop plan — Overnight trust & projection (7 Aug 2026)

Living plan for a **scoped** Autopilot loop (human-armed **30 minute** ticks — not GitHub Actions).

**Branch lock:** `overnight-07082026` only  
**Base:** `master` @ post FE-depth merge (`a07437f` or later)  
**Do not** open a second PR — update the existing draft PR for this branch  
**Loop interval:** 30 minutes (Cursor Autopilot / Loop on this chat)  
**This file:** read at start of every tick; update at end of every successful tick  
**Created:** 2026-08-07  

Related:

- Dogfood scan of ~/Documents/GitHub (2026-08-06) — false Underdelta-shaped systems on openclaw/t3code; README label poisoning; hairballs on huge repos  
- [`FE_DEPTH_UX_06082026.md`](FE_DEPTH_UX_06082026.md) — LOOP COMPLETE (archaeology)  
- [`V0_BUILD_CONTEXT.md`](../V0_BUILD_CONTEXT.md) — v0 freeze rules  

**Pitch:**  
Make Underdelta **trustworthy** across foreign repos. Fix projection lies before adding extractors or marketing. The human will use the system map to drive later design — overnight work should raise signal, not invent scope.

**How this loop is armed:** Human enables Autopilot/Loop at **30m** on a cloud/desktop agent pointed at this branch, with the copy-paste prompt below. **No** GitHub webhook automation. No empty “still waiting” commits.

---

## Mission (read every tick)

1. **Stop false Underdelta systems** on foreign repos (`CLI` / `Compile pipeline` / `architecture.json` / `index.html` artifact chain unless this really is Underdelta or an explicit opt-in).  
2. **Harden product & hub labels** — never use README install/marketing lines as product name; prefer package.json `name`, then a clean title.  
3. **Verify floors** that lock the fixes (synthetic mini fixtures and/or dogfood assertions).  
4. Keep **self-map + mini-stack** demo-ready; regressions there outrank new work.  
5. Optional if gates 1–3 green early: calm the worst monorepo blow-ups (ignore/vendor caps) — only if Next focus says so.

**Never idle while End goal unmet.** Refill from Seed backlog.  
**Never push** when Loop status is LOOP COMPLETE unless a gate regresses.

---

## End goal

| Surface | Done looks like |
|---------|-----------------|
| **Foreign tooling-shaped repo** | Scan of a fixture that has `src/cli.ts` + `compile.ts` + `viewer.ts` does **not** invent Underdelta artifact flow unless marked as underdelta |
| **Labels** | Fixture/README poison cases do not become product title (install headings, marketing slogans) |
| **Shree** | Learn/Heart/Scholar Beginner stories still hold (no regression) |
| **Verify** | `npm run build` + `npm run verify` green with new floors |
| **Self-map** | Underdelta still shows CLI → compile → extractors → graph → artifacts → viewer |

### Definition of unfinished

- openclaw/t3code-class filename collisions still produce Underdelta IR artifacts on non-Underdelta products  
- Product labels still poisoned by README chrome  
- Next focus empty while End goal unmet  

---

## LOOP COMPLETE — soft stop

Once **Loop status = LOOP COMPLETE**, idle ticks must **not invent, commit, or push**.

### Acceptance gates (all required)

1. **Artifact/system gate** — Underdelta-specific projection (architecture.json / index.html artifacts + compile/extractors/graph self-map chain) only on Underdelta itself or explicit `package.json`/`underdelta` marker; verify fixture floor.  
2. **Filename collision gate** — mini fixture with decoy `cli.ts`/`compile.ts`/`viewer.ts`/`schema.ts`/`graph.ts` does not get Underdelta self-map hubs; verify.  
3. **Label gate** — product name ignores install/marketing README lines; verify floor (extend tracknotch-style case).  
4. **Regression** — self-map still has required Underdelta hubs; mini-stack + FE depth floors still pass.  
5. **Dogfood note** — Learning log cites at least one real foreign repo re-scan (openclaw or t3code or hermes-agent) showing improvement OR documents remaining scale hairball as out-of-scope with evidence.  
6. **Status board** — mandatory items done or cancelled with reason.

### Loop status

```text
ACTIVE
```

### Idle protocol

Re-check gates; regression → ACTIVE + fix + push; else `IDLE: LOOP COMPLETE — no push`.  
Human should disable the 30m Autopilot when complete.

**Concurrency:** If a previous tick is still running, skip entirely — try next 30m ping. Never interrupt, rebase, or force-push.

---

## Dogfood plug (every ACTIVE tick)

```bash
npm run build && npm run verify
```

Optional foreign re-scan (write under repo `.underdelta` or underdelta `.dogfood-scans/`):

```bash
node dist/cli.js scan /Users/praveen/Documents/GitHub/jobjarvis -o /Users/praveen/Documents/GitHub/underdelta/.dogfood-scans/jobjarvis
# or a heavy one after gate 1: openclaw / t3code — summarize flow hubs only
```

Learning log must include verify + what changed for trust.

---

## Status board

### Done

- [x] This overnight plan created on `overnight-07082026`  
- [x] Soft-stop / 30m human Autopilot protocol documented  
- [x] Philosophy one-pager shipped on master (`docs/index.html`) for GitHub Pages  
- [x] Gate Underdelta-specific artifact + self-tooling projection (`isUnderdeltaToolingRepo`)  
- [x] Decoy filename fixture + verify (`verification/mini-decoy-tooling`)  

### In progress / next

Keep **≥ 3** unchecked items.

- [ ] Product label hardening (README poison) + verify  
- [ ] Re-scan openclaw or t3code; log hub list before/after  
- [ ] Confirm Underdelta self-map unchanged / still complete (spot-check after label work)  
- [ ] hermes-agent hub title cleanup (README slogan) if still poisoned after label gate  

### Seed backlog (refill when In progress < 3)

- Vendor/monorepo ignore expansions if still drowning after gates  
- Size/time soft-cap warning diagnostic on huge repos  
- Docs: Pages enable note in README if missing  
- Do **not** start landing marketing beyond the one-pager  
- Do **not** add new stack extractors in this loop  

### Next focus (edit every tick)

> **Next focus:** Harden product labels against README install/marketing poison; add/extend verify floor; then re-scan openclaw or t3code and log hubs before/after.

### Learning log

```text
- YYYY-MM-DD HH:MM UTC | Done: … | Next: … | Learned: … | Dogfood: …
```

- 2026-08-07 | Done: plan created; one-pager on master | Next: gate Underdelta-only projection | Learned: dogfood showed path-role projection invents Underdelta systems on any repo with similar filenames; trust > new extractors | Dogfood: prior folder scan (27 repos)
- 2026-08-06 ~21:00 UTC | Done: gate compile/viewer/extractors/graph/schema + artifacts behind `isUnderdeltaToolingRepo`; mini-decoy-tooling verify floors; nest bare schema.ts under HTTP API without inventing Schema contract | Next: README label poison | Learned: gating Schema contract broke GraphQL schema.ts nesting — fold orphans into API instead of inventing a hub | Dogfood: npm run verify green (self-map + decoy + graphql-real)

---

## Tick protocol

1. Concurrency skip if busy  
2. Sync `overnight-07082026`; merge `origin/master` when needed; build+verify green  
3. If LOOP COMPLETE → Idle (no push)  
4. Refill backlog to ≥3 open items if needed  
5. One Next focus increment only  
6. Implement  
7. `npm run verify` (must pass)  
8. Update this plan in same commit  
9. Commit + push this branch only; update existing PR  
10. Stop tick (mission continues on next 30m Autopilot ping)

---

## Priority order

1. Underdelta-only gating for self-tooling/artifacts  
2. Decoy fixture + verify  
3. Label hardening + verify  
4. Foreign dogfood confirmation  
5. Self-map / mini-stack regression  
6. Monorepo calm only if gates green and time remains  

## Out of scope

- Other branches / master commits / second PRs  
- New extractors / Graphify / sales funnel  
- GitHub Actions automations for this loop  
- Empty wait commits  
- Landing page redesign (one-pager already shipped)  

---

## Copy-paste Autopilot prompt (30 min)

Paste into the agent on branch `overnight-07082026`, then enable Autopilot/Loop at **30 minutes**:

```text
AUTOPILOT MODE — Underdelta overnight trust loop (30 min ticks)

CANONICAL PLAN: docs/loopplans/OVERNIGHT_07082026.md

HARD LOCKS:
1) Branch ONLY overnight-07082026. No master. No second PR.
2) One chunk per tick. Commit + push after each successful tick.
3) CONCURRENCY: if previous tick still running, SKIP — try next 30m ping.
4) NEVER IDLE while plan End goal unmet; keep ≥3 open next items.
5) Product-build / trust fixes > merge-prep idle.
6) When Loop status is LOOP COMPLETE: no invent, no commit, no push unless gate regression.

MISSION:
Make foreign-repo maps trustworthy: stop false Underdelta systems/artifacts; harden product labels; lock with verify; keep self-map + mini-stack green.

EACH TICK:
A) Concurrency check
B) Read plan → refill backlog if needed → one Next focus
C) Implement
D) npm run build && npm run verify
E) Update plan (Done / Next focus / Learning log)
F) Commit + push overnight-07082026
G) Stop tick

PRIORITY: Underdelta-only projection gate → decoy fixture verify → README label poison → dogfood re-scan → regressions.

OUT OF SCOPE: new extractors, marketing redesign, other branches, wait-spam commits.
```

---

## Human arming checklist

1. Open Cursor agent on repo `underdelta`, branch `overnight-07082026`  
2. Paste the prompt above  
3. Enable Autopilot / Loop @ **30 minutes**  
4. Disable when plan shows `LOOP COMPLETE`  
5. Enable GitHub Pages (Settings → Pages → Deploy from branch `master` / folder `/docs`) for the one-pager if not already live  

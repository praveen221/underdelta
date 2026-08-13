# Loop plan — TypeScript semantic reachability + change impact

**Product decision:** [../PRODUCT_MVP.md](../PRODUCT_MVP.md)
**Created:** 2026-08-12
**Branch:** `ts-reachability-impact-12082026`
**Status:** COMPLETE for this branch (phases 0–3). Follow-up is anonymous Express handlers on a new branch.

Related:

- [../ARCHITECTURE_V02.md](../ARCHITECTURE_V02.md) — facets, adapters, projection
- [../WALKABLE_GRAPH_CONTEXT.md](../WALKABLE_GRAPH_CONTEXT.md) — viewer tiers
- [SYSTEM_DESIGN_MOLECULES_04082026.md](SYSTEM_DESIGN_MOLECULES_04082026.md) — prior molecule work

---

## Mission (this loop)

Ship the engine for:

> Understand what a change touches before you make or merge it.

Map stays the activation surface. Deterministic change impact is the retention
surface. AI was out of scope. Framework adapters stayed frozen.

---

## Shipped

- Symbol identities (class-qualified methods; no `A.run`/`B.run` collision)
- Import, re-export, namespace, and known-binding method resolution
- `call-unresolved` / `call-ambiguous` diagnostics; call metrics on analysis
- Path queries and reverse/forward reachability
- `underdelta impact` → text, `impact.json`, highlighted viewer
- `base...head` merge-base ranges; untracked worktree files
- Named `--head` only on clean checkout (generated `.underdelta` ignored)
- `--files` cannot carry revision labels; invalid revs fail the CLI
- Deleted files listed; deleted-symbol impact still needs a base graph

Historical tree compile is **not** in this loop.

---

## Verification

- `npm run verify` contract tests (reachability + impact included)
- Playwright viewer suite
- Local RealWorld Express/Prisma dogfood (see PRODUCT_MVP)

---

## Follow-up branch

`inline-route-handlers-13082026` — inline Express/Fastify route callbacks
get stable handler symbols and own their calls. Service-file impact can
reach those routes. Next.js named route exports were already symbols.

Customer validation (10 users / 5 returns / 3 shares) remains human-owned.

---

## Learning log

- 2026-08-12 | Wedge locked: map + change impact
- 2026-08-12 | Phases 0–3 implemented on `ts-reachability-impact-12082026`
- 2026-08-13 | Review: method identity, merge-base, untracked, upstream paths, loud git, no `--files` mislabel
- 2026-08-13 | RealWorld dogfood: controller change hits endpoints + tables; service change misses endpoints because of anonymous Express handlers. Loop complete for this branch.

# Product MVP

**Status:** capability shipped; customer value not validated
**Updated:** 2026-08-13
**Engine loop:** [loopplans/TS_REACHABILITY_CHANGE_IMPACT.md](loopplans/TS_REACHABILITY_CHANGE_IMPACT.md)

Architecture depth exists to serve these workflows, not the reverse.

---

## Wedge

> Understand what a change touches before you make or merge it.

Two connected surfaces:

1. **Repository map** (activation) — What does this product contain?
2. **Change impact** (retention) — What product behavior could this change affect?

The map is the entry experience. Change impact is the recurring reason to return.

Target report (not a prettier overview):

```text
Changed: src/billing/calculate.ts

Potential impact:
POST /checkout
  → checkout()
  → calculateTotal()
  → writes Order
  → publishes order-created
  → consumed by receiptWorker()

Evidence: 8 observed links
Unresolved: paymentProvider.charge()
```

---

## Who and what

| | Choice |
|--|--------|
| **Persona** | TypeScript product engineers in small teams |
| **Stack** | Next.js or Express; Prisma/Postgres or MongoDB; optional BullMQ/cron |
| **Promise** | Scan the repo and understand the product; inspect a change and see which product systems it may affect, with source evidence |
| **Not promised** | Universal language coverage, runtime traces, agent debugging, multi-repo catalogs |

### Freeze (until user gates pass)

- New language or deploy adapters beyond keeping existing tests green
- LangChain / LangGraph / OpenAI / Claude adapters as a breadth play
- Matcher DSLs, plugin marketplaces, multi-repo federation
- Competing with LangSmith or general code search

AI later **consumes** deterministic facts. It does not invent structure.

---

## Principles

- Evidence and explicit unknowns are product features.
- Precision before recall. Never invent edges.
- Beginner shows the smallest number of **meaningful** product systems for this repo (adaptive, not a hard cap of three).
- Hide code-level orphans on Beginner; measure unresolved calls so coverage can improve.
- Evaluate on locally ignored real repositories, not committed full-repo golden snapshots.
- Measure repeat usage, not praise or extractor count.

---

## Surfaces

### Map

Evidence-backed product systems (UI, HTTP API, data, jobs, messaging when present).
Progressive disclosure: Beginner story → Intermediate neighborhood → Advanced code.
Detected capabilities plus mapped / partial / empty honesty.

### Impact

Inputs: file list, dirty worktree (including untracked), or `base...head` merge-base range.

Outputs: changed symbols, reachable product anchors (endpoints, tables, jobs, queues, systems), bounded highlight, text + `impact.json`, explicit unresolved/ambiguous calls.

Named `--head` must match a clean checkout until historical graphs exist. Do not combine `--files` with `--base`/`--head`. Invalid revisions fail the CLI. Deleted files are listed; deleted-symbol impact needs a base graph.

---

## Engine

TypeScript semantic reachability bound to product facets:

1. Stable identities for modules, exports, classes, methods, functions
2. Import, re-export, and same-repo call resolution
3. Explicit unresolved and ambiguous calls
4. Bind HTTP handlers, jobs, queues, and DB operations to those symbols
5. Deterministic path queries
6. Change → symbols → reachable systems
7. Bounded impact subgraph + report

This is the shared foundation for maps, PR impact, blast radius, onboarding, and later agent context.

---

## Agent contract (inspiration, not a pivot)

Worth taking from [deterministic “graph not text” agent tools](https://x.com/devagrawal09/status/2087640940593000767):
binding resolution, classify-before-transform, honesty by construction,
read-only analysis. Not worth becoming a migration-codemod company.

| Layer | Owns |
|-------|------|
| Deterministic graph | Facts: resolved bindings, file:line, observed/derived/inferred, unresolved |
| Model (later) | Judgment over those facts — never upgrades an unknown into a claim |
| Human | Decisions neither can make |

Impact output is already that layer: a sorted ledger of observations with
explicit limits. Do not let an LLM write the graph.

---

## Honest status (2026-08-13)

**Shipped (this capability):** `underdelta impact`, call metrics, import/re-export/namespace resolution, class-qualified methods, merge-base ranges, untracked worktree files, upstream evidence paths, loud git failures.

**Not a validated customer product.** Merge readiness ≠ product-market fit.

**RealWorld (Node/Express/Prisma) dogfood:** changing `article.controller.ts` reached 11 HTTP endpoints, Article/Comment/Tag/User tables, and evidence-backed service/Prisma paths. Changing `article.service.ts` reached the four data resources but **no HTTP endpoints**.

Cause: Express routes use anonymous inline callbacks; calls inside them are owned by the module, so we cannot form `route → anonymous handler → service`. That is a recall miss, not an invented claim.

**Follow-up (`inline-route-handlers-13082026`):** inline Express/Fastify
route callbacks get stable handler symbols, `routes-to` bindings, and own
their inner calls so a service-file change can reach the HTTP route.

Next.js App Router named `GET`/`POST` exports were already first-class
functions. Repeat dogfood on one real Next.js repo after this lands.

Then: 10 external users, ≥5 return, ≥3 share.

---

## Validation gates

| Gate | Target |
|------|--------|
| External users who scan their own repo | ≥ 10 |
| Answer predefined architecture questions | majority of sessions |
| Return for another change or PR | ≥ 5 |
| Share output with another developer | ≥ 3 |
| Quality | Precision before recall |

Do not optimize extractor count, marketing framework lists, or praise without a second session.

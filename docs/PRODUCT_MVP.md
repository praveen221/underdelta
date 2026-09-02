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

## Honest status

**How we proceed now:** [mindset/2026-08-15.md](mindset/2026-08-15.md).
That file supersedes the Express/Next follow-up list below. Phase 1 is
`query writes` / `impact` / `unknown`, a skill, and one-repo A/B — not more
frameworks or another viewer loop.

**Shipped:** `underdelta impact`, TypeScript reachability, inline Express
route handlers, navigable-graph clustering, evidence-backed HTTP/data/jobs/deploy
facets. Inline-handler follow-up landed; service-file changes can reach typed
Express endpoints.

**Not a validated customer product.** Merge readiness ≠ product-market fit.

Impact HTTP claims require typed `endpoint` facets; unsupported frameworks
(e.g. Fastify) stay diagnostics, not product endpoints.

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

# Underdelta product MVP (canonical)

**Status:** active product decision  
**Date:** 2026-08-12  
**Supersedes:** informal “Monday map / three systems max / no orphan nodes” framing  
**Related technical plan:** [`loopplans/TS_REACHABILITY_CHANGE_IMPACT.md`](loopplans/TS_REACHABILITY_CHANGE_IMPACT.md)

This document is the wedge we build and validate against. Architecture depth
exists to serve these workflows—not the reverse.

---

## What we keep from the discipline critique

- Freeze framework breadth temporarily.
- One initial customer: developers / small teams on a TypeScript web product.
- Make the supported stack feel complete before advertising universal coverage.
- Evidence and explicit unknowns are core product principles.
- Test with real users and **locally ignored** real repositories.
- Measure **repeat usage**, not praise or extractor count.
- AI consumes deterministic facts; it does not invent structure.
- Do not compete with runtime observability (LangSmith, APM) or general code search.

The central risk remains correct: optimizing the architecture compiler without a
habitual customer workflow produces an impressive platform nobody opens again.

---

## What we reject or refine

| Weak framing | Replacement |
|--------------|-------------|
| “Monday map” as retention habit | Map for **activation / onboarding**; **change impact** for retention |
| “Three systems maximum” hard rule | Beginner shows the **smallest number of meaningful product systems** needed to explain the repo (adaptive grouping) |
| “No orphan nodes” absolute | Hide code noise on Beginner; **never invent** edges; surface unresolved relationships honestly and measure coverage |
| Committed full-repo goldens as product proof | Three **locally ignored** real repos for **evaluation**; unit/contract tests stay small and intentional |

---

## Product wedge

> **Understand what a change touches before you make or merge it.**

Two connected workflows:

1. **Repository map** — What does this product contain?  
2. **Change impact** — What product behavior could this change affect?

The map is the entry experience. Change impact is the recurring reason to return
(every meaningful feature, refactor, and pull request).

### Example (target UX, not current CLI)

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

That is more valuable than another prettier overview.

---

## Persona, stack, promise

| | MVP choice |
|--|------------|
| **Persona** | TypeScript product engineers in small teams |
| **Stack** | Next.js or Express; Prisma/Postgres or MongoDB; optional BullMQ/cron |
| **Promise** | Scan the repository and understand the product; inspect a change and see which product systems it may affect, with source evidence |
| **Non-promise** | Universal multi-language coverage, runtime traces, full agent debugging, enterprise multi-repo catalog |

### Freeze list (until validation gates pass)

Do **not** expand these for MVP:

- New language extractors (Python/Flask depth, etc.) beyond keeping existing green
- New deploy/IaC frameworks
- LangChain / LangGraph / OpenAI / Claude SDK adapters as a breadth play
- Matcher DSLs, plugin marketplaces, multi-repo federation
- Competing with LangSmith on traces/evals

AI SDKs remain a **later consumer** of the same reachability engine (symbol →
endpoint/job/resource), not a parallel ontology sprint.

---

## Twin surfaces

### 1. Repository map (activation)

- Evidence-backed product systems (UI, HTTP API, data, jobs, messaging when present).
- Progressive disclosure: Beginner story → Intermediate neighborhood → Advanced code.
- Adaptive system count: as few meaningful systems as the repo requires.
- Detected capabilities + partial/empty/unsupported honesty (`analysis` path).

### 2. Change impact (retention)

Inputs (v1):

- A path, file list, or Git range (`base...head` or working tree vs revision).

Outputs:

- Changed symbols (stable identities).
- Reachable **product** systems and story nodes (endpoints, handlers, tables,
  queues, jobs)—not a raw call-hairball dump.
- Bounded impact subgraph for the viewer.
- Text + JSON report with evidence counts and **explicit unresolved** edges.

Precision over recall. Prefer fewer correct impact claims over invented paths.

---

## Engine (shared foundation)

TypeScript **semantic reachability** is the next substantial technical phase:

1. Stable identities for modules, exports, classes, methods, functions.
2. Resolve imports, aliases, re-exports, method calls, same-repo call targets.
3. Preserve unresolved and ambiguous calls explicitly (measurable coverage).
4. Bind HTTP handlers, jobs, queues, and DB ops to those symbols.
5. Deterministic path queries (endpoint→DB, endpoint→queue, job→external, function→systems).
6. Compare two revisions: changed symbols + reachable systems.
7. Render bounded impact subgraph + textual/JSON report.

This foundation powers:

- Architecture maps  
- Pull request impact  
- Blast-radius analysis  
- Repository onboarding  
- Agent context retrieval  
- Later: AI explanations **over** deterministic facts  

Technical breakdown: [`loopplans/TS_REACHABILITY_CHANGE_IMPACT.md`](loopplans/TS_REACHABILITY_CHANGE_IMPACT.md).

---

## Validation (definition of MVP done)

### Evaluation method

- **Three locally ignored real repositories** (under `.dogfood-repos/` or equivalent).
  Not committed full-repository golden snapshots with brittle label assertions.
- Predefined architecture questions per repo (human checklist).
- Compact unit/contract tests for reachability and impact **logic** remain in-repo.

### User gates

| Gate | Target |
|------|--------|
| External users who scan their own repo | ≥ 10 |
| Successfully answer predefined architecture questions | majority of sessions |
| Return for another change or PR | ≥ 5 |
| Share output with another developer | ≥ 3 |
| Extraction quality | **Precision before recall** on impact paths |

### Anti-metrics (do not optimize)

- Extractor / adapter count  
- “Supported frameworks” marketing list  
- Praise without a second session  
- Coverage of nodes that never appear in Beginner or impact reports  

---

## Bottom line

> **Evidence-backed product map plus deterministic change impact.**

- Viewer = entry experience  
- Function-call + semantic graph = engine  
- Change impact, agent context, and eventual AI explanations = recurring value  

Horizontal adapter expansion without this wedge is a business risk. This MVP is
the correction.

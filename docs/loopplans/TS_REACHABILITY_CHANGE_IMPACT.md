# Loop plan — TypeScript semantic reachability + change impact

Living plan for the next substantial product phase.

**Product decision (read first):** [`../PRODUCT_MVP.md`](../PRODUCT_MVP.md)  
**Created:** 2026-08-12  
**Branch suggestion:** `ts-reachability-impact-YYYYMMDD` (one PR track; no parallel ontology PRs)  
**Status:** ACTIVE — framework breadth frozen; build the impact engine

Related read-only context:

- [`../ARCHITECTURE_V02.md`](../ARCHITECTURE_V02.md) — facets, adapters, projection boundary  
- [`../WALKABLE_GRAPH_CONTEXT.md`](../WALKABLE_GRAPH_CONTEXT.md) — Beginner / Intermediate / Advanced  
- Prior molecule work: [`SYSTEM_DESIGN_MOLECULES_04082026.md`](SYSTEM_DESIGN_MOLECULES_04082026.md)

---

## Mission

Ship the recurring workflow:

> **Understand what a change touches before you make or merge it.**

Repository map stays the activation surface. Deterministic **change impact** is
the retention surface. Both share one engine: TypeScript semantic reachability
bound to existing product facets (endpoint, resource, trigger/job, queues).

**AI is out of scope for implementation in this loop.** Maximize deterministic
resolution so a future AI layer can explain impact without inventing edges.

**Never expand framework adapters in this loop** unless a green verify regression
forces a one-line fix.

---

## Current baseline (honest gap)

What already exists:

- Product systems + projection (HTTP, data, scheduled, deploy, FE stories)
- Edge vocabulary: `calls`, `imports`, `routes-to`, `reads`/`writes`/`queries`,
  `publishes`/`consumes`, `schedules`/`handled-by`, …
- `symbol` semantic facet (module/class/function/method)
- Light `calls` edges from simple **identifier** callees in `typescript` extractor
- `project.revision` from git when available
- Viewer progressive disclosure; analysis mapped/partial/empty

What is missing for the wedge:

- Stable, cross-file symbol identity good enough for reachability
- Import / re-export / alias / method-call resolution
- Explicit **unresolved** and **ambiguous** call records (measurable)
- Path query API over the semantic graph
- Git (or file-list) change → symbols → reachable product systems
- CLI + JSON report + bounded impact subgraph in the viewer
- Local real-repo evaluation protocol (not brittle committed goldens)

---

## Non-goals (freeze)

- New languages / Flask / more deploy frameworks  
- LangChain, LangGraph, OpenAI, Claude SDK adapters  
- Runtime tracing or eval platforms  
- “Three systems max” hardcoding  
- Manufacturing edges to eliminate orphans  
- Full-repo committed golden label dumps as the quality bar  

---

## Vocabulary

| Term | Meaning |
|------|---------|
| **Symbol** | Stable id for module, export, class, function, or method |
| **Resolved call** | `calls` edge with observed/derived certainty to an in-repo symbol |
| **Unresolved call** | Recorded attempt with target name/site evidence; no invented node |
| **Ambiguous call** | Multiple candidate targets; recorded without picking a fake winner |
| **Product anchor** | Node with product role: endpoint facet, resource facet, job/trigger, queue/topic, route handler binding |
| **Impact set** | Product anchors reachable from changed symbols (and reverse where defined) |
| **Beginner systems** | Adaptive grouping: minimal meaningful product systems for *this* repo |

---

## Work phases

### Phase 0 — Contract and measurements (short)

1. Document symbol id scheme (file + export path + kind; hash-stable via `stableId`).
2. Add diagnostics/metrics:
   - `calls.resolved` / `calls.unresolved` / `calls.ambiguous` counts
   - optional coverage ratio in analysis output
3. Define impact report JSON shape (versioned, small).
4. Choose 3 local eval repos under `.dogfood-repos/` (gitignored); write a
   human question checklist per repo (not committed graph snapshots).

**Exit:** schema/types agreed; metrics visible on self-scan; eval repos listed in
this plan’s Learning log (paths only, not content).

### Phase 1 — TypeScript symbol graph quality

In `src/extractors/typescript.ts` (and small helpers if needed):

1. Emit/normalize symbols for modules, exports, classes, methods, functions.
2. Resolve:
   - relative imports (existing base) + extension/index variants  
   - named / default import local → export binding  
   - re-exports (`export { x } from`, `export * from` as far as deterministic)  
3. Resolve calls:
   - local identifiers (existing)  
   - `obj.method` when `obj` is a known binding  
   - imported function/method callees  
4. On failure: emit unresolved/ambiguous records with evidence; **do not** invent targets.
5. Contract tests on **small fixtures** only (precision cases).

**Exit:** on self-map + mini fixtures, resolved call count rises; unresolved is
enumerated; no fake cross-file edges in tests.

### Phase 2 — Bind product anchors to symbols

1. Ensure HTTP handlers (`routes-to`), job handlers, queue publish/consume, and
   Prisma/Mongo reads/writes hang off the same symbol ids used in the call graph.
2. Projection may lift story edges as today; reachability queries read the IR,
   not viewer DOM.
3. Path queries (library module, pure functions):
   - symbol → product systems  
   - endpoint → database/table/collection  
   - endpoint → queue/topic  
   - job → resources / external  
   - changed symbols → impact set  

**Exit:** path queries answer predefined questions on mini-stack / mini-next
style fixtures with evidence lists.

### Phase 3 — Change impact CLI + report

1. `underdelta impact` (name flexible) accepts:
   - `--base <rev>` / `--head <rev>` or file list / default worktree vs `HEAD`
2. Map changed files → changed symbols (range overlap or whole-module fallback).
3. Compute impact set with depth bounds; include unresolved side notes.
4. Write:
   - `impact.json` (machine)  
   - human text summary to stdout  
   - optional bounded graph fragment for viewer highlight  
5. Wire viewer entry: “Impact” or query-param load of impact fragment (minimal UI).

**Exit:** on a real local repo, changing one billing/handler file yields a
readable impact summary with evidence counts and unresolved list.

### Phase 4 — Validation with humans

1. Run eval checklists on 3 local real repos; fix precision bugs only.
2. 10 external users: scan + at least one impact/change question.
3. Track return usage (≥5) and shares (≥3).
4. Only then unfreeze the next *single* expansion (PR comment integration **or**
   thin AI-sdk call sites—not both).

---

## Impact report shape (draft)

```json
{
  "schemaVersion": "0.1",
  "project": { "name": "", "root": "", "baseRevision": "", "headRevision": "" },
  "changed": {
    "files": ["src/billing/calculate.ts"],
    "symbols": [{ "id": "", "label": "calculateTotal", "kind": "function" }]
  },
  "impact": {
    "endpoints": [{ "method": "POST", "path": "/checkout", "nodeId": "" }],
    "resources": [{ "label": "Order", "kind": "table", "nodeId": "" }],
    "jobs": [],
    "queues": [{ "label": "order-created", "nodeId": "" }],
    "systems": [{ "id": "", "label": "HTTP API" }]
  },
  "paths": [
    {
      "fromSymbolId": "",
      "steps": [
        { "edgeKind": "calls", "to": "", "certainty": "observed" },
        { "edgeKind": "writes", "to": "", "certainty": "derived" }
      ]
    }
  ],
  "evidenceCount": { "observed": 0, "derived": 0, "inferred": 0 },
  "unresolved": [
    { "fromSymbolId": "", "callee": "paymentProvider.charge", "file": "", "detail": "" }
  ],
  "metrics": {
    "callsResolved": 0,
    "callsUnresolved": 0,
    "callsAmbiguous": 0
  }
}
```

Precision rule: omit a path rather than mark it observed without evidence.

---

## Viewer rules (impact era)

- Beginner: adaptive product systems; no call-hairball; code orphans hidden.
- Intermediate: story neighborhood; optional “impact highlight” when impact loaded.
- Advanced: symbols/calls in focus; unresolved visible as diagnostics, not fake edges.
- Never require “zero orphans” for ship.

---

## Verification policy

| Kind | Policy |
|------|--------|
| Unit / contract tests | Small fixtures for resolve/unresolved/impact logic |
| `npm run verify` | Stay green; no return to committed full-repo golden maps |
| Local eval repos | `.dogfood-repos/*` gitignored; human checklists in notes or private docs |
| Self-map | Still demo-ready; regressions outrank new resolve features |

---

## Checklist (track in Learning log)

### Phase 0
- [x] Symbol id + unresolved call contract written (this file + schema if needed)
- [x] Metrics on analysis or diagnostics
- [x] Impact JSON draft accepted
- [ ] Three local eval repos chosen (paths logged) — **human Phase 4**

### Phase 1
- [x] Export / re-export resolution
- [x] Cross-file function calls
- [x] Method calls on known bindings
- [x] Unresolved + ambiguous recorded
- [x] Fixture tests green

### Phase 2
- [x] Anchors share symbol ids with call graph
- [x] Path query helpers + tests
- [x] Endpoint→data / job→resource paths on fixtures

### Phase 3
- [x] `impact` CLI (or `scan --impact`) 
- [x] Text + JSON output
- [x] Bounded subgraph / viewer hook (minimal)
- [ ] Real local repo demo script — optional human dogfood

### Phase 4
- [ ] Eval checklists pass at agreed precision
- [ ] 10 users / 5 returns / 3 shares tracked
- [ ] Explicit unfreeze decision recorded

---

## Learning log

- 2026-08-12 | Product wedge locked: map + change impact; Monday-map rejected; adaptive systems; honest unresolved; local evals not brittle goldens | Next: Phase 0 contracts + metrics | Baseline: identifier-only `calls` in typescript extractor; no impact CLI
- 2026-08-12 | Phases 0–3 implemented on `ts-reachability-impact-12082026`: impact schema, call metrics, import/re-export/namespace call resolution, unresolved/ambiguous diagnostics, path queries, `underdelta impact` CLI, viewer highlight, reachability tests in verify | Phase 4 user validation is human-owned | Note: bare free identifiers with no candidates still not counted as unresolved (precision-first; import failures + ambiguous multi-defs are recorded)

---

## Soft-stop rules

Stop expanding scope when:

- Phase 3 works on one real local repo and verify is green, **or**
- Precision regressions force a fix-only tick

Do not start AI SDK adapters or new languages from this plan.

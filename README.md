# Underdelta

Underdelta compiles a software repository into a visual, evidence-backed model
of the product. It is infrastructure for answering a simple question:

> What did I actually build?

The generated browser presents routes, components, functions, databases,
tables, migrations, scheduled jobs, queues, and their relationships. Every
visual claim links to the source location from which it was derived.

## Status

**v0 (branch `cursor/visual-system-browser-7649`, frozen 2026-08-02).**  
Stack-neutral `architecture.json` contract with deterministic extractors for
common app and deploy stacks. Evidence is marked `observed`, `derived`, or
`inferred` — unknown framework semantics are not invented.

Supported in v0 (fixtures + pinned real-repo golden locks via `npm run verify`):

- TypeScript/JavaScript — modules, React/Next UI, Express routes, cron, BullMQ
- Next.js App Router — pages, layouts, route handlers, server actions
- Prisma + SQL migrations; MongoDB collections and aggregates
- Python — FastAPI, Django routes, SQLAlchemy/Alembic, Celery
- OpenAPI / Swagger; GraphQL SDL and tagged documents
- Docker / Compose; Terraform; Kubernetes; Helm; Kustomize

Build history, pin SHAs, and freeze rules:
[`docs/V0_BUILD_CONTEXT.md`](docs/V0_BUILD_CONTEXT.md).

## Try it

```bash
npm install
npm run build
node dist/cli.js scan /path/to/repository
```

Open:

```text
/path/to/repository/.underdelta/index.html
```

The same run writes the portable intermediate representation to
`.underdelta/architecture.json`.

Generated output, dependencies, build artifacts, fixtures, and conventional
test/spec files are excluded from scans so the default map represents the
product rather than development scaffolding.

During development:

```bash
npm run dev -- scan /path/to/repository
```

Verification (isolated `verification/mini-*` fixtures + optional pinned real
repos under gitignored `.underdelta-real/`; never part of the product diagram):

```bash
npm run verify
```

## Core contract

`architecture.json` contains typed nodes and relationships:

```json
{
  "kind": "route",
  "label": "POST /checkout",
  "metadata": {
    "method": "POST",
    "path": "/checkout"
  },
  "evidence": [
    {
      "file": "src/routes/checkout.ts",
      "range": {
        "startLine": 18,
        "startColumn": 0,
        "endLine": 18,
        "endColumn": 42
      },
      "extractor": "typescript",
      "certainty": "observed"
    }
  ]
}
```

The schema is defined in [`src/schema.ts`](src/schema.ts). Extractors only
produce contributions to this contract, which keeps parsers, AI enrichment,
runtime traces, and alternative graph sources replaceable.

## Design principles

1. **Product concepts over graph hairballs.** The default view hides
   implementation details; users can progressively reveal them.
2. **Evidence over plausible diagrams.** Every node and edge records where it
   came from.
3. **Deterministic before inferred.** Parsers and framework adapters establish
   facts. AI enrichment is optional and explicitly labelled.
4. **One portable artifact.** Other tools can consume `architecture.json`
   without depending on the bundled viewer.
5. **Extensible semantics.** Framework support belongs in focused extractors,
   not in the renderer or schema.

## Near-term roadmap

v0 extractors above are in-tree. Next focus after merge/try:

- Stable graph snapshots and structural change overlays
- Runtime evidence via OpenTelemetry
- Extractor/plugin SDK and deeper conformance fixtures
- UX polish for cold-reads by non-coders (see North star notes in
  [`docs/V0_BUILD_CONTEXT.md`](docs/V0_BUILD_CONTEXT.md))

## License

MIT

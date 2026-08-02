# Underdelta

Underdelta compiles a software repository into a visual, evidence-backed model
of the product. It is infrastructure for answering a simple question:

> What did I actually build?

The generated browser presents routes, components, functions, databases,
tables, migrations, scheduled jobs, queues, and their relationships. Every
visual claim links to the source location from which it was derived.

## Status

This is an early executable foundation. The architecture contract and extractor
API are intentionally stack-neutral; the first deterministic extractors cover:

- TypeScript and JavaScript modules, functions, React components and hooks
- JSX render relationships
- Local imports and function calls
- Express-style HTTP routes and handlers
- `cron.schedule`-style scheduled jobs
- BullMQ-style queues and workers
- Prisma models, fields, relationships, and common read/write operations
- SQL `CREATE TABLE` and `ALTER TABLE` migrations

Unknown framework semantics are not invented. Extracted evidence is marked as
`observed`, `derived`, or `inferred`.

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

- Python extraction: FastAPI, Django, SQLAlchemy, Celery, Airflow
- Next.js route and server-action semantics
- MongoDB collections and aggregation pipelines
- OpenAPI, GraphQL, Docker, Terraform, and Kubernetes extraction
- Stable graph snapshots and structural change overlays
- Runtime evidence via OpenTelemetry
- Extractor/plugin SDK and conformance fixtures

## License

MIT

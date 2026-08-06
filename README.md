# Underdelta

Underdelta compiles a software repository into a visual, evidence-backed model
of the product. It is infrastructure for answering a simple question:

> What did I actually build?

Philosophy one-pager (GitHub Pages from `/docs`):
[praveen221.github.io/underdelta](https://praveen221.github.io/underdelta/)

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

### Map any project (no Underdelta install)

From the repository you want to understand:

```bash
cd /path/to/your/project
curl -fsSL https://raw.githubusercontent.com/praveen221/underdelta/master/scripts/scan.sh | bash
```

That caches Underdelta under `~/.cache/underdelta`, scans the current directory,
writes `.underdelta/`, serves the map, and opens your browser.

### Working inside this repo

```bash
./scripts/run.sh                 # map Underdelta itself
./scripts/run.sh /path/to/repo   # map another project with your local build
npm start                        # same as ./scripts/run.sh for .
```

Output always lands in `<repo>/.underdelta/` (`index.html` + `architecture.json`).
Generated output, dependencies, build artifacts, fixtures, and conventional
test/spec files are excluded from scans so the default map represents the
product rather than development scaffolding.

```bash
npm run verify   # fixture + golden-lock suite
```

## How to read the map

The browser is a walk, not a dump of every function.

1. **Beginner** (default) — Product Flow and top systems. Answers “what did I build?” without opening the parts bin.
2. **Intermediate** — Double-click a system (or use **Find…** and press Enter / click a result) to enter that cluster’s neighborhood only. On Underdelta’s **Extractors**, drill a **capability** (e.g. kubernetes) to see its **Detects** surfaces — what that extractor understands — not a raw entity dump.
3. **Advanced** — Modules and functions appear **inside the current focus**, never as a whole-repo phonebook. Drill a module/api for functions. Dead-end leaves (e.g. a service with no children) escalate to the parent system at Advanced so sibling modules appear.

**View** only deepens inside a focus (Intermediate ↔ Advanced). Without a focus it stays Beginner and nudges you to double-click a Product Flow system.

**Back** / **Esc** steps toward Intermediate, then Beginner; **Overview** jumps home. Reloading the same project keeps your last view, focus, and selection for the tab session.

### How to read FE / BE maps

- **Frontend (Next / Vue):** Beginner shows **route/page molecules** (Home, Dashboard, …) — not a single UI blob and not every Card/Button. Leaf chrome stays collapsed; page-owned feature roots appear when you drill a route molecule.
- **Backend:** Beginner prefers **API → Data → Jobs** (plus pipelines when present) with story edges (`reads` / `writes` / `routes-to` / `triggers`…). Focusing a table at Intermediate answers who writes or reads it from those molecules, with file:line evidence.
- **This repo (self-map):** stays the compiler story (CLI → … → Viewer) — no invented FE page dump.

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, PR expectations, and the
evidence-backed contribution rules. Security reports go through
[SECURITY.md](SECURITY.md) (private reporting preferred). Community standards
are in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

MIT

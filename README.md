# Underdelta

Underdelta compiles a software repository into a visual, evidence-backed model
of the product. It is infrastructure for answering a simple question:

> What did I actually build?

Philosophy one-pager (GitHub Pages from repo root):
[praveen221.github.io/underdelta](https://praveen221.github.io/underdelta/)

The generated browser presents routes, components, functions, databases,
tables, migrations, scheduled jobs, deployment units, queues, and their
relationships. Every visual claim links to the source location from which it
was derived.

## Status

**MVP wedge:** evidence-backed **product map** (activation) plus deterministic
**change impact** (retention)—understand what a change touches before you make
or merge it. See [`docs/PRODUCT_MVP.md`](docs/PRODUCT_MVP.md). The TypeScript
reachability engine and `impact` CLI have shipped as a capability; customer
value is not validated. Framework breadth stays frozen. Docs index:
[`docs/README.md`](docs/README.md).

**v0.2 semantic contract in development.** Language and infrastructure
extractors establish base facts; capability adapters normalize framework
semantics into one evidence-backed model. Evidence is marked `observed`,
`derived`, or `inferred`; unsupported scheduler and HTTP frameworks are reported
rather than guessed.

Supported in v0 (depth varies; TypeScript web product is the validation focus):

- TypeScript/JavaScript — modules, React/Next UI, Express routes, BullMQ
- Next.js App Router — pages, layouts, route handlers, server actions
- Prisma + SQL migrations; MongoDB collections and aggregates
- Python — FastAPI, Django routes, SQLAlchemy/Alembic
- Scheduled work — node-cron, cron, NestJS Schedule, Celery, Kubernetes CronJob
- OpenAPI / Swagger; GraphQL SDL and tagged documents
- Deployment units — Docker / Compose, Terraform, Kubernetes, Helm, Kustomize

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
Generated output, dependencies, build artifacts, and conventional
test/spec files are excluded from scans so the default map represents the
product rather than development scaffolding.

The CLI and viewer report what supported capabilities were actually detected.
A partial map shows warnings for recognized technology without an installed
adapter; an empty map says that no supported product/runtime evidence was
found instead of presenting silence as success.

```bash
npm run verify             # build + extractor contracts + projection + self-map
npm run test:viewer        # provision Chromium + test the self-map in a real browser
npm run inspect -- /path/to/repo
node dist/cli.js impact . --files src/foo.ts   # change impact report + highlighted map
node dist/cli.js impact . --base main --head HEAD
```

`inspect` requires a path and scans only that path. Use it to assess a real
repository on demand; Underdelta does not maintain a pinned
external-repository test ladder.

`impact` compiles the **working tree**, maps changed files (explicit `--files`,
default dirty worktree including **untracked** files, or git `base...head`
merge-base range) to symbols, then reports reachable product anchors (endpoints,
resources, jobs, queues, systems) with evidence—including **upstream paths**
from those anchors to the change. It writes `architecture.json`, `impact.json`,
and an `index.html` that highlights the impact neighborhood.

Named `--head` is only accepted when it matches a **clean** `HEAD` (historical
tree materialization is not implemented yet). Generated Underdelta output dirs
are ignored by that clean check. Do **not** combine `--files` with `--base` /
`--head` (avoids mislabeled graphs). Invalid git revisions fail the CLI instead
of producing a silent empty report. Unresolved and ambiguous calls stay
explicit. Deleted files are listed but need a base-graph compile for symbol
impact.

## How to read the map

The browser is a walk, not a dump of every function.

1. **Beginner** (default) — Product Flow and top systems. Answers “what did I build?” without opening the parts bin.
2. **Intermediate** — Double-click a system (or use **Find…** and press Enter / click a result) to enter that cluster’s neighborhood only. On Underdelta’s **Extractors**, drill a **capability** (e.g. kubernetes) to see its **Detects** surfaces — what that extractor understands — not a raw entity dump.
3. **Advanced** — Modules and functions appear **inside the current focus**, never as a whole-repo phonebook. Drill a module/api for functions. Dead-end leaves (e.g. a service with no children) escalate to the parent system at Advanced so sibling modules appear.

**View** only deepens inside a focus (Intermediate ↔ Advanced). Without a focus it stays Beginner and nudges you to double-click a Product Flow system.

Drag nodes to adjust a focused graph; connected edges reroute while you move.
Manual positions persist for that repository and view. Use **Fit** to frame the
visible graph and **Reset** to clear saved node positions.

**Back** / **Esc** steps toward Intermediate, then Beginner; **Overview** jumps home. Reloading the same project keeps your last view, focus, and selection for the tab session.

### How to read FE / BE maps

- **Frontend (Next / Vue):** Beginner shows **route/page molecules** (Home, Dashboard, …) — not a single UI blob and not every Card/Button. Leaf chrome stays collapsed; page-owned feature roots appear when you drill a route molecule.
- **Backend:** Beginner prefers **API → Data → Jobs** (plus pipelines when present) with story edges (`queries` / `reads` / `writes` / `routes-to` / `triggers`…). Focusing a table at Intermediate answers who queries, writes, or reads it from those molecules, with file:line evidence.
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
  "semantics": [{
    "kind": "endpoint",
    "protocol": "http",
    "method": "POST",
    "path": "/checkout",
    "provider": "express",
    "declaration": "code"
  }],
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

The schema is defined in [`src/schema.ts`](src/schema.ts). Extractors establish
language/resource facts; capability adapters add normalized endpoints,
resources, deploy units, roles, and triggers. This keeps framework parsers, AI
enrichment, runtime traces, and alternative symbol sources replaceable. The
v0.2 boundary and semantic contracts are documented in
[`docs/ARCHITECTURE_V02.md`](docs/ARCHITECTURE_V02.md).

## Design principles

1. **Product concepts over graph hairballs.** The default view hides
   implementation details; users can progressively reveal them.
2. **Evidence over plausible diagrams.** Every node and edge records where it
   came from.
3. **Deterministic before inferred.** Parsers and framework adapters establish
   facts. AI enrichment is optional and explicitly labelled.
4. **One portable artifact.** Other tools can consume `architecture.json`
   without depending on the bundled viewer.
5. **Capability semantics.** Framework support belongs in focused semantic
   adapters over a small typed ontology, not in language extractors or renderer
   heuristics.

## Near-term roadmap

v0 extractors above are in-tree. Next focus after merge/try:

- Stable graph snapshots and structural change overlays
- Runtime evidence via OpenTelemetry
- Additional capability adapters only when a real repository requires them
- UX polish for cold-reads by non-coders (see North star notes in
  [`docs/V0_BUILD_CONTEXT.md`](docs/V0_BUILD_CONTEXT.md))

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, PR expectations, and the
evidence-backed contribution rules. Security reports go through
[SECURITY.md](SECURITY.md) (private reporting preferred). Community standards
are in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

MIT

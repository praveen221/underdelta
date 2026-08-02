# Underdelta Autopilot Plan

Living plan for overnight / looped cloud-agent work.

**Branch lock:** `cursor/visual-system-browser-7649` only  
**Existing PR:** keep updating the draft PR for this branch — never open a second PR  
**Loop interval:** 15 minutes  
**This file:** update at the end of every successful tick

---

## Mission (read every tick)

You are **building the product**, not babysitting merge readiness.

Cursor’s `/autopilot` skill may talk about conflicts / CI / review comments. Those are **secondary hygiene** only:

1. If the branch has a real merge conflict or a failing check caused by our changes → fix that first (small).
2. Otherwise **ignore “PR is already mergeable / no CI / no comments” as a reason to stop**.
3. Always spend the tick making the architecture diagram more true, complete, or understandable.

**Never idle while the end goal is unmet.**  
If the checklist looks empty, invent the next useful increment (see Self-renewing backlog). Do not report “nothing to do.”

**Capability and polish are twin engines — never let either starve.** The Capability ladder (below) moves the frontier to new stacks and real repos. Visual polish is what makes every map actually land — it is **extremely high value, permanently**. The generated browser IS the product: a technically correct map that reads like a debugger dump has failed. "Cosmetic" is the wrong word for it; legibility, hierarchy, beauty, and calm are core product capability. The only failure mode to avoid is a *stall*: a long streak of polish-only ticks on already-excellent diagrams while a ladder rung sits untouched. Rough cadence: don't run more than two consecutive polish-only ticks while the current rung has an obvious next step, and give every newly mapped stack/repo a dedicated polish pass as soon as it scans — a capability is not done until its map is beautiful.

---

## North star user (why polish is core capability)

Underdelta is for the new wave of builders who ship real products with AI agents but are not career engineers — designers, product managers, founders, complete beginners. They vibe-code something real, then lose the plot of their own codebase. Underdelta's job is to hand them a **mind map of what they actually built**, readable with zero coding vocabulary.

That means the default browser must be:

- **Instantly legible to a non-coder** — product words, not jargon; systems and stories, not symbols
- **Beautiful and calm** — visual hierarchy, spacing, color, labels, and interaction carry the narrative
- **Trustworthy** — every visual claim clicks through to evidence

Judge every tick's output through this user's eyes. If a random designer opened the map cold and couldn't retell the product story in a minute, the work is not done — no matter how correct the extraction is.

---

## End goal

Achieve a **full, readable product-architecture diagram** for a concrete stack slice (start with Underdelta itself + a TypeScript/JS product stack):

- UI / routes / components
- APIs / handlers
- DB / tables / migrations / Prisma models
- Jobs / cron / queues / pipelines
- Evidence links back to source
- Semantic projection (product nodes), not a raw function hairball
- Default browser should tell the product story left-to-right without turning on Details

Default visualization must stay clean: **no test/fixture/verification systems in the product diagram**.

### Definition of “still unfinished”

The end goal is **not** met if any of these are true:

- Underdelta’s self-map is still mostly modules/functions instead of product systems + flows
- The mini-stack diagram is missing or weakly connected for UI / API / DB / jobs / queues / pipelines
- Overview layout does not follow real product flow
- Evidence is missing or misleading for major nodes
- `npm run verify` is missing coverage for a capability we just added
- A founder scanning Underdelta or the mini-stack would still ask “what did I actually build?”
- The default browser would confuse or repel the North star non-coder (visual noise, jargon labels, weak hierarchy)
- **Any Capability ladder rung below remains un-locked** (no golden verify lock for it)

Until those are false, **keep shipping ticks**.

---

## Capability ladder (human directive — 2026-08-02, overrides seed backlog)

Underdelta must map the stacks people actually build products with — Node.js/Express, React, Next.js, and Python servers — on **real repositories it did not write**. The ladder exists to keep the frontier moving; it does not devalue polish (see Mission — twin engines). Work the **lowest unfinished rung**. A rung counts as done only when `npm run verify` golden-locks it **and its map is polished enough for the North star user**.

1. **Real-repo generalization (Node/Express/React).** Prove the compiler on a real open-source repository this loop did not author. Pick a well-known small/medium Express + React (or similar Node) app, pin an exact commit SHA in this file, and wire it into verification as an isolated scan target: shallow-clone at the pinned SHA into a gitignored path (e.g. `.underdelta-real/<name>`), cache it between runs, and never let it enter the product diagram. The scan must complete without crashing and produce a legible product-systems map. Every place the real repo breaks extractors or projection **is the actual work** — fix those, then golden-lock a summary (floors, required systems/labels) in verify.
2. **Next.js semantics.** App-router pages/layouts/route handlers, server actions, API routes, client vs server component split. Add a small `verification/mini-next` fixture plus a pinned real Next.js repo as scan targets. Golden-lock both.
3. **Python servers.** New extractor family: FastAPI and Django routes, SQLAlchemy models, Celery tasks/schedules. Add `verification/mini-python` plus a pinned real Python repo. Golden-lock both.
4. **Self-renewal — the ladder must never be empty.** When rungs 1–3 are locked, promote the next most popular capability from the README roadmap (MongoDB collections, GraphQL, OpenAPI, Docker/monorepo layouts, …) to rung 4, 5, … and keep climbing. There is always a next stack; never conclude the mission is complete.

Rules:

- Rungs are sequential by default. Skip ahead only if genuinely blocked, and record why in the Learning log.
- Real-repo targets are pinned by commit SHA and cloned into gitignored paths — **do not vendor third-party code into this repo**.
- If cloning fails in the loop environment, fall back to enriching the local fixture for that rung and note it in the Learning log — but try the real repo first.
- Polish is **always in scope** — improving the default browser’s legibility and beauty is core capability, not a distraction. The ladder only forbids stalling: don’t string together polish-only ticks while the current rung has an obvious next step.
- Every rung ends with a polish pass on its new output: a freshly mapped stack/repo must look as good as the self-map before the rung is called locked.

### Standing guarantee: flawless on itself

Whatever else the loop builds, `node dist/cli.js scan .` on Underdelta itself — and the mini-stack — must **always** produce a stunning, accurate, demo-ready map. That is what the human opens first every morning to judge the whole project. Golden locks in verify protect correctness; regular polish attention protects beauty. Never let the self-map or mini-stack rot while chasing new stacks — if a capability change degrades them visually, fixing that is immediately the highest-priority work.

---

## Status board

Update these checkboxes and the “Next focus” section every tick.

### Done

- [x] Stack-neutral `architecture.json` contract (`src/schema.ts`)
- [x] Compile pipeline + graph assembly
- [x] TypeScript/JS extractor (routes, components, jobs, queues, calls)
- [x] Prisma + SQL extractors
- [x] Navigable viewer (lanes, pan/zoom, search, kind shapes)
- [x] Scan excludes tests/fixtures/build artifacts from default map
- [x] Autopilot plan file created (`docs/AUTOPILOT_PLAN.md`)
- [x] Side verification mini-system (`verification/mini-stack`) with pipeline + cron + queue + routes + Prisma/SQL + UI
- [x] `npm run verify` asserts fixture kinds/edges and that default `scan .` excludes `verification/`
- [x] Minimal `Pipeline` / step extraction in TypeScript extractor
- [x] Ignore `verification` and `.underdelta-verify` in product discovery
- [x] Semantic projection layer (`src/project.ts`) collapses modules into product systems
- [x] Underdelta self-map projects CLI → Compile → Extractors → Graph → Viewer (+ Schema)
- [x] Viewer defaults to Systems lane; modules/functions behind Details toggle
- [x] `npm run verify` asserts self-map semantic nodes + fixture projection
- [x] Diagram quality pass: nest routes/cron/queue/pipelines/UI under systems
- [x] Dedupe Prisma/SQL/usage table aliases (Order/orders → one table)
- [x] Distinguish Viewer vs UI projection labels; hide pipeline-steps by default
- [x] Richer verify: fixture system labels, table dedupe, API contains routes
- [x] Plan hardened: product-build > merge-prep, never-idle, self-renewing backlog
- [x] Flow-ordered Product flow band in viewer (`metadata.flowOrder`)
- [x] Explicit `architecture.json` artifact node on Underdelta self-map (compile/graph → artifact → viewer)
- [x] Verify asserts artifact node, flowOrder chain, and artifact flows-to links
- [x] Humanized cron labels (`handler (expression)`)
- [x] Extracted `checkout` pipeline nested under Pipelines + collapsed in overview
- [x] Overview collapses system leaves (routes/components/cron/queue/…) until focus/Details
- [x] package.json `bin`/exports projection (CLI binCommands, product exposes CLI)
- [x] Inspector shows Key files (+ Package bin) for systems before raw evidence
- [x] Queue publish/consume clarity on the default map (messaging hubs stay visible)
- [x] Generated browser artifact node (`index.html`) beside architecture.json
- [x] Capture a “scan Underdelta” golden summary in verify (counts + required labels)
- [x] Richer Underdelta self-map collaboration edges (uses/renders/exposes/triggers/configures)
- [x] Surface extractor roster on Extractors system (keyFiles / child labels)
- [x] Mini-stack flowOrder band so fixture diagram reads left-to-right like Underdelta
- [x] SQL + Prisma table unification polish (names, relations, migrations edge, column dedupe)
- [x] README heading roles as weak projection hints
- [x] Viewer inspector: show collaboration edges (uses/renders/exposes) before raw imports
- [x] Inspector: surface migration + sqlName/prismaName on unified tables
- [x] Collapse relation-only Prisma fields on overview while keeping table↔table edges
- [x] Inspector: show collaboration edge detail text (not just kind · label)
- [x] Canvas: style collaboration edges differently from imports/calls
- [x] Inspector: show table↔table relation labels beside Data access nodes
- [x] Mini-stack: labeled publish/consume/migrates narrative edges on the default browser
- [x] Overview: selection badges for collaboration + table relation edges
- [x] Cron schedule hubs stay visible on overview (like messaging hubs)
- [x] Filter Map.get-style false-positive HTTP routes from TypeScript extractor
- [x] Rung 1: pin `gothinkster/node-express-realworld-example-app` @ `30b68e1e881462b2f4164ea09ab4c4f5699c7b0b`; clone into gitignored `.underdelta-real/`; wire isolated scan into `npm run verify` (smoke floors: routes/tables/core RealWorld paths)
- [x] Rung 1: strip README markdown-image / how-to heading pollution from product + system labels; collapse Prisma/SQL join-table aliases (`_ArticleToTag`, `ArticleTags`, …) on the default map
- [x] Rung 1: RealWorld default map legible — HTTP API + Data access, all routes nested under API (incl. `GET /` from `main.ts`), product tables under Data, flowOrder API→Data, routes collapsed on overview
- [x] Rung 1: golden-lock real-repo summary in verify (product title, systems/labels, 20 nested routes, 4 visible tables, flowOrder + flows-to, join collapse)
- [x] Rung 1: surface User↔Article favorites + clean User↔User follows (merge multi-field Prisma labels; drop join-table FK edges; fix SQL ALTER TABLE FK source)
- [x] Rung 1 polish: RealWorld default browser — humanize relation labels (authored/favorites, favorited by, tags), always-on green table-relation badges, 2-column table constellation, gate Checkout/orders collab off API+Data-only maps
- [x] Rung 2 prep: Next.js App Router extraction — `app/**/page|layout|route`, `"use client"` / `"use server"`, server actions; path-role UI vs API; neutral UI→API collab (commerce gated to pipelines/workers/jobs)
- [x] Rung 2: `verification/mini-next` fixture (app router pages/layouts, route handlers, server actions, client components) + verify golden floors (Journal UI → Posts API)
- [x] Rung 2: pin `nextjs/saas-starter` @ `6e33e58b1e553a41fe22e6b941a7229a002de361`; clone into gitignored `.underdelta-real/nextjs-saas-starter`; golden-lock UI+API pages/routes/flow/uses + signOut + client components
- [x] Rung 2 polish: saas-starter Data access — `/db/` path-role before Schema contract; strip `public.` table aliases; humanize SQL labels (Team member / Activity log); nest 5 tables; flowOrder UI→API→Data + uses:query; golden-lock
- [x] Rung 2 polish: mini-next journal story — humanize pages/layouts/client/server-actions (Home/Dashboard, App layout, Post list/form, Create/Delete post); nest clients under UI + actions under API; keep page children under convention nodes; top-level `components/` path-role
- [x] Rung 2 polish: saas-starter page/auth labels — App Router paths → Home/Pricing/Dashboard · …/Sign in/Sign up; `signOut` → Sign out (shared humanize helpers)
- [x] Rung 2: extract HOF-wrapped `'use server'` exports (`validatedAction` / `withTeam`) from saas-starter — Sign in/up/out, password/account/team mutations, Checkout/Customer portal; nest all under HTTP API; golden-lock
- [x] Rung 2 polish: saas-starter billing/API chrome — humanize Stripe/User/Team route labels (`GET Stripe checkout`), drop trailing `Action` on Checkout/Customer portal, tame remaining PascalCase components
- [x] Rung 2 polish pass: saas-starter default browser — auth/billing `overviewHub` actions (Sign in/up/out, Checkout, Customer portal) visible beside UI→API→Data; collapse all UI component chrome on overview; viewer lets overviewHub bypass function hide — **Rung 2 locked**
- [x] Rung 3 prep: Python extractor surface — FastAPI `@app/@router.(get|post|…)` + `api_route(methods=…)`, Django `path`/`re_path`/`url`; `.py` modules project; `urls.py` + `/routers/` → HTTP API; verify tempfile smoke + Extractors roster includes `python`
- [x] Rung 3: `verification/mini-python` fixture (FastAPI + Django routes, README Notes API) + golden floors in verify (product title, 6 FastAPI + 3 Django routes nested/collapsed under Notes API)
- [x] Rung 3: resolve FastAPI `include_router` prefixes (+ empty `""` mounts, `settings.api_prefix` literals) onto decorator paths; mini-python notes routes use relative + prefix
- [x] Rung 3: pin `nsidnev/fastapi-realworld-example-app` @ `029eb7781c60d5f563ee8990a0cbfb79b244538c`; pyproject product title humanize; golden-lock 19 `/api/…` routes nested/collapsed under HTTP API → Data access
- [x] Rung 3: Alembic `op.create_table` (+ SQLAlchemy/`__tablename__` + PyPika `__table__`) → Data access tables; collapse `*_to_*`/FK-only joins; golden-lock mini-python Note/User/Tag + FastAPI RealWorld User/Article/Tag/Commentary
- [x] Rung 3 polish: FastAPI RealWorld default browser — humanize `/api` routes (params stripped), Commentary→Comment, collapse module chrome, lift join favorites/follows/tags + FK author/on story; golden-lock
- [x] Rung 3: Celery `@shared_task`/`@app.task` + `beat_schedule`/`add_periodic_task` → job/cron; path-role `tasks.py`/`celery*.py`; mini-python fixture schedules; commerce gate drops bare `jobs`; golden-lock API→Jobs→Data + uses:sync
- [x] Rung 3 polish: mini-python data story parity — lift `notes_to_tags` → Note→Tag tags (any tagged entity, not Article-only); Note↔User author/authored; quiet module chrome golden-lock
- [x] Rung 3 lock: North-star schedule hubs — `humanizeCronExpression` (`0 * * * *` → every hour, `*/15` → every 15 minutes); golden-lock mini-python + mini-stack cron phrases, Notes API/HTTP API `uses:query` → Data; **Rung 3 locked**
- [x] Rung 4 prep: MongoDB collections extractor — `mongoose.model` / bare `model(` / Schema `{ collection }` / `.collection(`; `kind: collection` + technology mongoose|mongodb; nest/dedupe under Data access; `/models/` path-role; Extractors roster includes `mongo`
- [x] Rung 4: `verification/mini-mongo` fixture (Express Notes API + Mongoose Note/User/Tag) + verify golden floors (Catalog data collections, API→Data uses:query, overview collapse)
- [x] Rung 4: pin `sahat/hackathon-starter` @ `d20161b9e81e817d38b3633e08349f327b01d974`; clone into gitignored `.underdelta-real/hackathon-starter`; golden-lock User/Session/Ai agent checkpoint under Data access + HTTP API→Data flow/uses; skip FAQ/HTML README heading pollution (`http://` in `<img src>` must not rename API)
- [x] Rung 4: resolve `.collection(CONST)` same-file string bindings — Rag chunks / Llm semantic cache on hackathon-starter + Search chunks / Query cache on mini-mongo; SCREAMING_SNAKE consts → humanized labels; golden-lock
- [x] Rung 4: Mongo `.aggregate([...])` → pipeline nodes (stages as Filter/Group/Sort… steps); nest under Data as overview hubs; mini-mongo Search chunks + Note pipelines golden-locked (hackathon-starter only documents aggregate in README)
- [x] Rung 4: surface `createCollectionForVectorSearch(db, CONST, …)` helper wrappers as collection evidence (mini-mongo Vector docs helper-only; hackathon-starter RAG_CHUNKS + LLM_SEMANTIC_CACHE append helper evidence)
- [x] Rung 4 polish: North-star mini-mongo + hackathon-starter — acronym labels (RAG/LLM/AI), aggregate hubs in Data constellation beside collections, collapse aggregate stages on overview, bare `/api` → `GET API`; golden-lock — **Rung 4 locked**
- [x] Standing guarantee: mongo `maskComments` treats `/regex/` literals — self-map free of Collection/Note/Receiver/MongoDB comment noise; golden-lock in verify
- [x] Standing polish: inspector metadata hygiene — hide `projection` / `systemKey` / `flowOrder` pills so North-star users see product evidence, not compiler internals; golden-lock in verify
- [x] Rung 5 prep: OpenAPI extractor — `openapi.yaml`/`yml`/`json` + `swagger.*`; paths+operations → routes; spec modules path-role → HTTP API; humanize openapi routes; `verification/mini-openapi` smoke floors + Extractors roster includes `openapi`
- [x] Rung 5: thicken mini-openapi golden — dual-format `openapi.yaml` + `swagger.json` (basePath `/api` tags), summary-first route labels, operationId/summary/evidence floors, flowOrder Notes API, collapse spec modules
- [x] Rung 5: pin `swagger-api/swagger-petstore` @ `8f0dd286987880b4af7bce552aca3813166f3049`; clone into gitignored `.underdelta-real/swagger-petstore`; golden-lock 19 ops under HTTP API (summary labels + operationIds + evidence + flowOrder + collapsed spec)
- [x] Rung 5 polish: Petstore default browser — strip OpenAPI summary trailing periods; ignore `CI/` release-script chrome; prefer cleaned OpenAPI `info.title` (`Swagger Petstore`) over README sample boilerplate
- [x] Rung 5 lock: unique summary labels (mini-openapi + Petstore, no path-param twin chrome); Express+OpenAPI dual-source tempfile nests under one Notes API; North-star overview HTTP API only — **Rung 5 locked**
- [x] Rung 6 prep: GraphQL operations extractor — `.graphql`/`.gql` SDL `type Query|Mutation|Subscription` fields + `gql`/`graphql` tagged documents; wire compile + path-role/isFileModule; humanize Query/Mutation labels; `verification/mini-graphql` smoke floors + Extractors roster `graphql`
- [x] Rung 6: thicken mini-graphql golden — nest schema+document ops under Notes API, evidence floors (`field:` + operationName), collapse schema.graphql + operations.ts chrome, unique North-star labels (named docs drop Query/Mutation so CreateNote ≠ Mutation Create note)
- [x] Rung 6: pin `zth/graphql-client-example-server` @ `814f2ba089368c29f433dc395fe169ae52740a46`; clone into gitignored `.underdelta-real/graphql-client-example-server`; golden-lock 15 SDL ops (incl. subscription) under HTTP API + unique labels + schema.graphql collapse + evidence `field:`
- [x] Rung 6 polish/lock: quiet non-compiler chrome — fold bare `schema.ts` Schema contract → HTTP API; collapse empty bin CLI + table-less Data; flowOrder HTTP API only; North-star overview HTTP API–led — **Rung 6 locked**
- [x] Rung 7 prep: Docker/Compose extractor — `Dockerfile`/`docker-compose.y*ml` services → Deploy; path-role + Containers README; `verification/mini-docker` smoke floors + Extractors roster `docker`; quiet Dockerfile-only Deploy beside API/UI/Data

### Real-repo pins (Capability ladder)

| Rung | Repo | SHA | Local cache (gitignored) |
|------|------|-----|--------------------------|
| 1 | `gothinkster/node-express-realworld-example-app` | `30b68e1e881462b2f4164ea09ab4c4f5699c7b0b` | `.underdelta-real/node-express-realworld` |
| 2 | `nextjs/saas-starter` | `6e33e58b1e553a41fe22e6b941a7229a002de361` | `.underdelta-real/nextjs-saas-starter` |
| 3 | `nsidnev/fastapi-realworld-example-app` | `029eb7781c60d5f563ee8990a0cbfb79b244538c` | `.underdelta-real/fastapi-realworld` |
| 4 | `sahat/hackathon-starter` | `d20161b9e81e817d38b3633e08349f327b01d974` | `.underdelta-real/hackathon-starter` |
| 5 | `swagger-api/swagger-petstore` | `8f0dd286987880b4af7bce552aca3813166f3049` | `.underdelta-real/swagger-petstore` |
| 6 | `zth/graphql-client-example-server` | `814f2ba089368c29f433dc395fe169ae52740a46` | `.underdelta-real/graphql-client-example-server` |

### In progress / next

Keep **at least 3 unchecked items** here at all times (refill from Self-renewing backlog).

- [ ] Rung 7: pin a real Docker/Compose OSS repo (exact SHA) into gitignored `.underdelta-real/` + golden-lock
- [ ] Rung 7 polish: Compose service story — depends_on / ports / image labels as North-star canvas vocabulary; quiet duplicate Dockerfile App image when Compose `build:` already owns the service
- [ ] GraphQL `schema { query: Root }` / non-Query root types (SWAPI-style) if a later pin needs it
- [ ] Standing polish: Underdelta self-map cold-read pass — any leftover jargon labels or weak hierarchy after mongo noise + inspector hygiene
- [ ] Standing polish: hide remaining compiler chrome pills (`labelSource`, `pathRoleLabel`, `collapsedInOverview`, `overviewHub`) if they still dump in inspector

### Seed backlog (pull from here when In progress < 3)

Not a full roadmap — a menu the agent may reorder. Pick what most improves the **Capability ladder** now.

- Rung 7+: Terraform / Kubernetes (README roadmap after Docker)
- GraphQL `extend type Query` / schema stitching if a real-repo pin needs it
- OAS3 `servers` / `$ref` path-item resolution if a later OpenAPI pin needs it
- Performance pass only if scanning a real repo becomes painfully slow
- Docs only when CLI/behavior changed

### Next focus (edit every tick)

> **Next focus:** This work is done (Rung 7 prep — Docker/Compose extractor + mini-docker smoke). Now pin a real Docker/Compose OSS repo at an exact SHA and golden-lock Deploy/Containers so we can lock Rung 7.

### Learning log (append every tick)

Append short bullets like:

```text
- YYYY-MM-DD HH:MM UTC | Done: … | Next: … | Learned: …
```

- 2026-08-02 | Done: created living autopilot plan | Next: verification mini-system | Learned: loop needs explicit non-interrupt + plan-file updates to stay coherent overnight
- 2026-08-02 02:10 UTC | Done: verification/mini-stack + npm run verify + Pipeline extraction + ignore verification/ | Next: semantic projection for Underdelta self-map | Learned: fixture must be scanned as its own root; directory-name ignores keep product diagrams clean without deleting the suite
- 2026-08-02 02:28 UTC | Done: semantic projection + self-map systems + Details toggle | Next: diagram quality pass | Learned: Autopilot does not self-wake between ticks—each 15m iteration needs a new agent trigger; path-role projection is enough to turn a module hairball into CLI/Compile/Extractors/Graph/Viewer
- 2026-08-02 02:32 UTC | Done: nest runtime nodes under systems, dedupe tables, UI vs Viewer, richer verify | Next: flow-ordered layout + architecture.json artifact node | Learned: Prisma+SQL+usage tables triple-count without normalization; high-signal nodes must be reparented onto systems or the overview still feels like a parts bin
- 2026-08-02 02:50 UTC | Done: hardened plan (product-build > merge-prep, never-idle, self-renewing backlog) | Next: flow-ordered layout + artifact node | Learned: checklist exhaustion and merge-ready autopilot skill can falsely idle a build loop unless the plan forbids it
- 2026-08-02 02:55 UTC | Done: flowOrder Product flow band + architecture.json artifact + verify | Next: cron labels, nest checkout pipeline, collapse duplicate leaves | Learned: left-to-right product story needs a dedicated flow band above lanes; artifact should sit between compile/graph and viewer
- 2026-08-02 03:00 UTC | Done: humanized cron labels, nest checkout under Pipelines, collapse overview leaves | Next: package.json projection + inspector key files | Learned: parent semantic systems should own the overview; leaves stay available on focus/Details so the map stops restating itself
- 2026-08-02 03:05 UTC | Done: package.json bin→CLI projection + keyFiles in inspector | Next: queue publish/consume clarity + index.html artifact | Learned: bin entries are strong CLI evidence and should map dist entrypoints back to src modules for keyFiles
- 2026-08-02 03:15 UTC | Done: queue `.add`→publishes + Worker→consumes, system-lifted pub/sub, messaging hubs stay on overview | Next: index.html artifact beside architecture.json | Learned: collapsing every queue hides the product story; hubs with both publishers and consumers must stay visible and edges must lift onto API/workers systems
- 2026-08-02 03:20 UTC | Done: index.html browser artifact (prior commit) + Underdelta golden summary in verify (counts/labels/floors + flowOrder) | Next: richer self-map collaboration edges | Learned: previous tick can land code without updating the plan—first reconcile Status board, then take the next open increment; golden floors beat exact counts for overnight loops
- 2026-08-02 03:25 UTC | Done: collaboration edges (compile uses extractors/graph/schema, viewer renders graph+IR, CLI triggers compile + exposes artifacts, schema configures extractors/graph) + verify | Next: extractor roster on Extractors system | Learned: flows-to alone reads as a pipeline; uses/renders/exposes/triggers make system collaboration legible without overcrowding the Product flow band
- 2026-08-02 03:30 UTC | Done: reconciled extractor roster + mini-stack flowOrder on Status board; polished SQL+Prisma table unify (labels/sources, migrates edges, FK relations, column dedupe, fix retarget-before-attach) + verify | Next: README heading roles as weak projection hints | Learned: retargeting SQL table ids after attach resurrects product→table contains; merge redirects must land before Data access nesting; column camel/snake aliases otherwise restates the schema twice
- 2026-08-02 03:40 UTC | Done: reconciled README heading hints on Status board; inspector Collaboration section (uses/renders/exposes/triggers/configures/flows-to) before Imports & calls + verify | Next: inspector migration/sqlName/prismaName on unified tables | Learned: prior tick can land a feature without updating the plan—reconcile Done first; product-story edges must outrank module imports in the inspector or founders still see a dependency dump
- 2026-08-02 03:45 UTC | Done: reconciled Prisma/SQL inspector on Status board; collapse relation-only Prisma fields (order/payments) with relationOnly + viewer hide; keep Payment↔Order edges + verify | Next: inspector collaboration edge detail text | Learned: ORM navigation fields restate table↔table edges as fake columns once Details is on; collapse them at projection time and hide unless searched so Data access stays schema-true
- 2026-08-02 03:50 UTC | Done: reconciled collaboration inspector detail on Status board; canvas `.edge.collab` / `.flows-to` styling + legend + verify | Next: inspector table↔table relation labels | Learned: prior tick can land inspector detail without plan update—reconcile first; collaboration edges were inferred-purple like noise until given a dedicated canvas class apart from import/call hairlines
- 2026-08-02 03:48 UTC | Done: reconciled table-relation inspector + narrative publish/consume/migrate badges + selection collab/relation labels + cron scheduleHub on Status board; reject Map.get-style false HTTP routes (path must look like `/…` + handler arg) + tighten narrative badge verify | Next: mini-stack system collaboration edges | Learned: `systems.get("cli")` was polluting Application with GET cli/data/…; Express extraction needs HTTP-shaped paths, and string-presence verifies must match setAttribute output not imagined static HTML
- 2026-08-02 03:56 UTC | Human directive: Capability ladder added (real Node/React repo → Next.js → Python servers → self-renewal); polish deprioritized below capability rungs; tick-start health check added because push-triggered reruns cancel in-flight ticks | Next: rung 1 — pin a real Node/Express/React repo and wire it into verify | Learned: the loop had locally optimized its two self-authored targets; the frontier is generalization to repos it did not write
- 2026-08-02 03:59 UTC | Done: rung 1 pin+wire — `gothinkster/node-express-realworld-example-app` @ `30b68e1e8814` cloned to `.underdelta-real/`, ignored by product discovery, `npm run verify` smoke-scans it (20 routes / 8 tables / core RealWorld paths) | Next: fix README markdown-image product label + join-table aliases; legible API+Data map; golden-lock | Learned: foreign Express+Prisma already extracts routes/tables; first real-repo breakage is projection (README `![…](img)` becomes the product title; implicit M2M join tables double-count)
- 2026-08-02 04:10 UTC | Done: sanitize README image titles → product label; H2/H3-only system hints; skip how-to headings; collapse `_ArticleToTag`/`ArticleTags`/favorites/follows join tables; verify locks clean labels + 4 Prisma models | Next: nest RealWorld routes/tables + flowOrder; golden-lock | Learned: scoped package names (`@api/source`) need README H1; bare `\bprisma\b`/`\bdatabase\b` in how-to headings will rename Data access unless imperatives are filtered; length-based README refine is unsafe
- 2026-08-02 04:12 UTC | Human directive #2: polish restored as first-class twin engine (North star user = non-coder vibe-builders; the browser IS the product); ladder now only forbids polish-only stalls, and each rung ends with a polish pass; standing guarantee added — self-map + mini-stack always demo-ready | Next: continue rung 1 (README image label + join-table aliases) | Learned: steering must not swing the pendulum — deprioritizing polish would rot the exact surface the product is judged on
- 2026-08-02 04:15 UTC | Done: nest all RealWorld routes under HTTP API (entrypoint `GET /` from `main.ts` was leaking); golden-lock API+Data nesting, overview route collapse, visible product tables, flowOrder API→Data + flows-to | Next: User↔Article favorites / follows relation edges | Learned: path-role owningSystem lift misses routes defined outside `/routes/`/`/api/`; when an API system exists, attach every `route` node to it before overview collapse
- 2026-08-02 04:22 UTC | Done: merge multi-field Prisma relation labels (articles/favorites, author/favoritedBy); humanize followedBy+following→follows; drop join-table depends-on; fix SQL ALTER TABLE FK source attribution; golden-lock | Next: RealWorld polish pass | Learned: one-edge-per-pair dedupe silently drops M2M field names when a 1:n edge already owns the directed pair; Prisma migration ALTER FKs were all attributed to the last CREATE TABLE
- 2026-08-02 04:30 UTC | Done: RealWorld polish — authored/favorites + favorited by + tags labels; always-on `.edge.relation` badges; 2-col table constellation; gate commerce collab behind requiresAny; verify | Next: Rung 2 mini-next fixture | Learned: selection-only relation badges hid the whole data story from cold readers; hardcoded Checkout api→data collab fired on any API+Data map and poisoned RealWorld until gated
- 2026-08-02 04:35 UTC | Done: Rung 2 mini-next — App Router page/layout/route extraction, use client/server + serverAction metadata, path-role UI vs API, `verification/mini-next` journal fixture, verify golden floors, commerce collab gated to pipelines/workers/jobs + neutral UI→API fetch | Next: pin real Next.js OSS repo | Learned: Express-style `app.get` never sees `app/**/route.ts` exports; convention nodes + HTTP-method exports are required; commerce `requiresAny` must not include bare `ui` or Next UI+API maps inherit Checkout copy
- 2026-08-02 04:45 UTC | Done: Rung 2 pin+golden — `nextjs/saas-starter` @ `6e33e58b1e55` cloned to `.underdelta-real/nextjs-saas-starter`; verify locks product title, 8 pages under UI, 4 API routes, UI→API flow/uses, signOut, ≥5 client components, table floor, no commerce collab noise | Next: saas-starter Data nesting + label polish | Learned: sunset `vercel/nextjs-subscription-payments` still scans but official replacement `nextjs/saas-starter` is the right pin; Drizzle tables extract but sit outside Data access (`Schema contract` appears in flowOrder); only `signOut` gets `serverAction` while sibling exports in `'use server'` files are missed
- 2026-08-02 04:26 UTC | Done: saas-starter Data polish — `/db/` before Schema contract; SQL `public.` strip + snake_case humanize; 5 tables under Data; UI→API→Data + uses:query; join-table `_` preserved through label polish; verify golden | Next: mini-next label humanize | Learned: bare `schema.ts` → Schema contract hijacks Drizzle `lib/db/schema.ts`; FK targets `"public"."users"` create duplicate table ids until schema qualifiers are stripped at extract + normalizeTableKey; titleCaseSingular must not erase `_Join` chrome before join-collapse
- 2026-08-02 04:45 UTC | Done: Next label humanize — App path + identifier helpers; mini-next journal labels; saas-starter pages/Sign out; top-level `components/`→UI; preserve page children; nest server actions under API; verify golden | Next: extract remaining saas-starter `'use server'` actions | Learned: lift-to-system was flattening HomePage beside Home; convention-child skip + path-aware layout humanize keep the story nested; `components/PostForm.tsx` never matched `"/components/"` without a leading-slash-tolerant role regex
- 2026-08-02 04:55 UTC | Done: HOF-wrapped `'use server'` exports — create function nodes for `validatedAction`/`withTeam` CallExpression exports; path-role `actions.ts` + blanket nest serverActions under API; golden-lock 10 auth/billing actions | Next: saas-starter Stripe/billing label polish | Learned: declaration visit only saw arrow/fn initializers so HOF factories never became nodes; `app/actions/` path-role misses `app/(login)/actions.ts` and `lib/payments/actions.ts` — metadata-driven API attach is required
- 2026-08-02 05:00 UTC | Done: saas-starter billing/API chrome — `humanizeNextRouteLabel` (strip `/api`, sentence-case path), `humanizeServerActionLabel` drops trailing Action, humanize all components (not only client); golden-lock GET Stripe checkout / Checkout / Customer portal | Next: Rung 2 final polish pass then lock | Learned: per-segment Title Case yields shouty `Stripe Checkout`; sentence-case after the first path segment; Action suffix is factory chrome (`checkoutAction`) not product vocabulary
- 2026-08-02 04:41 UTC | Done: Rung 2 locked — collapse all component chrome on overview; auth/billing server actions as `overviewHub` (Sign in/up/out, Checkout, Customer portal) stay visible; viewer bypasses function hide for overviewHub; golden-lock | Next: Rung 3 Python extractor sketch | Learned: page children sit under convention pages not semantic UI so leaf-collapse never quieted them; server actions are `function` kind so collapsedInOverview=false is not enough without a viewer overviewHub exception
- 2026-08-02 04:50 UTC | Done: Rung 3 prep — `src/extractors/python.ts` FastAPI decorators + api_route methods + Django path/re_path/url; wire into compile; `.py` isFileModule; urls.py+/routers/ path-role; ignore venv/__pycache__; Extractors roster+tempfile smoke in verify | Next: verification/mini-python fixture + golden floors | Learned: isFileModule was JS/TS-only so Python modules never got path-role systems until `\.py` was added; Django `<int:pk>` needs `:` in the path heuristic; include_router prefixes still unresolved (seed backlog)
- 2026-08-02 04:55 UTC | Done: Rung 3 mini-python — `verification/mini-python` FastAPI main+routers/notes + Django blog/urls; README Notes API; verify golden floors (product title, 9 routes nested/collapsed, no commerce noise); replaced tempfile smoke | Next: pin real Python OSS repo | Learned: fixture routes need absolute decorator paths until include_router prefixes resolve; product label lives on the `product` node not `graph.product`; routers/+urls.py alone are enough to project Notes API without a `main.py` path-role
- 2026-08-02 04:50 UTC | Done: Rung 3 pin+prefix — `nsidnev/fastapi-realworld-example-app` @ `029eb77` gitignored; resolve include_router + empty `""` mounts + `api_prefix` settings literals; pyproject poetry name → FastAPI RealWorld Example App; mini-python notes relative+prefix; golden-lock 19 `/api/…` routes | Next: Alembic/SQLAlchemy tables on Data access | Learned: RealWorld FastAPI hides full paths behind nested include_router; `""` decorators are mount roots not missing routes; README.rst has no H1 so Poetry package name must humanize; SQL extractor is `.sql`-only so Alembic `op.create_table` never becomes tables yet
- 2026-08-02 04:53 UTC | Done: Alembic `op.create_table` + SQLAlchemy/`__tablename__` + PyPika `__table__` in python extractor; join collapse via `*_to_*` + FK-only; repo-root `db/` path-role; mini-python db fixture; golden-lock User/Article/Tag/Commentary + Note/User/Tag | Next: FastAPI RealWorld polish pass | Learned: nsidnev RealWorld is Alembic+PyPika not declarative ORM; join collapse must not require Prisma keys; bare `db/` fixtures miss `includes("/db/")` unless `(^|/)db/` is accepted
- 2026-08-02 05:05 UTC | Done: FastAPI RealWorld polish — `humanizeHttpRouteLabel` (drop `/api` + params), Commentary→Comment, collapse module chrome when systems exist, lift Alembic join favorites/follows/tags + FK author/on + reverse authored; golden-lock | Next: Celery tasks/schedules | Learned: collapsing join FK edges erased the whole M2M story until lift-before-drop; `mergeRelationLabels` must split prior ` / ` joins or authored duplicates; path-param strip makes GET list/detail share a label (verify by product words, not raw paths)
- 2026-08-02 05:00 UTC | Done: Celery `@shared_task`/`beat_schedule`/`add_periodic_task` → job+cron; path-role tasks/celery*.py; mini-python Send digest/Purge stale notes + schedule hubs; commerce gate no longer treats bare `jobs` as Checkout; neutral jobs→data uses:sync; golden-lock | Next: mini-python Note↔Tag polish then Rung 3 lock | Learned: nsidnev RealWorld has no Celery so fixture carries the rung; `requiresAny: jobs` on commerce poisoned notes apps — gate Checkout/payments on pipelines/workers only
- 2026-08-02 05:05 UTC | Done: mini-python data story — generalize tag-join lift beyond Article (Note→Tag tags); author reverse for Note as well as Article; golden-lock tags/author/authored + quiet modules | Next: Rung 3 final North-star lock pass | Learned: `articles_to_tags` polish hardcoded Article so `notes_to_tags` collapsed silently with no product edge; tagged-entity lookup must be any non-tag FK on the junction
- 2026-08-02 05:07 UTC | Done: Rung 3 locked — `humanizeCronExpression` for schedule hubs (every hour / every 15 minutes); golden-lock mini-python + mini-stack cron phrases + API uses:query→Data on FastAPI RealWorld/mini-python; promote Rung 4 MongoDB | Next: Rung 4 Mongo collections extractor + mini-mongo fixture | Learned: raw crontab glyphs on overview hubs (`0 * * * *`) are pure jargon for the North star user; keep expression in metadata, show plain English on the canvas; JSDoc must not contain `*/N` or it terminates the block comment
- 2026-08-02 05:20 UTC | Done: Rung 4 prep+fixture — `src/extractors/mongo.ts` (mongoose.model / Schema collection / .collection), project nest+dedupe collections under Data, `/models/` path-role, `verification/mini-mongo` Notes API→Catalog data Note/User/Tag, verify golden + Extractors roster `mongo` | Next: pin real Mongo OSS repo + golden-lock | Learned: do not infer mongoose model names from nearby Schema calls in multi-model files (Tag Schema + later `model("Note")` mis-labels); emit raw collection names and let projection merge Note↔notes; unscoped package.json names beat README H1 in preferProductLabel — omit fixture package.json when the README title is the product name
- 2026-08-02 05:35 UTC | Done: Rung 4 pin+golden — `sahat/hackathon-starter` @ `d20161b9e81e` gitignored; User/Session/Ai agent checkpoint under Data; HTTP API→Data flow/uses; skip FAQ/`?` headings + strip HTML `<img src="http://…">` so README chrome cannot rename API; golden-lock | Next: `.collection(CONST)` identifier resolution for RAG/cache collections | Learned: after FAQ skip, the next false API label was a Date Cheatsheet whose raw HTML `src="http://…"` matched `\bhttp\b` — sanitize must strip HTML before system-key inference; well-known mongoose apps still hide collections behind `const NAME = '…'; db.collection(NAME)`
- 2026-08-02 05:45 UTC | Done: `.collection(CONST)` same-file string bindings — Rag chunks / Llm semantic cache + mini-mongo Search chunks / Query cache; SCREAMING_SNAKE → humanizeIdentifierLabel; golden-lock | Next: Mongo `.aggregate` pipelines | Learned: resolve identifier→literal in-extractor and keep `collectionName` for dedupe keys; prefer binding names for labels because `rag_chunks` singularizes to "Rag chunk" while `RAG_CHUNKS` keeps the product plural
- 2026-08-02 05:55 UTC | Done: Mongo `.aggregate` → pipeline + humanized stage steps; nest under Data as overviewHub (never invent Pipelines system — Checkout gate); mask comments so JSDoc cannot invent call sites; mini-mongo golden-lock Search chunks + Note pipelines | Next: createCollectionForVectorSearch helpers | Learned: sahat/hackathon-starter only shows aggregate in README (fixture carries the rung); `$sum` accumulators must not become stages — whitelist known stage ops; comment masking is mandatory for regex extractors
- 2026-08-02 05:25 UTC | Done: `createCollectionForVectorSearch(db, CONST)` → collections (+ append evidence on already-seen nodes); mini-mongo Vector docs helper-only golden-lock; hackathon-starter RAG_CHUNKS/LLM_SEMANTIC_CACHE helper evidence | Next: Rung 4 polish pass then lock | Learned: helper body `db.collection(collectionName)` is a param and correctly skipped — call sites carry the product CONST; fixture must omit bare `.collection(VECTOR_DOCS)` or the helper path is never proven
- 2026-08-02 05:30 UTC | Done: Rung 4 locked — acronym-aware labels (RAG/LLM/AI), viewer puts mongoAggregate hubs in Data constellation beside collections, collapse aggregate stages, `/api`→GET API; golden-lock | Next: fix maskComments regex literals (self-map Collection/Note noise) | Learned: comment masking is defeated by `/regex/` patterns that contain quotes — later JSDoc/line comments stay live and the mongo extractor maps its own docs onto Underdelta’s self-map; semantic `kind:pipeline` systems must stay in Systems lane while mongo hubs route to Data via laneNameFor
- 2026-08-02 05:33 UTC | Done: maskComments consumes `/regex/` literals (char-class + escapes + flags; keyword/punctuator prefix heuristic) so JSDoc stays masked; self-map drops Collection/Note/Receiver/MongoDB chrome; verify golden-lock | Next: inspector metadata pill hygiene | Learned: the poison was cleanName's quote-stripping character-class regex — a quote inside `/[…]/` flipped maskComments into string mode for the rest of the file; regex extractors need a real mini-lexer, not only quote+comment tracking
- 2026-08-02 05:34 UTC | Done: inspector hygiene — hide projection/systemKey/flowOrder from structuredMetaKeys pill dump; golden-lock in verify | Next: Rung 5 OpenAPI extractor sketch + mini-openapi fixture | Learned: system nodes dump compiler internals as the first inspector chrome a founder sees; structuredMetaKeys already owned messaging/table keys — extending that set is enough without a second filter
- 2026-08-02 05:40 UTC | Done: Rung 5 prep — `src/extractors/openapi.ts` YAML/JSON paths+ops, spec modules as file-modules → HTTP API, humanize openapi routes, `verification/mini-openapi` Notes API smoke + Extractors roster `openapi` | Next: thicken mini-openapi golden (swagger.json dual-format + flowOrder) | Learned: isFileModule was JS/TS/Py-only so openapi.yaml never got path-role until yaml/json spec filenames were admitted; keep YAML path walking dependency-free for typical specs; `spec`/`specs` dirs stay ignored — put contracts at `openapi.yaml` or under `openapi/`
- 2026-08-02 05:45 UTC | Done: Rung 5 mini-openapi golden — swagger.json dual-format (basePath `/api` tags), summary-first OpenAPI labels (List notes vs GET Notes twins), operationId/summary/evidence + flowOrder floors, collapse both spec modules | Next: pin real OpenAPI OSS repo | Learned: path-humanize collapses list+detail to the same label; OpenAPI `summary` is the contract’s product vocabulary and should win when present; Swagger2 `basePath` must be golden-locked separately from OAS3 YAML so JSON parsing cannot silently regress
- 2026-08-02 05:50 UTC | Done: Rung 5 pin+golden — `swagger-api/swagger-petstore` @ `8f0dd2869878` gitignored; 19 OpenAPI ops nested/collapsed under HTTP API with summary labels + operationIds + evidence; flowOrder HTTP API; openapi.yaml module collapsed | Next: Petstore North-star polish (summary periods, CI chrome, info.title) | Learned: classic Petstore keeps the contract at `src/main/resources/openapi.yaml` which already matches filename conventions (no `specs/` ignore fight); Java sources are invisible to current extractors so the map is honestly API-only — polish is label/chrome, not missing Nest dual-source
- 2026-08-02 05:45 UTC | Done: Rung 5 Petstore polish — strip summary trailing periods; ignore `CI/` so release scripts never enter the graph; prefer cleaned OpenAPI info.title (`Swagger Petstore - OpenAPI 3.0` → `Swagger Petstore`) when README is sample boilerplate; golden-lock | Next: twin-chrome check + Rung 5 lock | Learned: summary preference already eliminates Petstore list/detail label collisions (no duplicate canvas labels); README "… Sample" must lose to the contract title or the brand stays docs chrome; collapsing CI modules is weaker than ignoring the directory — zero nodes beat quiet nodes
- 2026-08-02 05:50 UTC | Done: Rung 5 locked — golden unique summary labels (mini-openapi + Petstore); tempfile Express+OpenAPI dual-source nests all routes under one Notes API; North-star overview HTTP API only; promote GraphQL as Rung 6 | Next: GraphQL extractor sketch + mini-graphql fixture | Learned: Petstore pin cannot prove Nest/Express dual-source (Java+contract only) — a tempfile with both extractors is the right lock; uniqueness of canvas labels is the twin-chrome regression guard, not path equality
- 2026-08-02 05:55 UTC | Done: Rung 6 prep — `src/extractors/graphql.ts` SDL Query/Mutation/Subscription fields + gql/graphql tagged documents; path-role/isFileModule for `.graphql`/`.gql`; humanize Query/Mutation labels; `verification/mini-graphql` Notes API smoke + Extractors roster `graphql` | Next: thicken mini-graphql golden then pin real GraphQL OSS repo | Learned: treat GraphQL ops as `route` nodes so existing API nest/collapse/flowOrder apply; named document ops (`ListNotes`) and SDL fields (`notes`) are both product surface — expect label overlap until a later uniqueness polish; isFileModule must admit `.graphql` or schema never gets path-role
- 2026-08-02 06:00 UTC | Done: Rung 6 thicken mini-graphql — named gql docs drop Query/Mutation prefix (`Create note` vs SDL `Mutation Create note`); store first selected field separately from operationName; evidence floors `field:` + op name; collapse operations.ts + schema.graphql; golden unique 9 labels + nest schema(5)+document(4) | Next: pin real GraphQL OSS repo + golden-lock | Learned: treating operationName as `field` erased the schema selection and guaranteed twin chrome after humanize; OpenAPI-summary-style document labels (no kind prefix) are the GraphQL uniqueness fix
- 2026-08-02 05:57 UTC | Done: Rung 6 pin+golden — `zth/graphql-client-example-server` @ `814f2ba` gitignored; 15 SDL ops (query/mutation/subscription) nested/collapsed under HTTP API; unique humanized labels; schema.graphql chrome quiet; evidence `field:` | Next: polish North-star overview (CLI/Schema/Data compete with API) then lock Rung 6 | Learned: SWAPI uses `schema { query: Root }` so `type Query` extractors miss it — pick a Query/Mutation SDL pin first, leave Root-alias for seed; npm `bin` + `src/db.ts` + `src/schema.ts` correctly invent CLI/Data/Schema systems that a GraphQL-only cold-read must quiet later
- 2026-08-02 06:01 UTC | Done: Rung 6 locked — `quietNonCompilerProductChrome` folds bare `schema.ts` Schema contract → HTTP API; collapses empty bin CLI + table-less Data; flowOrder skips collapsed; golden-lock North-star overview HTTP API only; promote Docker as Rung 7 | Next: Rung 7 Docker/Compose extractor + mini-docker fixture | Learned: path-role invention is correct for Underdelta’s compiler stack but steals product cold-reads — gate chrome quieting on absence of compile/extractors/graph/viewer so self-map stays rich while GraphQL example servers read as one HTTP API
- 2026-08-02 06:05 UTC | Done: Rung 7 prep — `src/extractors/docker.ts` Compose services + Dockerfile App image; Deploy path-role; mini-docker Containers smoke (API/Web/DB + App image nested/collapsed); roster `docker`; quiet Dockerfile-only Deploy beside API/UI/Data (Petstore/RealWorld) | Next: pin real Docker/Compose OSS repo + golden-lock | Learned: bare `\bdocker\b` README heading matches "To run (via Docker)" and invents Deploy chrome — require containers/docker-compose phrasing; Dockerfile-only Deploy must collapse on API-led maps or every RealWorld pin grows a packaging lane

---

## Self-renewing backlog (mandatory)

At the **start** of every tick, after reading this file:

1. Count unchecked items under **In progress / next**.
2. If fewer than **3**, move/create items from **Seed backlog** (or invent new ones aimed at the End goal) until there are ≥ 3.
3. Rewrite **Next focus** as one concrete chunk:  
   `This work is done (X). Now do Y so we can reach Z.`
4. Never end a tick with an empty Next focus while Definition of “still unfinished” still applies.

When inventing work, ask only:

> What single change most helps the North star non-coder finally understand what they built — moving the **lowest unfinished Capability ladder rung** forward, or making an existing map meaningfully clearer and more beautiful? (If the last two ticks were polish-only and the rung has an obvious next step, pick the rung.)

---

## Tick protocol

1. **Concurrency check (mandatory)**  
   If a previous Autopilot tick / agent turn is still executing (build, verify, commit, push, or long edit in flight), **do not disturb it**. Skip this tick entirely. Try again on the next 15-minute iteration.

2. **Health check (mandatory — reruns can cancel in-flight ticks)**  
   A push on this branch restarts the loop, so the previous tick may have been cancelled mid-work (e.g. code pushed but plan not updated, or work half-landed). Before taking new work: working tree must be clean and synced with origin, `npm run build` and `npm run verify` must pass, and the Status board must match what actually landed on the branch. Reconcile and fix any of that **first**, as its own small step.

3. Read this file. Refill backlog if needed. Take **exactly one** next increment from Next focus.

4. Implement that increment only (product progress > merge hygiene).

5. Run verification:
   - `npm run build` (must pass)
   - `npm run verify` (must pass)
   - confirm default product diagram still excludes verification/tests/fixtures and gitignored real-repo clones

6. Update this markdown:
   - check off completed work
   - ensure **In progress / next** still has ≥ 3 items
   - rewrite **Next focus**
   - append one **Learning log** line

7. Commit + push on `cursor/visual-system-browser-7649` only; update the existing draft PR.  
   Prefer **one commit** containing both the feature and this plan update, so a cancellation cannot split them.

8. Stop the tick. Do not start a second major feature in the same tick.  
   (Stopping the tick ≠ being done with the product. The next Autopilot ping should continue.)

---

## Priority order

1. Keep verification green and isolated (`verification/`, `npm run verify`, gitignored real-repo clones)
2. **Standing guarantee** — self-map + mini-stack always demo-ready; fix any visual/correctness regression there immediately
3. **Capability ladder rungs** (real-repo generalization → Next.js → Python servers → self-renewal)
4. **Visual quality of the default browser** — legibility, hierarchy, beauty for the North star non-coder (equal partner to rungs; just don’t stall a rung with polish-only streaks)
5. Semantic projection + product systems/flows (as needed by the current rung)
6. Extractor improvements as needed for the current rung’s completeness/correctness
7. README only when commands/behavior changed
8. Merge conflicts / CI failures caused by our changes (hygiene only)

---

## Out of scope

- Any branch other than `cursor/visual-system-browser-7649`
- `master` commits / checkouts
- New PRs
- Graphify fork
- Sales funnels / marketing pages
- Random refactors or redesign churn with no legibility gain
- Polish-only **streaks** (3+ consecutive ticks) while the current ladder rung has an obvious next step — polish itself is high value; alternate, don’t stall
- Vendoring third-party repo code into this repository (clones stay gitignored)
- Putting tests/fixtures into the default visualization
- Stopping because the PR is draft/mergeable/no CI/no comments
- Waiting for the human to write a fuller roadmap
- Declaring the mission complete — the ladder self-renews (rung 4+)

---

## Copy-paste Autopilot prompt

Paste this into the cloud agent, then enable Autopilot at **15 minutes**:

```text
AUTOPILOT MODE — Underdelta overnight build (15 min ticks)

CANONICAL PLAN FILE (read + update every tick):
`docs/AUTOPILOT_PLAN.md`

MISSION:
Build the product toward a full readable architecture diagram. Do NOT idle just because the PR is mergeable, draft, has no CI, or has no review comments. Cursor merge-ready autopilot guidance is secondary hygiene only.

HARD LOCKS (never violate):
1) Work ONLY on branch `cursor/visual-system-browser-7649`. Never checkout master. Never create another branch. Never open a second PR.
2) Keep updating the existing draft PR for this branch only.
3) Commit + push in small chunks after each meaningful unit of work.
4) Default product visualization MUST NOT include test/fixture/verification systems.
5) Do not invent sales funnels, marketing pages, or unrelated features.
6) Prefer semantic product architecture over raw function/module hairballs.
7) CONCURRENCY: If a previous tick is still executing, DO NOT DISTURB IT. Skip and try next 15m iteration.
8) NEVER IDLE while docs/AUTOPILOT_PLAN.md says the end goal is unfinished. If the checklist is empty, refill from Seed backlog / invent the next diagram-improving chunk.
9) Keep ≥ 3 items in “In progress / next” at all times.

PRODUCT GOAL:
Climb the Capability ladder in the plan file: (1) prove the compiler on a REAL Node/Express/React repo the loop did not write (pinned SHA, gitignored clone, golden-locked in verify), (2) Next.js app-router semantics, (3) Python servers (FastAPI/Django/SQLAlchemy/Celery), (4) self-renew from the README roadmap. Evidence-backed, semantically projected, flow-readable. Capability and polish are TWIN ENGINES: the browser is the product and must stay beautiful and legible for non-coders; the ladder only forbids polish-only stalls. The Underdelta self-map and mini-stack must ALWAYS stay demo-ready.

EACH 15-MINUTE TICK (one chunk):
A) Concurrency check. If busy, skip.
A2) Health check: a push-triggered rerun may have cancelled the previous tick mid-work. Ensure clean synced tree, green build+verify, and plan matches what landed. Reconcile first.
B) Read `docs/AUTOPILOT_PLAN.md`. Refill backlog if < 3 open items. Pick ONE Next focus increment (lowest unfinished ladder rung).
C) Implement it (product progress first).
D) Run VERIFICATION.
E) If verification fails: fix before moving on.
F) Update `docs/AUTOPILOT_PLAN.md`:
   - check off completed work
   - keep ≥ 3 open next items
   - rewrite Next focus (“This work is done, but now I want to do X so we can reach Y”)
   - append one Learning log line
G) Commit, push to `cursor/visual-system-browser-7649`, update existing PR.
H) Stop that tick only (not the mission). Wait for next Autopilot ping.

PRIORITY ORDER:
1) Keep verification green/isolated
2) Standing guarantee: self-map + mini-stack always demo-ready
3) Capability ladder rungs (real repo → Next.js → Python → self-renew)
4) Visual quality/legibility of the default browser (equal partner to rungs; no polish-only stalls)
5) Semantic systems/flows as needed by the current rung
6) Extractors as needed by the current rung
7) README only for behavior changes
8) Merge/CI hygiene only if blocking

VERIFICATION:
- `npm run build` must pass
- `npm run verify` must pass
- Default scan must not include verification/tests/fixtures

OUT OF SCOPE:
- New branches / new PRs / master
- Graphify fork / sales / random refactors
- Stopping because PR looks “done” while the architecture diagram goal is unfinished
- Interrupting an in-flight previous tick

DONE LOOKS LIKE (morning):
- Many commits on `cursor/visual-system-browser-7649`
- Plan file shows a long Done / Next / Learning trail (backlog never starved)
- verify green
- Underdelta produces a legible, golden-locked map of at least one REAL repo it did not write
- Ladder rungs visibly climbed (Next.js / Python progress underway)
- Self-map + mini-stack still stunning when the human opens them first thing
```

---

## Human notes

### Loop setup reminder

This markdown steers **what** to build. **Autopilot/Automation in Cursor** must still be ON to wake the agent every 15 minutes. If no ping arrives, the agent will not continue by itself.

### Morning checklist

```bash
git fetch origin
git checkout cursor/visual-system-browser-7649
git pull origin cursor/visual-system-browser-7649
npm ci
npm run build
npm run verify
node dist/cli.js scan .
# open .underdelta/index.html
# optional: node dist/cli.js scan verification/mini-stack -o .underdelta-verify
```

Skim Status board + Learning log before reviewing the PR.

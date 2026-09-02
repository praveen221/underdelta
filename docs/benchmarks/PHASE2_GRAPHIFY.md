# Phase 2 bake-off — Underdelta vs Graphify vs grep

Generated 2026-09-02T13:00:42.779Z. 27 questions across 11 pinned repos from `docs/V0_BUILD_CONTEXT.md`.

Gold answers are source-audited. Graphify ran local AST extract (`graphify update --no-cluster`, no LLM). Underdelta used `query writes` / `query impact` / `query unknown` plus the compiled graph for list questions.

## Scorecard (semantic questions)

| Arm | Exact correct | Mean recall | Invented HTTP claims |
|-----|---------------|-------------|----------------------|
| Baseline (grep/files) | 6/25 | 32% | 37 |
| **Underdelta** | **20/25** | **70%** | **0** |
| Graphify | 4/25 | 18% | 0 |

## Per question

| ID | Repo | Question | Gold | B | U | G | U missed | G missed | Invented |
|----|------|----------|------|---|---|---|---------|---------|----------|
| EX1 | node-express-realworld | Which HTTP endpoints write the Article table? | POST /articles, PUT /articles/:slug, DELETE /articles/:slug, POST /articles/:slug/favorite | ✅ | ✅ | ❌ |  | POST /articles, PUT /articles/:slug, DELETE /articles/:slug |  |
| EX2 | node-express-realworld | Which HTTP endpoints write the Comment table? | POST /articles/:slug/comments, DELETE /articles/:slug/comments/:id | ✅ | ✅ | ❌ |  | POST /articles/:slug/comments, DELETE /articles/:slug/comments/:id |  |
| EX3 | node-express-realworld | If article.service.ts changes, which HTTP endpoints are affected? | GET /articles, GET /articles/feed, GET /articles/:slug, GET /articles/:slug/comments | ✅ | ✅ | ❌ |  | GET /articles, GET /articles/feed, GET /articles/:slug |  |
| EX4 | node-express-realworld | What did the tool refuse to invent on this Express/Prisma app? | {"unsupported":0,"unresolved":0} | ❌ | ✅ | ❌ |  | structured unknown |  |
| EX5 | node-express-realworld | Who calls getArticle()? | src/app/routes/article/article.controller.ts | ❌ | ✅ | ❌ |  | src/app/routes/article/article.controller.ts |  |
| NX1 | nextjs-saas-starter | What App Router HTTP API endpoints exist? | GET /api/user, GET /api/team, GET /api/stripe/checkout, POST /api/stripe/webhook | ✅ | ✅ | ❌ |  | GET /api/user, GET /api/team, GET /api/stripe/checkout |  |
| NX2 | nextjs-saas-starter | Which product surfaces write the users table? | app/(login)/actions.ts | ❌ | ❌ | ❌ | app/(login)/actions.ts | app/(login)/actions.ts |  |
| NX3 | nextjs-saas-starter | Does the tool admit Drizzle db.insert/select are unresolved? | {"unsupported":0,"unresolvedMin":1} | ❌ | ✅ | ❌ |  | structured unknown |  |
| NX4 | nextjs-saas-starter | If lib/payments/stripe.ts changes, which endpoints are affected? | POST /api/stripe/webhook, GET /api/stripe/checkout | ❌ | ❌ | ❌ | GET /api/stripe/checkout | POST /api/stripe/webhook, GET /api/stripe/checkout |  |
| FA1 | fastapi-realworld | What HTTP endpoints exist for articles? | GET /api/articles, GET /api/articles/feed, GET /api/articles/{slug}, POST /api/articles | ❌ | ✅ | ❌ |  | GET /api/articles, GET /api/articles/feed, GET /api/articles/{slug} |  |
| FA2 | fastapi-realworld | Where is the users table inserted? | app/db/queries/sql/users.sql | ❌ | ❌ | ❌ | app/db/queries/sql/users.sql | app/db/queries/sql/users.sql |  |
| FA3 | fastapi-realworld | If app/api/routes/articles/articles_resource.py changes, which endpoints are affected? | GET /api/articles, POST /api/articles, GET /api/articles/{slug}, PUT /api/articles/{slug} | ❌ | ✅ | ❌ |  | GET /api/articles, POST /api/articles, GET /api/articles/{slug} | B:GET /{slug}; B:PUT /{slug}; B:DELETE /{slug} |
| HS1 | hackathon-starter | What Mongo collections exist? | User, Session | ❌ | ✅ | ❌ |  | User, Session |  |
| HS2 | hackathon-starter | Which HTTP endpoints create or persist a User? | POST /signup, POST /login, POST /account/profile | ❌ | ❌ | ❌ | POST /signup, POST /login, POST /account/profile | POST /signup, POST /login, POST /account/profile | B:GET /login; B:GET /login/verify/:token; B:GET /login/2fa |
| HS3 | hackathon-starter | If controllers/user.js changes, which user-account endpoints are affected? | POST /signup, GET /login, POST /login, GET /account | ❌ | ❌ | ❌ | POST /signup, GET /login, POST /login | POST /signup, GET /login, POST /login | B:GET /login/verify/:token; B:GET /login/2fa; B:POST /login/2fa |
| PS1 | swagger-petstore | What pet HTTP operations does the OpenAPI contract declare? | POST /pet, PUT /pet, GET /pet/{petId}, DELETE /pet/{petId} | ❌ | ✅ | ❌ |  | POST /pet, PUT /pet, GET /pet/{petId} |  |
| PS2 | swagger-petstore | What store operations exist? | GET /store/inventory, POST /store/order, GET /store/order/{orderId}, DELETE /store/order/{orderId} | ❌ | ✅ | ❌ |  | GET /store/inventory, POST /store/order, GET /store/order/{orderId} |  |
| GQ1 | graphql-client-example-server | What GraphQL mutations exist for todos? | MUTATION addTodoItem, MUTATION addTodoSimple, MUTATION deleteTodoItem, MUTATION deleteTodoSimple | ❌ | ✅ | ❌ |  | MUTATION addTodoItem, MUTATION addTodoSimple, MUTATION deleteTodoItem |  |
| GQ2 | graphql-client-example-server | Is there a Query.todos field? | todos | ❌ | ✅ | ❌ |  | todos |  |
| VO1 | example-voting-app | What deploy units / services make up the voting app? | vote, worker, result, redis | ❌ | ✅ | ❌ |  | vote, worker, redis |  |
| VO2 | example-voting-app | Is Redis a runtime dependency of the stack? | redis | ✅ | ✅ | ✅ |  |  |  |
| TF1 | terraform-aws-vpc | Does the module model AWS VPC as a deploy unit? | vpc | ❌ | ✅ | ✅ |  |  |  |
| BQ1 | microservices-demo | Which microservices does the k8s demo deploy? | frontend, cartservice, checkoutservice, productcatalogservice | ❌ | ✅ | ❌ |  | cartservice, currencyservice, paymentservice |  |
| BQ2 | microservices-demo | Does the tool refuse to invent Go/Java HTTP endpoints? | {"unsupportedMin":0,"unresolvedMin":0,"noFakeGoRoutes":true} | ❌ | ✅ | ❌ |  | structured unknown |  |
| HE1 | helm-examples | What Helm chart is in this repo? | hello world | ✅ | ✅ | ✅ |  |  |  |
| PO1 | podinfo | Does the Go app expose /healthz and /readyz? | GET /healthz, GET /readyz | ❌ | ✅ | ❌ |  | GET /healthz, GET /readyz |  |
| PO2 | podinfo | Is podinfo packaged as a Helm chart and kustomize overlay? | chart, kustomize | ❌ | ✅ | ✅ |  |  |  |

## How to read this

- **Exact correct** means every gold item was present and no extra HTTP endpoints were claimed.
- Graphify returns a **symbol neighborhood** (files, functions, imports). Useful for navigation; it almost never lists `POST /articles` as a typed product fact. Invented-route rate is ~0 because it does not claim routes.
- Underdelta wins when the stack is in a deep/partial adapter (Express+Prisma, OpenAPI, GraphQL SDL, Compose/k8s/Helm deploy units).
- Underdelta **misses** where coverage is labeled partial/none: Drizzle `db.insert` (Next.js), Mongoose `.save()` (hackathon-starter), FastAPI raw SQL files, Next.js checkout route not reached from `stripe.ts`.
- Baseline grep can recover RealWorld impact when the controller sits next to the service (EX3). It also **invents** extra `/login/2fa` routes on hackathon-starter. Honesty is the gap, not string search.

## What this means we should do next

Do **not** add adapters for popularity. The misses are depth holes in stacks we already claim:

1. **Mongoose writes** — bind `user.save()` / `new User()` to collection writes so `query writes User` and impact of `controllers/user.js` work (HS2, HS3). Biggest RealWorld-shaped miss outside Prisma.
2. **Drizzle (or generic SQL tagged template) writes** — Next.js SaaS is the coverage pin and today `query writes User` is empty while `query unknown` correctly lists unresolved `db.insert` (NX2, NX3). Either bind Drizzle or keep it detect-only and stop implying Data access is queryable.
3. **Next impact through payments** — `stripe.ts` → `GET /api/stripe/checkout` (NX4). Same reachability family as inline Express handlers.
4. **FastAPI SQL files** — `INSERT INTO users` in `.sql` is not a writer (FA2). Optional; Python impact on route files already works (FA3).
5. Keep Graphify in the harness. It is the navigation baseline, not the product competitor. Re-run `npm run bench:phase2` after any of (1)–(3).

Do **not** start MCP, another viewer loop, or Go HTTP adapters on the strength of this spreadsheet.

## Reproduce

```bash
npm run build
# clone pins into .underdelta-real/ (gitignored)
node dist/cli.js scan .underdelta-real/<repo>
graphify update .underdelta-real/<repo> --force --no-cluster
npm run bench:phase2
```

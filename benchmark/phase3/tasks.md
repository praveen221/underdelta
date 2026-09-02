# Tasks — repo /tmp/p3/dub (Next.js App Router + Prisma monorepo)

Endpoint format: `METHOD /api/...` using the App Router directory path under `apps/web/app/**/api/`, with route groups like `(ee)` removed and dynamic segments kept as `[param]`. Example: `DELETE /api/links/[linkId]`, `POST /api/cron/links/delete`.

"Prisma models written directly in a file" means `prisma.<model>.create|createMany|update|updateMany|upsert|delete|deleteMany` or `tx.<model>.…` inside a `$transaction` in that file. Report model names in PascalCase (Link, Project, Domain, Tag, Webhook, ...).

For impact tasks, "affected endpoints" means HTTP route handlers that can reach the changed file's exported functions through imports/calls (any depth), including cron/webhook routes under `(ee)`.

T1 impact: If `apps/web/lib/api/links/delete-link.ts` changes, list every affected endpoint and every Prisma model written directly in that file.
T2 impact: Same for `apps/web/lib/api/domains/verify-domain.ts`.
T3 impact: Same for `apps/web/lib/api/tags/combine-tag-ids.ts`.
T4 impact: Same for `apps/web/lib/api/links/bulk-delete-links.ts`.
T5 impact: Same for `apps/web/lib/api/domains/mark-domain-deleted.ts`.
T6 impact: Same for `apps/web/lib/api/links/archive-link.ts`.
T7 writes: Which HTTP endpoints can (directly or through called code) write the Prisma model `Tag`?
T8 writes: Which HTTP endpoints can (directly or through called code) write the Prisma model `Webhook`?
T9 nav: Which files import a symbol exported by `apps/web/lib/api/links/get-link-or-throw.ts`? List repo-relative file paths.
T10 nav: Which files import a symbol exported by `apps/web/lib/api/tags/combine-tag-ids.ts`? List repo-relative file paths.

Rules:
- Only list endpoints/models/files you have evidence for. If you cannot determine something, leave the list shorter and explain in `unknown_note`. Do not guess.
- Do not read anything under /tmp/p3 other than the `dub/` repo. Do not modify the repo.
- Keep total tool calls under ~60. Answer all 10 tasks.

Output: write ONE JSON file to the path given in your instructions, exactly:
{
  "arm": "A"|"B", "run": <n>,
  "tasks": [ { "id": "T1", "endpoints": [...], "models": [...], "files": [...], "unknown_note": "..." }, ... T10 ],
  "tool_calls_total": <int>, "files_read_total": <int>, "commands_used": ["..."], "notes": "..."
}
Then reply with just: DONE <path>

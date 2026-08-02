# Contributing to Underdelta

Thanks for helping improve Underdelta. This project is intentionally small and
evidence-backed: every visual claim should map to source.

## Ground rules

1. Prefer small, reviewable PRs.
2. Do not invent framework semantics. Mark uncertainty as `observed`, `derived`,
   or `inferred` consistently with the existing contract.
3. Keep default scans focused on product code — generated output, dependencies,
   fixtures, and conventional test/spec paths stay out of the map unless there
   is a clear product reason to include them.
4. Match existing TypeScript style and module layout under `src/`.

## Development setup

Requirements: **Node.js 22+**.

```bash
git clone https://github.com/praveen221/underdelta.git
cd underdelta
npm install
npm run typecheck
npm run build
npm run verify
```

Useful commands:

| Command | Purpose |
|---------|---------|
| `npm run dev` | Run the CLI via `tsx` without a prior build |
| `npm run typecheck` | Typecheck without emitting |
| `npm run build` | Compile to `dist/` |
| `npm run verify` | Fixture + golden-lock verification suite |
| `./scripts/run.sh` | Map Underdelta itself (or another path) |

## Pull request process

1. Open a branch off `master` (direct pushes to `master` are restricted for
   non-admins; maintainers may bypass for hotfixes).
2. Make your change with a clear commit message.
3. Ensure `npm run typecheck` and `npm run build` pass. Prefer `npm run verify`
   for extractor or contract changes.
4. Fill out the PR template: what changed, why, and how you tested it.
5. Resolve review comments before merge.

## Issue reports

Use the issue templates when possible:

- **Bug report** — unexpected scan/output behavior with a minimal repro
- **Feature request** — new stack support, extractor coverage, or viewer UX

Security issues: see [SECURITY.md](./SECURITY.md). Do not file them publicly.

## Code of conduct

Participation is governed by our [Code of Conduct](./CODE_OF_CONDUCT.md).

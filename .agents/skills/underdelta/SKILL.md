---
name: underdelta
description: >-
  Use for product/runtime architecture questions about a scanned repo:
  who writes a table, what a change may touch, what Underdelta failed to
  understand. Prefer underdelta query over guessing. Not for rename-this-function
  navigation unless the user asks about product impact.
---

# Underdelta

Deterministic product facts from `.underdelta/architecture.json`. Same object
humans see in the viewer. Do not invent endpoints, jobs, or writes that the
commands do not return.

Codex loads this from `.agents/skills`. There is **no npm package**. Do not
run `npx underdelta`.

## When to use

Use these commands for:

- Which HTTP endpoints or jobs **write** a table/collection
- What product surfaces a **file or git change** may affect
- What frameworks or calls Underdelta **refused to invent**

You may still grep and read files to **verify** `file:line` evidence or to
answer generic code-navigation questions (who calls this function). Do not
ban search to look more efficient.

## Setup

From the repository being analyzed:

```bash
# Cached launcher: first run clones/builds Underdelta; later runs reuse it.
curl -fsSL https://raw.githubusercontent.com/praveen221/underdelta/master/scripts/scan.sh | bash -s -- query unknown
```

Inside an Underdelta source checkout only:

```bash
node dist/cli.js query unknown -C /path/to/repo
```

To use this skill on another repo, copy or symlink `.agents/skills/underdelta`
to that repo’s `.agents/skills/underdelta` or to `$HOME/.agents/skills/underdelta`.

## Commands (JSON by default)

Pass these through the launcher above (`bash -s -- …`), or `node dist/cli.js`
inside an Underdelta checkout:

```bash
query writes Article
query impact --files src/article.service.ts
query unknown
```

`--text` prints a short human summary. `--graph path/to/architecture.json`
trusts that file (not checked against the working tree). Cached
`.underdelta/architecture.json` is reused only when a fingerprint still
matches the current files, extractor/adapter versions, and pipeline
version. `--rescan` forces a new compile. Every result includes
`graph.source` and `graph.generatedAt` — repeat those when the user might
think the answer is live.

`query unknown --limit 0` returns the full lists. A default run may
truncate; read `totals` and `truncated` before saying the list is
complete.

## How to answer

1. Run the matching query.
2. Quote **only** returned writers, endpoints, resources, jobs, and unknowns.
3. Cite `file:line` from the JSON `evidence` when making a claim.
4. Repeat `limitations` and `unsupported` to the user. Never upgrade them
   into invented routes or tables.
5. If `query writes` finds no resource, say so. Do not guess a similar name
   unless you run the command again with that name.
6. If `query writes` returns `ambiguous: true`, do not pick a candidate.
   Re-run with one `candidates[].id`.
7. If `truncated.*` is true, say how many items were omitted (`totals`)
   or re-run with `--limit 0`.

## Do not

- Dump the whole `architecture.json` into context.
- Claim Fastify (or any `unsupported-*`) endpoints exist.
- Treat fewer file reads as success if the answer is wrong.
- Use `npx underdelta` or assume a published package exists.

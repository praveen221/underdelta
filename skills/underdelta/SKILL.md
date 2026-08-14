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

## When to use

Use these commands for:

- Which HTTP endpoints or jobs **write** a table/collection
- What product surfaces a **file or git change** may affect
- What frameworks or calls Underdelta **refused to invent**

You may still grep and read files to **verify** `file:line` evidence or to
answer generic code-navigation questions (who calls this function). Do not
ban search to look more efficient.

## Setup

From the repository root:

```bash
# If .underdelta/architecture.json is missing or stale:
npx --yes underdelta scan . -o .underdelta
# or from this source tree:
node dist/cli.js scan . -o .underdelta
```

Prefer a local build when working inside the Underdelta repo.

## Commands (JSON by default)

```bash
node dist/cli.js query writes Article -C /path/to/repo
node dist/cli.js query impact -C /path/to/repo --files src/article.service.ts
node dist/cli.js query unknown -C /path/to/repo
```

`--text` prints a short human summary. `--graph path/to/architecture.json`
skips rescan. `--rescan` forces a new compile.

## How to answer

1. Run the matching query.
2. Quote **only** returned writers, endpoints, resources, jobs, and unknowns.
3. Cite `file:line` from the JSON `evidence` when making a claim.
4. Repeat `limitations` and `unsupported` to the user. Never upgrade them
   into invented routes or tables.
5. If `query writes` finds no resource, say so. Do not guess a similar name
   unless you run the command again with that name.

## Do not

- Dump the whole `architecture.json` into context.
- Claim Fastify (or any `unsupported-*`) endpoints exist.
- Treat fewer file reads as success if the answer is wrong.

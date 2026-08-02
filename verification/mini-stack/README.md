# Mini commerce stack

Isolated verification fixture for Underdelta. Scanned on its own by
`npm run verify`; ignored by a normal product scan of the repo root.

## Storefront UI

Customer-facing React surface for browsing and checkout.

## Checkout API

HTTP routes that accept checkout and health requests.

## Order pipeline

Multi-step checkout pipeline after an order is accepted.

## Fulfillment workers

Queue workers that consume fulfillment jobs.

## Reconciliation jobs

Scheduled reconciliation cron for payments and orders.

## Catalog data

Prisma models and SQL migrations for orders and payments.

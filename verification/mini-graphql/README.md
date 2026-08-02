# Mini GraphQL notes

Isolated GraphQL verification fixture for Underdelta. Scanned on its own by
`npm run verify`; ignored by a normal product scan of the repo root.

## Notes API

GraphQL surface declared two ways:

- `schema.graphql` — SDL `type Query` / `type Mutation` fields
- `operations.ts` — `gql` tagged query/mutation documents

# Mini OpenAPI notes

Isolated OpenAPI verification fixture for Underdelta. Scanned on its own by
`npm run verify`; ignored by a normal product scan of the repo root.

## Notes API

HTTP operations declared in dual formats:

- `openapi.yaml` — OpenAPI 3 notes list/create/get/delete
- `swagger.json` — Swagger 2.0 tags list/create under `/api` basePath

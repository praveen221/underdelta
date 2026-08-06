# Mini Heart

Isolated Express + Mongoose fixture that mirrors Shree Heart README structure
poison: numbered Layer / file-glob headings must **not** become Product Flow
API/Data labels. Also rejects OpenAPI/Swagger docs chrome ("API Documentation").
Scanned on its own by `npm run verify`.

## Project Structure

### 1. Route Layer (.route.ts)

HTTP route entrypoints under `src/`.

### 2. Controller Layer (.controller.ts)

Request handlers.

### 3. Service Layer (.service.ts)

Domain services.

### 4. Repository Layer (.repository.ts)

Persistence adapters.

### 5. Data Access Layer (models/)

Mongoose models under `src/db/`.

## API Documentation

Swagger/OpenAPI docs chrome — must not rename the HTTP API hub.
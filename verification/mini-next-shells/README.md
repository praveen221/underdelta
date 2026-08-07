# Mini Next — FE shells fixture

Tiny Next App Router app with **route groups + middleware** so Underdelta can
project Public → Auth → Protected (see `docs/loopplans/FE_SHELLS_07082026.md`).

## Sections

### Public shell

Unauthenticated marketing: Home (`/`) and Pricing (`/pricing`) under `(public)`.

### Auth gate

Sign-in under `(auth)/login`.

### Protected shell

Dashboard and Settings under `(app)`, matched by root `middleware.ts`.
Dashboard imports a page-owned `DashboardPanel` plus presentational Card/Button
so Intermediate shell focus can prove routes-only (no featureRoot / leaf chrome).

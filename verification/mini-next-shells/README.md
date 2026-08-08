# Mini Next — FE shells fixture

Tiny Next App Router app with **route groups + middleware** so Underdelta can
project Public → Auth → Protected (see `docs/loopplans/FE_SHELLS_07082026.md`).

## Sections

### Public shell

Unauthenticated marketing: Home (`/`) and Pricing (`/pricing`) under `(public)`.

### Auth gate

Sign-in under `(auth)/login`.

### Protected shell

Dashboard, Settings, Onboarding, and Profile under `(app)`, matched by root
`middleware.ts`. Tool → HTTP API edges cover three Scholar-shaped call paths:

- Dashboard feature root → `apis/listDashboardStats`
- Profile page body → `apis/getProfile` (no separate feature root)
- Onboarding feature root → `useOnboardingSteps` hook → `apis/listOnboardingSteps`

Dashboard also imports presentational Card/Button so Intermediate shell focus
can prove tools+API (no featureRoot / leaf chrome flood).

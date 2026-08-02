# Mini Python notes

Isolated FastAPI + Django verification fixture for Underdelta. Scanned on its
own by `npm run verify`; ignored by a normal product scan of the repo root.

## Notes API

HTTP routes for listing and reading notes — FastAPI decorators plus Django
urlpatterns.

## Scheduled jobs

Celery tasks and beat schedules that keep notes fresh (digest email, stale purge).

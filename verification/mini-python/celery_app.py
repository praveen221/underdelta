"""Celery app + beat schedules for the mini-python notes fixture."""

from celery import Celery
from celery.schedules import crontab

app = Celery("mini_python")

app.conf.beat_schedule = {
    "send-digest-hourly": {
        "task": "tasks.send_digest",
        "schedule": crontab(minute=0),
    },
    "purge-stale-notes": {
        "task": "tasks.purge_stale_notes",
        "schedule": crontab(minute="*/15"),
    },
}

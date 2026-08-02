"""Celery tasks for the mini-python notes fixture."""

from celery import shared_task


@shared_task
def send_digest():
    """Email a digest of recent notes."""
    return {"sent": True}


@shared_task
def purge_stale_notes():
    """Drop notes that aged out of the retention window."""
    return {"purged": 0}

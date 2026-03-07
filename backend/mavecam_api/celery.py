"""
Configuration Celery pour MAVECAM AquaCare.

Celery est utilisé pour les tâches asynchrones :
- Envoi d'emails
- Envoi de notifications push Expo
- Nettoyage périodique des vieilles notifications
"""
from __future__ import annotations

import os
from typing import Final

from celery import Celery
from celery.schedules import crontab

DEFAULT_DJANGO_SETTINGS_MODULE: Final[str] = 'mavecam_api.settings.development'

# Set default Django settings module
os.environ.setdefault('DJANGO_SETTINGS_MODULE', DEFAULT_DJANGO_SETTINGS_MODULE)

# Create Celery app
app = Celery('mavecam_api')

# Load configuration from Django settings (namespace='CELERY')
app.config_from_object('django.conf:settings', namespace='CELERY')

# Auto-discover tasks from all installed apps
app.autodiscover_tasks()


# Celery Beat configuration (periodic tasks)
app.conf.beat_schedule = {
    # Cleanup old notifications (daily at 3 AM)
    'cleanup-old-notifications': {
        'task': 'notifications.tasks.cleanup_old_notifications',
        'schedule': crontab(hour=3, minute=0),
    },

    # Send scheduled notifications (every 5 minutes)
    'send-scheduled-notifications': {
        'task': 'notifications.tasks.send_scheduled_notifications',
        'schedule': crontab(minute='*/5'),
    },

    # Generate daily report drafts (18:30 local time)
    'generate-daily-report-drafts': {
        'task': 'aquaculture.tasks.generate_daily_report_drafts_task',
        'schedule': crontab(hour=18, minute=30),
    },

    # Generate weekly report drafts for previous week (Monday 06:00)
    'generate-weekly-report-drafts': {
        'task': 'aquaculture.tasks.generate_weekly_report_drafts_task',
        'schedule': crontab(day_of_week=1, hour=6, minute=0),
    },

    # Generate monthly report drafts for previous month (1st day 06:30)
    'generate-monthly-report-drafts': {
        'task': 'aquaculture.tasks.generate_monthly_report_drafts_task',
        'schedule': crontab(day_of_month=1, hour=6, minute=30),
    },

    # Cleanup expired JWT blacklisted tokens (daily at 4 AM)
    'cleanup-jwt-blacklist': {
        'task': 'accounts.tasks.cleanup_expired_tokens',
        'schedule': crontab(hour=4, minute=0),
    },
}


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """Debug task pour tester Celery."""
    print(f'Request: {self.request!r}')

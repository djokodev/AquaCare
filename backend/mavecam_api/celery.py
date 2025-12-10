"""
Configuration Celery pour MAVECAM AquaCare.

Celery est utilisé pour les tâches asynchrones :
- Envoi d'emails
- Envoi de notifications push Expo
- Nettoyage périodique des vieilles notifications
"""

import os
from celery import Celery
from celery.schedules import crontab

# Set default Django settings module
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mavecam_api.settings.development')

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
        'task': 'apps.notifications.tasks.cleanup_old_notifications',
        'schedule': crontab(hour=3, minute=0),
    },

    # Send scheduled notifications (every 5 minutes)
    'send-scheduled-notifications': {
        'task': 'apps.notifications.tasks.send_scheduled_notifications',
        'schedule': crontab(minute='*/5'),
    },
}


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """Debug task pour tester Celery."""
    print(f'Request: {self.request!r}')

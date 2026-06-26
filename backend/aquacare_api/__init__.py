"""
AquaCare API - Package principal.
"""

# Import Celery app pour que Django le charge automatiquement
from .celery import app as celery_app

__all__ = ('celery_app',)

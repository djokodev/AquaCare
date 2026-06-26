from __future__ import annotations

# ruff: noqa: F403,F405
from .production import *


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(',') if item.strip()]


# =============================================================================
# STAGING — Étend production.py avec overrides staging
# Utilisé via: DJANGO_SETTINGS_MODULE=aquacare_api.settings.staging
# =============================================================================

# Pas de PgBouncer en staging → connexions directes PostgreSQL
# (CONN_MAX_AGE=0 est requis avec PgBouncer, mais pas ici)
DATABASES['default']['CONN_MAX_AGE'] = 60

ALLOWED_HOSTS = config(
    'DJANGO_ALLOWED_HOSTS',
    default='77.237.241.223,api-staging.aquacare.tech'
)
ALLOWED_HOSTS = _split_csv(ALLOWED_HOSTS)

# CSRF — requis Django 4.0+ pour les requêtes HTTPS (admin, forms)
CSRF_TRUSTED_ORIGINS = [
    "https://api-staging.aquacare.tech",
]

# CORS staging : Expo dev local + domaine staging
CORS_ALLOWED_ORIGINS = [
    "http://localhost:8081",
    "https://api-staging.aquacare.tech",
]

# Logging verbeux en staging pour faciliter le debug
LOGGING['root']['level'] = 'DEBUG'
LOGGING['loggers']['django']['level'] = 'DEBUG'

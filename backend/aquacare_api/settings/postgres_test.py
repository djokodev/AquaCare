"""Profil de tests PostgreSQL avec migrations réelles et dépendances locales."""

from __future__ import annotations

# ruff: noqa: F403,F405
import os

from .test import *  # noqa: E402,F403

MIGRATION_MODULES = {}
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('PGTEST_DB', 'aquacare_db'),
        'USER': os.environ.get('PGTEST_USER', 'aquacare_user'),
        'PASSWORD': os.environ.get('PGTEST_PASSWORD', ''),
        'HOST': os.environ.get('PGTEST_HOST', '127.0.0.1'),
        'PORT': os.environ.get('PGTEST_PORT', '5432'),
        'TEST': {'NAME': os.environ.get('PGTEST_DATABASE_NAME', 'test_aquacare_db')},
    },
}

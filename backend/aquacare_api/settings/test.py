"""
Settings spécifiques pour les tests (pytest + CI/CD)
"""
from __future__ import annotations

# ruff: noqa: F403,F405
import os


def _clear_postgres_env() -> None:
    for variable_name in (
        'POSTGRES_HOST',
        'POSTGRES_DB',
        'POSTGRES_USER',
        'POSTGRES_PASSWORD',
        'POSTGRES_PORT',
    ):
        os.environ.pop(variable_name, None)


# ⚠️ CRITIQUE : Désactiver PostgreSQL AVANT d'importer base.py
_clear_postgres_env()

from .base import *  # noqa: E402

# SECRET_KEY pour tests
SECRET_KEY = 'test-secret-key-for-pytest-only-not-secure-9x8c7v6b5n4m3'

# Hosts pour tests
ALLOWED_HOSTS = ['*']

# ✅ Base de données SQLite en mémoire pour tests rapides
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}

# Cache local en mémoire pour tests.
# Evite toute dépendance Redis (throttling DRF inclus).
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "aquacare-test-cache",
    }
}

# Désactiver les migrations pour accélérer les tests
# (créer les tables directement depuis les modèles)
class DisableMigrations:
    def __contains__(self, item: object) -> bool:
        return True

    def __getitem__(self, item: object) -> None:
        return None

MIGRATION_MODULES = DisableMigrations()

# Password hashers rapides pour tests
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.MD5PasswordHasher',
]

# Désactiver debug toolbar en tests
DEBUG = False

# Email en mémoire pour les tests (évite un SMTP réel)
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
DEFAULT_FROM_EMAIL = 'test@example.com'

# Celery en mode eager pour les tests (évite Redis/broker)
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
CELERY_BROKER_URL = 'memory://'
CELERY_RESULT_BACKEND = 'cache+memory://'

# Logging minimal en tests
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'null': {
            'class': 'logging.NullHandler',
        },
    },
    'root': {
        'handlers': ['null'],
        'level': 'INFO',
    },
}

# Désactiver CORS en tests
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOWED_ORIGINS = []

# Media/Static en mémoire
MEDIA_ROOT = '/tmp/test_media'
STATIC_ROOT = '/tmp/test_static'

# ✅ JWT Configuration pour tests
# Override SIMPLE_JWT pour utiliser le SECRET_KEY défini ci-dessus
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,  # Utiliser le SECRET_KEY de test
    "VERIFYING_KEY": None,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_HEADER_NAME": "HTTP_AUTHORIZATION",
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

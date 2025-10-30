"""
Settings spécifiques pour les tests (pytest + CI/CD)
"""
import os

# ⚠️ CRITIQUE : Désactiver PostgreSQL AVANT d'importer base.py
os.environ.pop('POSTGRES_HOST', None)
os.environ.pop('POSTGRES_DB', None)
os.environ.pop('POSTGRES_USER', None)
os.environ.pop('POSTGRES_PASSWORD', None)
os.environ.pop('POSTGRES_PORT', None)

from .base import *

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

# Désactiver les migrations pour accélérer les tests
# (créer les tables directement depuis les modèles)
class DisableMigrations:
    def __contains__(self, item):
        return True

    def __getitem__(self, item):
        return None

MIGRATION_MODULES = DisableMigrations()

# Password hashers rapides pour tests
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.MD5PasswordHasher',
]

# Désactiver debug toolbar en tests
DEBUG = False

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

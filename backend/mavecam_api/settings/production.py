from __future__ import annotations

# ruff: noqa: F403,F405

from decouple import config

from .base import *


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(',') if item.strip()]

SECRET_KEY = config('DJANGO_SECRET_KEY')
DEBUG = config('DJANGO_DEBUG', default=False, cast=bool)
ALLOWED_HOSTS = config(
    'DJANGO_ALLOWED_HOSTS',
    default='77.237.241.223,aquacare.tech,www.aquacare.tech,api.aquacare.tech'
)
ALLOWED_HOSTS = _split_csv(ALLOWED_HOSTS)

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('POSTGRES_DB'),
        'USER': config('POSTGRES_USER'),
        'PASSWORD': config('POSTGRES_PASSWORD'),
        'HOST': config('POSTGRES_HOST'),  # Points to PgBouncer in docker-compose.prod.yml
        'PORT': config('POSTGRES_PORT'),
        'CONN_MAX_AGE': 60,
        'OPTIONS': {
            'connect_timeout': 10,
        }
    }
}

SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
# Cloudflare termine le SSL — Django reçoit du HTTP en interne
# On indique à Django de faire confiance au header X-Forwarded-Proto de Cloudflare
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
CSRF_TRUSTED_ORIGINS = [
    "https://aquacare.tech",
    "https://www.aquacare.tech",
    "https://api.aquacare.tech",
]
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = config('DJANGO_SECURE_HSTS_SECONDS', default=31536000, cast=int)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_SSL_REDIRECT = False  # Cloudflare gère la redirection HTTP→HTTPS

CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = [
    "http://77.237.241.223",
    "https://aquacare.tech",
    "https://www.aquacare.tech",
    "https://api.aquacare.tech",
]

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'filters': {
        'request_context': {
            '()': 'common.observability.RequestContextFilter',
        },
    },
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style': '{',
        },
        'json': {
            '()': 'common.observability.JsonLogFormatter',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'json',
            'filters': ['request_context'],
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'django.request': {
            'handlers': ['console'],
            'level': 'ERROR',
            'propagate': False,
        },
        'accounts': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'common.requests': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'celery': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

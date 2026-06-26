import os
import sys
from datetime import timedelta
from pathlib import Path
from typing import Final

from . import jazzmin as jazzmin_config


def _env_str(name: str, default: str = "") -> str:
    return os.getenv(name, default)


def _env_int(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


def _env_bool(name: str, default: bool) -> bool:
    raw_value = os.getenv(name, "true" if default else "false").strip().lower()
    return raw_value in {"1", "true", "yes", "on"}


SENTRY_ENVIRONMENT_DEFAULT: Final[str] = "production"

# Build paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Ajouter apps au Python path
sys.path.insert(0, os.path.join(BASE_DIR, "apps"))

from accounts.constants import (  # noqa: E402
    ACCOUNT_FARM_SETUP_THROTTLE_RATE,
    ACCOUNT_LOGIN_GLOBAL_THROTTLE_RATE,
    ACCOUNT_LOGIN_THROTTLE_RATE,
    ACCOUNT_REGISTER_THROTTLE_RATE,
    ACCOUNT_SENSITIVE_ACTION_THROTTLE_RATE,
    ACCOUNT_SIMULATION_THROTTLE_RATE,
    ACCOUNT_TOKEN_THROTTLE_RATE,
)

# Application definition
INSTALLED_APPS = [
    "jazzmin",  # DOIT etre AVANT django.contrib.admin
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third party packages
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "drf_spectacular",
    "django_celery_beat",  # Celery periodic tasks scheduler
    # Local apps
    "accounts",
    "aquaculture",
    "commerce",  # Module commerce
    "notifications",  # Module notifications multi-canal
    "chat",  # Module chat/support utilisateur-administration
    "common",  # Module commun (admin mixins, static CSS)
    "farm_gps",  # Section GPS admin — fermes géolocalisées
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "common.observability.RequestCorrelationMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "accounts.middleware.LoginRateLimitMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "accounts.middleware.UserLanguageMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "accounts.middleware.APIResponseLanguageMiddleware",
]

ROOT_URLCONF = "aquacare_api.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "aquacare_api.wsgi.application"

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

# Static files
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Media files
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Custom user model
AUTH_USER_MODEL = "accounts.User"

SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
SECURE_REFERRER_POLICY = "same-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"

# Django REST Framework
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "common.observability.observability_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "20/minute",
        "user": "100/minute",
        "accounts_login_global": ACCOUNT_LOGIN_GLOBAL_THROTTLE_RATE,
        "accounts_login": ACCOUNT_LOGIN_THROTTLE_RATE,
        "accounts_register": ACCOUNT_REGISTER_THROTTLE_RATE,
        "accounts_sensitive_action": ACCOUNT_SENSITIVE_ACTION_THROTTLE_RATE,
        "accounts_token": ACCOUNT_TOKEN_THROTTLE_RATE,
        "accounts_farm_setup": ACCOUNT_FARM_SETUP_THROTTLE_RATE,
        "accounts_simulation": ACCOUNT_SIMULATION_THROTTLE_RATE,
        "chat_message": "10/minute",
        "commerce_simulation": "20/hour",
        "commerce_suggestions": "30/hour",
        "commerce_delivery_preview": "60/hour",
        "notifications_bulk_mutation": "20/hour",
        "notifications_push_token": "30/hour",
        "aquaculture_sync": "30/hour",
        "aquaculture_report_action": "20/hour",
        "aquaculture_report_download": "60/hour",
        "aquaculture_sanitary_action": "30/hour",
    },
}

ACCOUNT_TRUSTED_PROXY_IPS = tuple(
    item.strip()
    for item in _env_str(
        'ACCOUNT_TRUSTED_PROXY_IPS',
        '127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16',
    ).split(',')
    if item.strip()
)

# JWT Configuration
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": False,  # Avoid 1 DB write per token refresh
    "ALGORITHM": "HS256",
    "SIGNING_KEY": _env_str('JWT_SECRET_KEY', _env_str('DJANGO_SECRET_KEY')),
    "VERIFYING_KEY": None,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_HEADER_NAME": "HTTP_AUTHORIZATION",
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

# Internationalization
LANGUAGE_CODE = "fr-fr"
TIME_ZONE = "Africa/Douala"

LANGUAGES = [
    ("fr", "Français"),
    ("en", "English"),
]

USE_I18N = True
USE_L10N = True
USE_TZ = True

LOCALE_PATHS = [
    BASE_DIR / 'locale',
]

# Authentication backends
AUTHENTICATION_BACKENDS = [
    "accounts.backends.AquaCareAuthBackend",
    "django.contrib.auth.backends.ModelBackend",
]

# drf-spectacular
SPECTACULAR_SETTINGS = {
    "TITLE": "AquaCare API",
    "DESCRIPTION": "API de gestion aquacole",
    "VERSION": "1.0.0 MVP",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "SORT_OPERATIONS": False,
    "SCHEMA_PATH_PREFIX": "/api/",
    "DEFAULT_GENERATOR_CLASS": "drf_spectacular.generators.SchemaGenerator",
}

# =============================================================================
# CELERY CONFIGURATION
# =============================================================================

# Celery Broker (Redis)
CELERY_BROKER_URL = _env_str('CELERY_BROKER_URL', 'redis://localhost:6379/0')
CELERY_RESULT_BACKEND = _env_str('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0')

# Celery Configuration
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE  # Use Africa/Douala
CELERY_ENABLE_UTC = True

# Celery Task Settings
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60  # 30 minutes max per task
CELERY_TASK_SOFT_TIME_LIMIT = 25 * 60  # 25 minutes soft limit
CELERY_WORKER_PREFETCH_MULTIPLIER = 1  # One task at a time
CELERY_WORKER_MAX_TASKS_PER_CHILD = 1000  # Restart worker after 1000 tasks

# Celery Beat (Periodic Tasks)
CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True  # Suppress Celery 6.0 deprecation warning

# =============================================================================
# CACHE CONFIGURATION
# =============================================================================
# Redis cache — separate DB from broker to avoid interference
# Broker: redis DB 0 (CELERY_BROKER_URL), Cache: redis DB 1
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": _env_str('REDIS_CACHE_URL', 'redis://redis:6379/1'),
    }
}

# Email Configuration — Resend via SMTP
# Dev: EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend (défaut dans development.py)
# Prod: EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_BACKEND = _env_str('EMAIL_BACKEND', 'django.core.mail.backends.smtp.EmailBackend')
EMAIL_HOST = _env_str('EMAIL_HOST', 'smtp.resend.com')
EMAIL_PORT = _env_int('EMAIL_PORT', 587)
EMAIL_USE_TLS = True
EMAIL_HOST_USER = _env_str('EMAIL_HOST_USER', 'resend')
EMAIL_HOST_PASSWORD = _env_str('RESEND_API_KEY')
DEFAULT_FROM_EMAIL = _env_str('DEFAULT_FROM_EMAIL', 'rapports@aquacare.tech')

# Frontend URL (pour les liens dans les emails)
FRONTEND_URL = _env_str('FRONTEND_URL', 'http://localhost:8081')

# Notifications nourrissage : alarmes locales frontend prioritaires
FEEDING_REMINDER_LOCAL_ALARM_ONLY = _env_bool('FEEDING_REMINDER_LOCAL_ALARM_ONLY', True)

# Upload limits
# Photos compressées côté client (1280×720, max 5MB via serializer)
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024  # 10MB max par requête
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024

# =============================================================================
# SENTRY ERROR TRACKING
# Activé uniquement si SENTRY_DSN est défini dans l'environnement.
# En développement local, laisser SENTRY_DSN vide (ou ne pas le définir).
# =============================================================================
_SENTRY_DSN = _env_str('SENTRY_DSN')
if _SENTRY_DSN:
    import sentry_sdk
    from common.observability import get_request_id
    from sentry_sdk.integrations.celery import CeleryIntegration
    from sentry_sdk.integrations.django import DjangoIntegration
    from sentry_sdk.integrations.logging import LoggingIntegration

    def _sentry_before_send(event, hint):
        request_id = get_request_id()
        if request_id != "-":
            event.setdefault("tags", {})["request_id"] = request_id
        return event

    sentry_sdk.init(
        dsn=_SENTRY_DSN,
        # Trace 10% des transactions pour le monitoring de performance
        traces_sample_rate=0.1,
        # Profiling sur 5% des transactions tracées
        profiles_sample_rate=0.05,
        # Identifie l'environnement dans Sentry (staging / production)
        environment=_env_str('DJANGO_ENVIRONMENT', SENTRY_ENVIRONMENT_DEFAULT),
        release=_env_str('SENTRY_RELEASE') or None,
        integrations=[
            DjangoIntegration(),
            CeleryIntegration(monitor_beat_tasks=True),
            LoggingIntegration(level=None, event_level=None),
        ],
        before_send=_sentry_before_send,
        # Ne pas envoyer les données personnelles (IP, email) dans Sentry
        send_default_pii=False,
    )

# =============================================================================
# JAZZMIN ADMIN UI CONFIGURATION
# =============================================================================
JAZZMIN_SETTINGS = jazzmin_config.JAZZMIN_SETTINGS
JAZZMIN_UI_TWEAKS = jazzmin_config.JAZZMIN_UI_TWEAKS

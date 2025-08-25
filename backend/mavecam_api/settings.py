from pathlib import Path
from datetime import timedelta
import sys
import os

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Ajouter le dossier apps au Python path pour les imports
sys.path.insert(0, os.path.join(BASE_DIR, "apps"))


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.1/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = "django-insecure-im6q3xmdo2l%y4b)vo*+hizdj5bckrh(b%7nj54--+cwpp=!pc"

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True

ALLOWED_HOSTS = ['127.0.0.1', 'localhost', '172.20.10.2']


# Application definition

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third party packages
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",  # Pour rotation tokens
    "corsheaders",
    "drf_spectacular",  # Swagger documentation
    # Local apps
    "accounts",
    "apps.aquaculture",  # Phase 2: Module aquaculture
    # 'commerce',     # À ajouter en Phase 3
    # 'support',      # À ajouter en Phase 4
    # 'education',    # À ajouter en Phase 5
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "accounts.middleware.LoginRateLimitMiddleware",  # Rate limiting MAVECAM
    "django.middleware.locale.LocaleMiddleware",  # i18n FR/EN
    "accounts.middleware.UserLanguageMiddleware",  # Langue utilisateur MAVECAM
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "accounts.middleware.APIResponseLanguageMiddleware",  # Header langue API
]

ROOT_URLCONF = "mavecam_api.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
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

WSGI_APPLICATION = "mavecam_api.wsgi.application"


# Database
# https://docs.djangoproject.com/en/5.1/ref/settings/#databases

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}


# Password validation
# https://docs.djangoproject.com/en/5.1/ref/settings/#auth-password-validators

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


STATIC_URL = "static/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


AUTH_USER_MODEL = "accounts.User"

# Django REST Framework Configuration
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
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),  # 15 minutes comme spécifié
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),  # 7 jours comme spécifié
    "ROTATE_REFRESH_TOKENS": True,  # Sécurité: rotation des tokens
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "VERIFYING_KEY": None,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_HEADER_NAME": "HTTP_AUTHORIZATION",
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

# Internationalisation (FR/EN comme spécifié)
LANGUAGE_CODE = "fr-fr"  # Français par défaut (public cible Afrique centrale)
TIME_ZONE = "Africa/Douala"  # Fuseau horaire Cameroun

LANGUAGES = [
    ("fr", "Français"),
    ("en", "English"),
]

USE_I18N = True
USE_L10N = True
USE_TZ = True

# Répertoires de localisation
LOCALE_PATHS = [
    BASE_DIR / 'locale',
]

# CORS Configuration (pour React Native)
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",  # Pour développement web éventuel
    "http://127.0.0.1:3000",
    "http://localhost:8081",  # Metro bundler React Native
]

CORS_ALLOW_ALL_ORIGINS = True  # À restreindre en production

AUTHENTICATION_BACKENDS = [
    "accounts.backends.MavecamAuthBackend",
    "django.contrib.auth.backends.ModelBackend",
]

# Configuration Swagger/OpenAPI avec drf-spectacular
SPECTACULAR_SETTINGS = {
    "TITLE": "MAVECAM AquaCare API",
    "DESCRIPTION": "API de gestion aquacole pour les pisciculteurs.",
    "VERSION": "1.0.0 MVP",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "SORT_OPERATIONS": False,
    "SCHEMA_PATH_PREFIX": "/api/",
    "DEFAULT_GENERATOR_CLASS": "drf_spectacular.generators.SchemaGenerator",
}

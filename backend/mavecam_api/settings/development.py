from .base import *
from decouple import config

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = config('DJANGO_SECRET_KEY', default="django-insecure-im6q3xmdo2l%y4b)vo*+hizdj5bckrh(b%7nj54--+cwpp=!pc")

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = config('DJANGO_DEBUG', default=True, cast=bool)

ALLOWED_HOSTS = config('DJANGO_ALLOWED_HOSTS', default='127.0.0.1,localhost,api,*').split(',')

# Database - PostgreSQL pour correspondre à la production (environnement Docker)
# Si POSTGRES_HOST n'existe pas (Python classique sans Docker), bascule sur SQLite
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql" if config('POSTGRES_HOST', default=None) else "django.db.backends.sqlite3",
        "NAME": config('POSTGRES_DB', default=BASE_DIR / "db.sqlite3"),
        "USER": config('POSTGRES_USER', default=''),
        "PASSWORD": config('POSTGRES_PASSWORD', default=''),
        "HOST": config('POSTGRES_HOST', default=''),
        "PORT": config('POSTGRES_PORT', default='5432'),
        "CONN_MAX_AGE": 60,  # Connection pooling pour dev
        "OPTIONS": {
            'connect_timeout': 10,
        } if config('POSTGRES_HOST', default=None) else {}
    }
}

# Email — console backend en dev (affiche les emails dans les logs Docker)
# Pour tester l'envoi réel via Resend : EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend dans .env
EMAIL_BACKEND = config('EMAIL_BACKEND', default='django.core.mail.backends.console.EmailBackend')

# CORS - Allow all pour dev
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8081",
]

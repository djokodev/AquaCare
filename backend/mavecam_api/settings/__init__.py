import os

# Déterminer l'environnement
env = os.getenv('DJANGO_SETTINGS_MODULE', 'mavecam_api.settings.development')

if 'production' in env:
    from .production import *
else:
    from .development import *

"""
Configuration pytest pour les tests du module commerce.
"""
import os

import django

# Configure Django settings avant de charger les modeles
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'aquacare_api.settings.test')
django.setup()

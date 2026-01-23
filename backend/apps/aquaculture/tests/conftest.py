"""
Configuration globale pour les tests MAVECAM.

Ce fichier contient des fixtures réutilisables et la configuration
partagée entre tous les tests du projet.
"""
import os
import django

# Configuration Django pour les tests (utilise pytest.ini ou variable d'environnement)
# Ne pas forcer 'mavecam_api.settings' car pytest.ini définit déjà 'mavecam_api.settings.test'
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mavecam_api.settings.test')
django.setup()

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()


@pytest.fixture
def api_client():
    """
    Client API pour les tests d'intégration.
    Permet de simuler les requêtes HTTP depuis l'app mobile.
    """
    return APIClient()


@pytest.fixture
def user_factory():
    """
    Factory pour créer des utilisateurs de test.
    Simule les pisciculteurs qui s'inscrivent via l'app mobile.
    """
    import random
    
    def create_user(**kwargs):
        # Générer un numéro de téléphone unique
        unique_number = random.randint(100000, 999999)
        defaults = {
            'phone_number': f'+237690{unique_number}',
            'email': f'test{unique_number}@mavecam.com',
            'first_name': 'Jean',
            'last_name': 'Farmer',
            'account_type': 'individual',
            'age_group': '26_35',
            'password': 'password123'
        }
        defaults.update(kwargs)
        return User.objects.create_user(**defaults)
    return create_user


@pytest.fixture
def authenticated_user(user_factory):
    """
    Utilisateur authentifié pour les tests nécessitant une connexion.
    """
    return user_factory()


@pytest.fixture
def auth_client(api_client, authenticated_user):
    """
    Client API avec utilisateur connecté (tokens JWT).
    Simule un pisciculteur connecté dans l'app mobile.
    """
    refresh = RefreshToken.for_user(authenticated_user)
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
    return api_client


@pytest.fixture
def mavecam_admin(user_factory):
    """
    Utilisateur administrateur MAVECAM pour les tests nécessitant
    des privilèges élevés (ex: gestion des certifications).
    """
    return user_factory(
        phone_number='+237699000001',
        email='admin@mavecam.com',
        first_name='Admin',
        last_name='MAVECAM',
        is_staff=True,
        is_superuser=True
    )


# Fixtures pour l'application aquaculture

@pytest.fixture
def farm_profile(authenticated_user):
    """
    Profil de ferme pour les tests aquaculture.
    """
    from accounts.models import FarmProfile
    
    # Utiliser get_or_create pour éviter les doublons
    farm_profile, created = FarmProfile.objects.get_or_create(
        user=authenticated_user,
        defaults={
            'farm_name': "Ferme Test Aquaculture",
            'certification_status': "pending",
            'total_ponds': 3,
            'total_area_m2': 500.00,
            'water_source': "Forage",
            'main_species': "Clarias",
            'annual_production_kg': 2000
        }
    )
    return farm_profile


@pytest.fixture
def production_cycle(farm_profile):
    """
    Cycle de production de base pour les tests.
    """
    from decimal import Decimal
    from datetime import date, timedelta
    from aquaculture.models import ProductionCycle
    
    # Créer cycle avec tous les champs requis définis explicitement
    cycle = ProductionCycle(
        farm_profile=farm_profile,
        cycle_name="Cycle Test Clarias",
        species="clarias",
        pond_identifier="Bassin Test",
        pond_surface_m2=Decimal('100'),
        pond_volume_m3=Decimal('200'),
        start_date=date.today() - timedelta(days=30),
        initial_count=1000,
        initial_average_weight=Decimal('10'),
        initial_biomass=Decimal('10.00'),  # 1000 * 10g = 10kg
        # Initialiser les valeurs courantes
        current_count=1000,
        current_average_weight=Decimal('10'),
        current_biomass=Decimal('10.00'),
        status="active"
    )
    cycle.save()  # Déclenche post_save avec created=True
    
    # Mettre à jour les valeurs courantes manuellement pour simuler le passage du temps
    cycle.current_count = 950  # Quelques mortalités
    cycle.current_average_weight = Decimal('35')
    cycle.current_biomass = Decimal('33.25')
    cycle.save()
    
    return cycle
"""
Factories pour générer des données de test cohérentes.

Factory Boy permet de créer facilement des objets de test
avec des données réalistes pour simuler les vrais utilisateurs MAVECAM.
"""
from datetime import date
from decimal import Decimal

import factory
from django.contrib.auth import get_user_model
from factory.django import DjangoModelFactory

User = get_user_model()


class UserFactory(DjangoModelFactory):
    """
    Factory pour créer des utilisateurs pisciculteurs de test.
    
    Genere des donnees realistes pour simuler les vrais clients MAVECAM.
    """

    class Meta:
        model = User

    phone_number = factory.Sequence(lambda n: f"+23769123456{n:01d}")
    email = factory.LazyAttribute(lambda obj: f"user{obj.phone_number[-1]}@exemple.com")
    first_name = factory.Faker('first_name', locale='fr_FR')
    last_name = factory.Faker('last_name', locale='fr_FR')
    account_type = 'individual'
    age_group = '26_35'
    activity_type = 'poisson_table'
    region = 'centre'
    language_preference = 'fr'
    is_active = True
    is_staff = False
    password = 'pbkdf2_sha256$260000$test$hash'  # Pre-hashed test password

    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        """Override the default _create to set password properly."""
        password = kwargs.pop('password', 'motdepasse_test123')
        obj = model_class(*args, **kwargs)
        obj.set_password(password)
        obj.save()
        return obj


class MavecamAdminFactory(UserFactory):
    """
    Factory pour créer des administrateurs MAVECAM.
    
    Simule les comptes du personnel MAVECAM qui gerent les certifications.
    """

    phone_number = factory.Sequence(lambda n: f"+23767000000{n:01d}")
    email = factory.LazyAttribute(lambda obj: f"admin{obj.phone_number[-1]}@mavecam.com")
    first_name = "Admin"
    last_name = "MAVECAM"
    account_type = 'individual'
    age_group = '26_35'
    is_verified = True
    is_staff = True
    is_superuser = True


class CompanyUserFactory(UserFactory):
    """
    Factory pour créer des utilisateurs entreprises de test.
    """
    account_type = 'company'
    business_name = factory.Sequence(lambda n: f"AquaFerme {n} SARL")
    legal_status = 'sarl'
    promoter_name = factory.LazyAttribute(lambda obj: f"{obj.first_name} {obj.last_name}")
    age_group = None  # Les entreprises n'ont pas d'âge


# =================== AQUACULTURE FACTORIES ===================

class FarmProfileFactory(DjangoModelFactory):
    """
    Factory pour créer des profils de ferme de test.
    """
    class Meta:
        model = 'accounts.FarmProfile'

    user = factory.SubFactory(UserFactory)
    farm_name = factory.Sequence(lambda n: f"Ferme Test {n}")
    total_ponds = 3
    total_area_m2 = Decimal('1500.00')
    water_source = 'Rivière'
    main_species = 'Tilapia'
    annual_production_kg = 5000
    certification_status = 'pending'


class ProductionCycleFactory(DjangoModelFactory):
    """
    Factory pour créer des cycles de production de test.
    """
    class Meta:
        model = 'aquaculture.ProductionCycle'

    farm_profile = factory.SubFactory(FarmProfileFactory)
    cycle_name = factory.Sequence(lambda n: f"Cycle Test {n}")
    species = 'tilapia'
    pond_identifier = factory.Sequence(lambda n: f"Bassin Test {n}")
    pond_surface_m2 = Decimal('500.00')
    pond_volume_m3 = Decimal('600.00')
    start_date = factory.LazyFunction(date.today)
    initial_count = 5000
    initial_average_weight = Decimal('15.00')
    initial_biomass = Decimal('75.00')
    current_count = 5000
    current_average_weight = Decimal('15.00')
    current_biomass = Decimal('75.00')
    total_feed_consumed = Decimal('0.00')
    status = 'active'


# Exemples d'usage dans les tests :
#
# user = UserFactory()  # Utilisateur individuel avec données aléatoires
# user = UserFactory(phone_number='+237691234567')  # Avec téléphone spécifique
# company = CompanyUserFactory()  # Utilisateur entreprise
# users = UserFactory.create_batch(5)  # 5 utilisateurs d'un coup
# admin = MavecamAdminFactory()  # Administrateur MAVECAM
# farm_profile = FarmProfileFactory()  # Profil de ferme
# cycle = ProductionCycleFactory()  # Cycle de production

"""
Factories pour générer des données de test cohérentes.

Factory Boy permet de créer facilement des objets de test
avec des données réalistes pour simuler les vrais utilisateurs MAVECAM.
"""
import factory
from django.contrib.auth import get_user_model
from factory.django import DjangoModelFactory

User = get_user_model()


class UserFactory(DjangoModelFactory):
    """
    Factory pour créer des utilisateurs pisciculteurs de test.
    
    Génère des données réalistes pour simuler les vrais clients MAVECAM.
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
    
    @factory.post_generation
    def password(self, create, extracted, **kwargs):
        """Définir un mot de passe par défaut pour les tests."""
        password = extracted or 'motdepasse_test123'
        self.set_password(password)
        if create:
            self.save()


class MavecamAdminFactory(UserFactory):
    """
    Factory pour créer des administrateurs MAVECAM.
    
    Simule les comptes du personnel MAVECAM qui gèrent les certifications.
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


# Exemples d'usage dans les tests :
# 
# user = UserFactory()  # Utilisateur individuel avec données aléatoires
# user = UserFactory(phone_number='+237691234567')  # Avec téléphone spécifique
# company = CompanyUserFactory()  # Utilisateur entreprise
# users = UserFactory.create_batch(5)  # 5 utilisateurs d'un coup
# admin = MavecamAdminFactory()  # Administrateur MAVECAM
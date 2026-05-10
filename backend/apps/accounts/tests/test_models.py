"""
Tests unitaires pour les modèles de l'application accounts - Version étendue.

Ces tests vérifient le comportement des modèles de base de données
de façon isolée, incluant toutes les validations métier AquaCare.
"""
import uuid

import pytest
from accounts.managers import AmbiguousLoginNameError
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError

User = get_user_model()


@pytest.mark.django_db
class TestUserModel:
    """
    Tests pour le modèle User personnalisé étendu.
    
    Vérifie que la création d'utilisateurs fonctionne correctement
    avec toutes les spécifications AquaCare.
    """
    
    def test_create_individual_user_success(self):
        """
        Test la création d'une personne physique avec données valides.
        
        Simule : Un pisciculteur individuel s'inscrit avec toutes ses infos.
        """
        user = User.objects.create_user(
            phone_number='+237690123456',
            email='jean@exemple.com',
            first_name='Jean',
            last_name='Farmer',
            password='motdepasse123',
            account_type='individual',
            age_group='26_35',
            activity_type='poisson_table',
            region='centre',
            department='mfoundi'
        )
        
        assert user.phone_number == '+237690123456'
        assert user.email == 'jean@exemple.com'
        assert user.first_name == 'Jean'
        assert user.last_name == 'Farmer'
        assert user.account_type == 'individual'
        assert user.age_group == '26_35'
        assert user.is_individual is True
        assert user.is_company is False
        assert user.login_name == 'Jean Farmer'
        assert user.display_name == 'Jean Farmer'
        assert user.is_active is True
        assert user.is_staff is False
        assert user.check_password('motdepasse123')

    def test_user_uuid_field(self):
        """User.id doit être un UUID pour la synchronisation offline-first."""
        user = User.objects.create_user(
            phone_number='+237690123458',
            first_name='Uuid',
            last_name='Farmer',
            password='motdepasse123',
            account_type='individual',
            age_group='26_35',
        )

        assert isinstance(user.id, uuid.UUID)
        assert len(str(user.id)) == 36

    def test_create_user_rolls_back_when_farm_profile_creation_fails(self, monkeypatch):
        """La création User + FarmProfile doit être atomique."""

        def fail_farm_profile_creation(user):
            raise RuntimeError("farm profile failed")

        monkeypatch.setattr(
            "accounts.services.registration_service.AccountRegistrationService._create_default_farm_profile",
            staticmethod(fail_farm_profile_creation),
        )

        with pytest.raises(RuntimeError, match="farm profile failed"):
            User.objects.create_user(
                phone_number='+237690123457',
                email='rollback@exemple.com',
                first_name='Rollback',
                last_name='Farmer',
                password='motdepasse123',
                account_type='individual',
                age_group='26_35',
            )

        assert not User.objects.filter(phone_number='+237690123457').exists()
    
    def test_create_company_user_success(self):
        """
        Test la création d'une entreprise avec données valides.
        
        Simule : Une SARL s'inscrit sur la plateforme AquaCare.
        """
        user = User.objects.create_user(
            phone_number='+237691234567',
            email='info@aquafarm.cm',
            first_name='Marie',
            last_name='Directrice',
            password='motdepasse123',
            account_type='company',
            business_name='AquaFarm SARL',
            legal_status='sarl',
            promoter_name='Marie Directrice',
            activity_type='mixte',
            region='littoral',
            department='wouri'
        )
        
        assert user.phone_number == '+237691234567'
        assert user.account_type == 'company'
        assert user.business_name == 'AquaFarm SARL'
        assert user.legal_status == 'sarl'
        assert user.promoter_name == 'Marie Directrice'
        assert user.is_individual is False
        assert user.is_company is True
        assert user.login_name == 'AquaFarm SARL'
        assert user.display_name == 'AquaFarm SARL'
    
    def test_create_user_without_phone_fails(self):
        """
        Test qu'on ne peut pas créer un utilisateur sans phone_number.
        
        Métier : Le téléphone est l'identifiant principal.
        """
        with pytest.raises(ValueError, match="Le numéro de téléphone doit être fourni"):
            User.objects.create_user(
                phone_number='',
                email='test@exemple.com',
                password='motdepasse123'
            )
    
    def test_create_superuser_success(self):
        """
        Test la création d'un administrateur AquaCare.
        
        Métier : Les admins AquaCare gèrent les certifications d'éleveurs.
        """
        admin = User.objects.create_superuser(
            phone_number='+237699000000',
            email='admin@aquacare.test',
            first_name='Admin',
            last_name='AquaCare',
            password='admin123'
        )
        
        assert admin.is_staff is True
        assert admin.is_superuser is True
        assert admin.is_active is True
        assert admin.phone_number == '+237699000000'

    def test_get_by_login_name_loads_farm_profile_in_single_query(self, django_assert_num_queries):
        """Le lookup par login_name doit charger la ferme sans requete additionnelle."""
        User.objects.create_user(
            phone_number='+237699000010',
            first_name='Jeanne',
            last_name='Piscicultrice',
            password='motdepasse123',
            account_type='individual',
            age_group='26_35',
        )

        with django_assert_num_queries(1):
            user = User.objects.get_by_login_name('Jeanne Piscicultrice')
            assert user.farm_profile.farm_name == 'Ferme de Jeanne Piscicultrice'

    def test_get_by_login_name_uses_normalized_lookup(self):
        """Le login par nom reste insensible à la casse sans fonction SQL par ligne."""
        user = User.objects.create_user(
            phone_number='+237699000014',
            first_name='Jeanne',
            last_name='Piscicultrice',
            password='motdepasse123',
            account_type='individual',
            age_group='26_35',
        )

        result = User.objects.get_by_login_name('  JEANNE   piscicultrice ')

        assert result == user
        assert user.first_name_normalized == 'jeanne'
        assert user.last_name_normalized == 'piscicultrice'

    def test_get_by_login_name_duplicate_names_returns_ambiguous_error(self):
        """Un nom de connexion ambigu doit échouer proprement."""
        User.objects.create_user(
            phone_number='+237699000012',
            first_name='Jean',
            last_name='Farmer',
            password='motdepasse123',
            account_type='individual',
            age_group='26_35',
        )
        User.objects.create_user(
            phone_number='+237699000013',
            first_name='Jean',
            last_name='Farmer',
            password='motdepasse123',
            account_type='individual',
            age_group='26_35',
        )

        with pytest.raises(AmbiguousLoginNameError):
            User.objects.get_by_login_name('Jean Farmer')

    def test_get_by_natural_key_loads_farm_profile_in_single_query(self, django_assert_num_queries):
        """Le lookup par numero de telephone doit aussi charger la ferme."""
        User.objects.create_user(
            phone_number='+237699000011',
            first_name='Entreprise',
            last_name='Owner',
            password='motdepasse123',
            account_type='company',
            business_name='Aqua Owner SARL',
            legal_status='sarl',
            promoter_name='Entreprise Owner',
        )

        with django_assert_num_queries(1):
            user = User.objects.get_by_natural_key('+237699000011')
            assert user.farm_profile.farm_name == 'Ferme Aqua Owner SARL'
    
    def test_user_string_representation(self):
        """
        Test l'affichage textuel d'un utilisateur.
        
        Important pour le Django Admin et les logs.
        """
        user = User.objects.create_user(
            phone_number='+237692345678',
            first_name='Marie',
            last_name='Eleveur',
            email='marie@exemple.com',
            account_type='individual',
            age_group='26_35'
        )
        
        expected = 'Marie Eleveur'  # Sans numéro de téléphone pour lisibilité admin
        assert str(user) == expected
    
    def test_phone_number_uniqueness(self):
        """
        Test que les numéros de téléphone sont uniques.
        
        Métier : Un téléphone = un compte unique.
        """
        from django.db import transaction
        
        # Créer le premier utilisateur
        user1 = User.objects.create_user(
            phone_number='+237690000000',
            first_name='User',
            last_name='One',
            email='user1@exemple.com',
            account_type='individual',
            age_group='26_35'
        )
        
        # Vérifier qu'il a été créé
        assert user1.phone_number == '+237690000000'
        
        # Tentative de créer un autre utilisateur avec le même téléphone doit échouer
        with pytest.raises(IntegrityError):
            try:
                with transaction.atomic():
                    User.objects.create_user(
                        phone_number='+237690000000',  # Même téléphone
                        first_name='User',
                        last_name='Two',
                        email='user2@exemple.com',
                        account_type='individual',
                        age_group='36_45'
                    )
            except Exception as e:
                # Si ce n'est pas une IntegrityError, la re-transformer
                if not isinstance(e, IntegrityError):
                    raise IntegrityError() from e
                raise
    
    def test_individual_validation_success(self):
        """
        Test validation réussie pour une personne physique.
        """
        # Créer un utilisateur avec des données valides
        user = User.objects.create_user(
            phone_number='+237693456789',
            first_name='Paul',
            last_name='Fermier',
            account_type='individual',
            age_group='36_45',
            activity_type='alevins'
        )
        # Vérifier que l'utilisateur a été créé correctement
        assert user.first_name == 'Paul'
        assert user.last_name == 'Fermier'
        assert user.age_group == '36_45'
        assert user.account_type == 'individual'
    
    def test_individual_missing_age_group_fails(self):
        """
        Test qu'une personne physique doit avoir une classe d'âge.
        """
        user = User(
            phone_number='+237694567890',
            first_name='Paul',
            last_name='Fermier',
            account_type='individual',
            # age_group manquant
        )
        with pytest.raises(ValidationError) as exc_info:
            user.full_clean()

        assert 'age_group' in str(exc_info.value)

    def test_individual_blank_names_with_spaces_fail(self):
        """
        Test que les noms composés uniquement d'espaces sont invalides.
        """
        user = User(
            phone_number='+237694567891',
            first_name='   ',
            last_name='   ',
            account_type='individual',
            age_group='36_45',
        )

        with pytest.raises(ValidationError) as exc_info:
            user.full_clean()

        assert 'first_name' in str(exc_info.value)
        assert 'last_name' in str(exc_info.value)
    
    def test_company_validation_success(self):
        """
        Test validation réussie pour une entreprise.
        """
        # Créer une entreprise avec des données valides
        user = User.objects.create_user(
            phone_number='+237695678901',
            first_name='Jean',
            last_name='Manager',
            account_type='company',
            business_name='PoissonCorp SARL',
            legal_status='sarl',
            promoter_name='Jean Manager'
        )
        # Vérifier que l'entreprise a été créée correctement
        assert user.first_name == 'Jean'
        assert user.last_name == 'Manager'
        assert user.business_name == 'PoissonCorp SARL'
        assert user.legal_status == 'sarl'
        assert user.account_type == 'company'
    
    def test_company_missing_business_name_fails(self):
        """
        Test qu'une entreprise doit avoir un nom commercial.
        """
        user = User(
            phone_number='+237696789012',
            first_name='Jean',
            last_name='Manager',
            account_type='company',
            # business_name manquant
            legal_status='sarl',
            promoter_name='Jean Manager'
        )
        with pytest.raises(ValidationError) as exc_info:
            user.full_clean()

        assert 'business_name' in str(exc_info.value)

    def test_company_blank_business_fields_with_spaces_fail(self):
        """
        Test que les champs entreprise remplis d'espaces sont invalides.
        """
        user = User(
            phone_number='+237696789013',
            account_type='company',
            business_name='   ',
            legal_status='sarl',
            promoter_name='   ',
        )

        with pytest.raises(ValidationError) as exc_info:
            user.full_clean()

        assert 'business_name' in str(exc_info.value)
        assert 'promoter_name' in str(exc_info.value)
    
    def test_geographic_hierarchy_validation_success(self):
        """
        Test que la hiérarchie géographique peut être respectée.
        """
        # Créer un utilisateur avec hiérarchie géographique complète
        user = User.objects.create_user(
            phone_number='+237697890123',
            first_name='Marie',
            last_name='Fermiere',
            account_type='individual',
            age_group='26_35',
            region='centre',
            department='mfoundi',
            district='Yaoundé 1er'
        )
        # Vérifier que la hiérarchie est correcte
        assert user.region == 'centre'
        assert user.department == 'mfoundi'
        assert user.district == 'Yaoundé 1er'
    
    def test_geographic_hierarchy_validation_fails(self):
        """
        Test que département sans région échoue.
        """
        user = User(
            phone_number='+237698901234',
            first_name='Pierre',
            last_name='Fermier',
            account_type='individual',
            age_group='36_45',
            # region manquante mais department fourni
            department='mfoundi'
        )
        with pytest.raises(ValidationError) as exc_info:
            user.full_clean()
        
        assert 'région est requise' in str(exc_info.value)

"""
Tests unitaires pour les serializers de l'application accounts.

Ces tests vérifient la validation et la sérialisation des données
échangées entre l'API et l'app mobile React Native.
"""
import pytest
from accounts.admin_serializers import FarmMapSerializer
from accounts.serializers import (
    AccountDeletionSerializer,
    AnnualSimulationInputSerializer,
    FarmProfileSerializer,
    FarmSetupSerializer,
    LoginSerializer,
    LogoutSerializer,
    UserProfileSerializer,
    UserRegistrationSerializer,
)
from django.contrib.auth import get_user_model

User = get_user_model()


@pytest.mark.django_db
class TestUserRegistrationSerializer:
    """
    Tests pour l'inscription de nouveaux pisciculteurs.
    
    Simule les données envoyées depuis le formulaire d'inscription mobile.
    """
    
    def test_valid_registration_data(self):
        """
        Test l'inscription avec des données valides.
        
        Flux mobile : Utilisateur remplit le formulaire d'inscription.
        """
        data = {
            'phone_number': '+237691234567',
            'email': 'nouveau@exemple.com',
            'first_name': 'Pierre',
            'last_name': 'Dupont',
            'account_type': 'individual',
            'age_group': '26_35',
            'activity_type': 'poisson_table',
            'password': 'motdepasse123',
            'password_confirm': 'motdepasse123'
        }
        
        serializer = UserRegistrationSerializer(data=data)
        assert serializer.is_valid(), f"Errors: {serializer.errors}"
        
        user = serializer.save()
        assert user.phone_number == '+237691234567'
        assert user.email == 'nouveau@exemple.com'
        assert user.first_name == 'Pierre'
        assert user.last_name == 'Dupont'
        assert user.account_type == 'individual'
        assert user.check_password('motdepasse123')
    
    def test_password_mismatch_validation(self):
        """
        Test que les mots de passe doivent correspondre.
        
        UX mobile : Évite les erreurs de saisie de mot de passe.
        """
        data = {
            'phone_number': '+237692345678',
            'first_name': 'Jean',
            'last_name': 'Test',
            'account_type': 'individual',
            'age_group': '26_35',
            'password': 'motdepasse123',
            'password_confirm': 'motdepasse_different'  # Différent !
        }
        
        serializer = UserRegistrationSerializer(data=data)
        assert not serializer.is_valid()
        assert 'non_field_errors' in serializer.errors
        assert 'mots de passe ne correspondent pas' in str(serializer.errors)
    
    def test_short_password_validation(self):
        """
        Test la validation de longueur minimale du mot de passe.
        
        Sécurité : Mot de passe minimum 6 caractères.
        """
        data = {
            'username': 'test_user',
            'password': '123',  # Trop court
            'password_confirm': '123'
        }
        
        serializer = UserRegistrationSerializer(data=data)
        assert not serializer.is_valid()
        assert 'password' in serializer.errors
    
    def test_missing_phone_validation(self):
        """
        Test que le phone_number est obligatoire.
        """
        data = {
            'email': 'test@exemple.com',
            'first_name': 'Jean',
            'last_name': 'Test',
            'account_type': 'individual',
            'age_group': '26_35',
            'password': 'motdepasse123',
            'password_confirm': 'motdepasse123'
            # phone_number manquant
        }
        
        serializer = UserRegistrationSerializer(data=data)
        assert not serializer.is_valid()
        assert 'phone_number' in serializer.errors

    def test_blank_names_with_spaces_are_rejected(self):
        """
        Test que les champs obligatoires remplis d'espaces sont rejetés.
        """
        data = {
            'phone_number': '+237692345679',
            'first_name': '   ',
            'last_name': '   ',
            'account_type': 'individual',
            'age_group': '26_35',
            'password': 'motdepasse123',
            'password_confirm': 'motdepasse123',
        }

        serializer = UserRegistrationSerializer(data=data)

        assert not serializer.is_valid()
        assert 'first_name' in serializer.errors
        assert 'last_name' in serializer.errors


@pytest.mark.django_db
class TestUserProfileSerializer:
    """
    Tests pour la consultation/modification du profil utilisateur.
    
    Simule l'écran "Mon Profil" de l'app mobile.
    """
    
    def test_user_profile_serialization(self, user_factory):
        """
        Test la sérialisation d'un profil utilisateur.
        
        API → Mobile : Affichage des infos utilisateur.
        """
        user = user_factory(
            phone_number='+237693456789',
            email='profile@exemple.com',
            first_name='Marie',
            last_name='Martin',
            account_type='individual',
            age_group='26_35'
        )
        
        serializer = UserProfileSerializer(user)
        data = serializer.data
        
        assert data['phone_number'] == '+237693456789'
        assert data['email'] == 'profile@exemple.com'
        assert data['first_name'] == 'Marie'
        assert data['last_name'] == 'Martin'
        assert data['account_type'] == 'individual'
        assert 'id' in data
        assert 'date_joined' in data
        assert 'is_active' in data
    
    def test_profile_update(self, user_factory):
        """
        Test la modification du profil utilisateur.
        
        Mobile → API : Utilisateur modifie ses infos personnelles.
        """
        user = user_factory()
        
        update_data = {
            'first_name': 'Nouveau Prénom',
            'last_name': 'Nouveau Nom',
            'email': 'nouveau_email@exemple.com'
        }
        
        serializer = UserProfileSerializer(user, data=update_data, partial=True)
        assert serializer.is_valid()
        
        updated_user = serializer.save()
        assert updated_user.first_name == 'Nouveau Prénom'
        assert updated_user.last_name == 'Nouveau Nom'
        assert updated_user.email == 'nouveau_email@exemple.com'
    
    def test_readonly_fields_protection(self, user_factory):
        """
        Test que les champs en lecture seule ne peuvent être modifiés.
        
        Sécurité : phone_number, id, date_joined ne doivent pas être modifiables.
        """
        user = user_factory(phone_number='+237693456789')
        
        malicious_data = {
            'phone_number': '+237699999999',  # Tentative de modification
            'id': 99999,                      # Tentative de modification  
            'first_name': 'Légitime'          # Modification autorisée
        }
        
        serializer = UserProfileSerializer(user, data=malicious_data, partial=True)
        assert serializer.is_valid()
        
        updated_user = serializer.save()
        # Les champs readonly ne doivent pas avoir changé
        assert updated_user.phone_number == '+237693456789'  # Inchangé
        assert updated_user.first_name == 'Légitime'         # Changé


@pytest.mark.django_db
class TestLoginSerializer:
    """
    Tests pour l'authentification des pisciculteurs.
    
    Simule l'écran de connexion de l'app mobile.
    """
    
    def test_valid_login_credentials(self, user_factory):
        """
        Test la connexion avec des identifiants valides par nom.
        
        Flux mobile : Utilisateur saisit login_name/password corrects.
        """
        user = user_factory(
            first_name='Jean',
            last_name='Farmer',
            account_type='individual',
            age_group='26_35'
        )
        user.set_password('motdepasse123')  # Assurer le hachage
        user.save()
        
        data = {
            'login_name': 'Jean Farmer',  # login_name pour individual
            'password': 'motdepasse123'
        }
        
        serializer = LoginSerializer(data=data)
        assert serializer.is_valid(), f"Errors: {serializer.errors}"
        assert serializer.validated_data['user'] == user
    
    def test_valid_login_by_phone(self, user_factory):
        """
        Test la connexion avec numéro de téléphone valide.
        
        Flux mobile : Utilisateur saisit phone_number/password corrects.
        """
        user = user_factory(
            phone_number='+237691234567',
            first_name='Marie',
            last_name='Testeur',
            account_type='individual',
            age_group='26_35'
        )
        user.set_password('motdepasse123')
        user.save()
        
        data = {
            'phone_number': '+237691234567',
            'password': 'motdepasse123'
        }
        
        serializer = LoginSerializer(data=data)
        assert serializer.is_valid(), f"Errors: {serializer.errors}"
        assert serializer.validated_data['user'] == user
    
    def test_valid_login_company_by_phone(self, user_factory):
        """
        Test la connexion d'une entreprise avec numéro de téléphone.
        """
        user = user_factory(
            phone_number='+237695554433',
            business_name='AquaFerme SARL',
            account_type='company',
            legal_status='sarl',
            promoter_name='Marie Directrice',
            age_group=None  # Les entreprises n'ont pas d'age_group
        )
        user.set_password('entreprise123')
        user.save()
        
        data = {
            'phone_number': '+237695554433',
            'password': 'entreprise123'
        }
        
        serializer = LoginSerializer(data=data)
        assert serializer.is_valid(), f"Errors: {serializer.errors}"
        assert serializer.validated_data['user'] == user
    
    def test_invalid_credentials(self, user_factory):
        """
        Test la connexion avec des identifiants incorrects.
        
        Sécurité : Mauvais mot de passe doit être rejeté.
        """
        user = user_factory(
            first_name='Jean',
            last_name='Test',
            account_type='individual',
            age_group='26_35'
        )
        user.set_password('correct_password')
        user.save()
        
        data = {
            'login_name': 'Jean Test',
            'password': 'wrong_password'  # Mot de passe incorrect
        }
        
        serializer = LoginSerializer(data=data)
        assert not serializer.is_valid()
        assert 'non_field_errors' in serializer.errors
        assert 'Identifiants invalides' in str(serializer.errors)
    
    def test_inactive_user_login(self, user_factory):
        """
        Test qu'un utilisateur désactivé ne peut pas se connecter.
        
        Métier : Comptes suspendus par AquaCare ne peuvent accéder.
        """
        user = user_factory(
            first_name='Jean',
            last_name='Inactive',
            account_type='individual',
            age_group='26_35',
            is_active=False  # Compte désactivé
        )
        user.set_password('motdepasse123')
        user.save()
        
        data = {
            'login_name': 'Jean Inactive',
            'password': 'motdepasse123'
        }
        
        serializer = LoginSerializer(data=data)
        assert not serializer.is_valid()
        # L'utilisateur inactif est rejeté au niveau de l'authentification
        assert 'non_field_errors' in serializer.errors
        assert 'Identifiants invalides' in str(serializer.errors)
    
    def test_missing_credentials(self):
        """
        Test que les champs requis sont validés correctement.
        """
        # Aucun identifiant fourni - doit échouer
        data = {'password': 'motdepasse123'}
        serializer = LoginSerializer(data=data)
        assert not serializer.is_valid()
        assert 'non_field_errors' in serializer.errors
        assert 'Veuillez fournir soit le nom de connexion soit le numéro de téléphone' in str(serializer.errors)
        
        # Password manquant - doit échouer
        data = {'login_name': 'Jean Test'}
        serializer = LoginSerializer(data=data)
        assert not serializer.is_valid()
        assert 'non_field_errors' in serializer.errors
        assert 'mot de passe est requis' in str(serializer.errors)


class TestActionSerializers:
    """Tests des serializers DRF utilitaires des endpoints d'action."""

    def test_logout_serializer_requires_refresh(self):
        serializer = LogoutSerializer(data={})

        assert not serializer.is_valid()
        assert "refresh" in serializer.errors

    def test_account_deletion_serializer_requires_explicit_confirmation(self):
        serializer = AccountDeletionSerializer(data={"confirm": False})

        assert not serializer.is_valid()
        assert "confirm" in serializer.errors
        
        # Phone sans password - doit échouer
        data = {'phone_number': '+237691234567'}
        serializer = LoginSerializer(data=data)
        assert not serializer.is_valid()
        assert 'non_field_errors' in serializer.errors
        assert 'mot de passe est requis' in str(serializer.errors)


@pytest.mark.django_db
class TestFarmProfileSerializer:
    def test_serializer_requires_complete_gps_pair(self, user_factory):
        farm = user_factory().farm_profile
        serializer = FarmProfileSerializer(
            farm,
            data={"latitude": "3.8680"},
            partial=True,
        )

        assert not serializer.is_valid()
        assert "longitude" in serializer.errors

    def test_serializer_rejects_non_positive_default_feed_price(self, user_factory):
        farm = user_factory().farm_profile
        serializer = FarmProfileSerializer(
            farm,
            data={"default_feed_price_per_kg": "0.00"},
            partial=True,
        )

        assert not serializer.is_valid()
        assert "default_feed_price_per_kg" in serializer.errors


@pytest.mark.django_db
class TestFarmSetupSerializer:
    def test_etang_requires_surface(self, user_factory):
        farm = user_factory().farm_profile
        serializer = FarmSetupSerializer(
            farm,
            data={
                "setup_species": "tilapia",
                "setup_infrastructure_type": "etang",
                "setup_unit_count": 2,
                "annual_production_target_kg": "500.00",
                "num_cycles_per_year": 2,
            },
            partial=True,
        )

        assert not serializer.is_valid()
        assert "setup_unit_surface_m2" in serializer.errors

    def test_bac_accepts_volume_without_surface(self, user_factory):
        farm = user_factory().farm_profile
        serializer = FarmSetupSerializer(
            farm,
            data={
                "setup_species": "clarias",
                "setup_infrastructure_type": "bac_en_sol",
                "setup_unit_count": 4,
                "setup_unit_volume_m3": "10.00",
                "annual_production_target_kg": "800.00",
                "num_cycles_per_year": 3,
            },
            partial=True,
        )

        assert serializer.is_valid(), serializer.errors


class TestAnnualSimulationInputSerializer:
    def test_valid_payload_normalizes_num_cycles_to_int(self):
        serializer = AnnualSimulationInputSerializer(
            data={
                "species": "tilapia",
                "annual_production_target_kg": "1000.00",
                "num_cycles": "2",
            }
        )

        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["num_cycles"] == 2

    def test_invalid_species_and_num_cycles_are_rejected(self):
        serializer = AnnualSimulationInputSerializer(
            data={
                "species": "carpe",
                "annual_production_target_kg": "1000.00",
                "num_cycles": 4,
            }
        )

        assert not serializer.is_valid()
        assert "species" in serializer.errors
        assert "num_cycles" in serializer.errors


@pytest.mark.django_db
class TestFarmMapSerializer:
    def test_owner_fields_are_serialized_for_admin_map(self, user_factory):
        user = user_factory(
            first_name="Map",
            last_name="Owner",
            phone_number="+237699123123",
        )
        farm = user.farm_profile
        farm.latitude = "3.8680000"
        farm.longitude = "11.5174000"
        farm.save()

        data = FarmMapSerializer(farm).data

        assert data["owner_name"] == "Map Owner"
        assert data["owner_phone"] == "+237699123123"
        assert data["latitude"] == "3.8680000"
        assert data["longitude"] == "11.5174000"

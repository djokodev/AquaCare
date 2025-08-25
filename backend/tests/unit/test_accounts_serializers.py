"""
Tests unitaires pour les serializers de l'application accounts.

Ces tests vérifient la validation et la sérialisation des données
échangées entre l'API et l'app mobile React Native.
"""
import pytest
from django.contrib.auth import get_user_model
from accounts.serializers import (
    UserRegistrationSerializer,
    UserProfileSerializer,
    LoginSerializer
)

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
        assert 'incorrect' in str(serializer.errors)
    
    def test_inactive_user_login(self, user_factory):
        """
        Test qu'un utilisateur désactivé ne peut pas se connecter.
        
        Métier : Comptes suspendus par MAVECAM ne peuvent accéder.
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
        assert ('incorrect' in str(serializer.errors) or 'désactivé' in str(serializer.errors))
    
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
        
        # Phone sans password - doit échouer
        data = {'phone_number': '+237691234567'}
        serializer = LoginSerializer(data=data)
        assert not serializer.is_valid()
        assert 'non_field_errors' in serializer.errors
        assert 'mot de passe est requis' in str(serializer.errors)
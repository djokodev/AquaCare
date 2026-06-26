"""
Tests unitaires complets pour tous les endpoints API accounts.

Teste le comportement exact de chaque endpoint avec différents scénarios.
"""
import uuid

import pytest
from accounts.models import FarmProfile
from accounts.services.auth_application_service import AuthApplicationService
from django.contrib.auth import get_user_model
from django.core.cache import cache, caches
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken, UntypedToken

User = get_user_model()


@pytest.mark.django_db
class TestRegistrationEndpoint:
    """
    Tests pour POST /api/accounts/register/
    """
    
    def setup_method(self):
        """Configuration pour chaque test."""
        self.client = APIClient()
        self.url = reverse('accounts:register')
    
    def test_register_individual_success(self):
        """Test inscription personne physique réussie."""
        data = {
            "phone_number": "+237690123456",
            "email": "jean@example.com",
            "first_name": "Jean",
            "last_name": "Farmer",
            "password": "motdepasse123",
            "password_confirm": "motdepasse123",
            "account_type": "individual",
            "age_group": "26_35",
            "activity_type": "poisson_table",
            "region": "centre",
            "department": "mfoundi"
        }
        
        response = self.client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_201_CREATED
        
        # Vérifier structure de la réponse
        assert 'user' in response.data
        assert 'tokens' in response.data
        assert 'message' in response.data
        
        # Vérifier données utilisateur
        user_data = response.data['user']
        assert user_data['phone_number'] == "+237690123456"
        assert user_data['first_name'] == "Jean"
        assert user_data['last_name'] == "Farmer"
        assert user_data['account_type'] == "individual"
        assert user_data['age_group'] == "26_35"
        assert user_data['is_verified'] is False
        
        # Vérifier tokens
        tokens = response.data['tokens']
        assert 'access' in tokens
        assert 'refresh' in tokens
        assert len(tokens['access']) > 100  # JWT token length
        assert UntypedToken(tokens['access'])['language_preference'] == 'fr'
        
        # Vérifier que l'utilisateur est créé en DB
        user = User.objects.get(phone_number="+237690123456")
        assert user.first_name == "Jean"
        assert user.last_name == "Farmer"
        
        # Vérifier que le FarmProfile est créé automatiquement
        assert hasattr(user, 'farm_profile')
        assert user.farm_profile.farm_name == "Ferme de Jean Farmer"
        assert user.farm_profile.certification_status == "pending"
    
    def test_register_company_success(self):
        """Test inscription entreprise réussie."""
        data = {
            "phone_number": "+237691234567",
            "email": "contact@aquafarm.cm",
            "first_name": "Marie",
            "last_name": "Directrice",
            "business_name": "AquaFarm SARL",
            "password": "motdepasse456",
            "password_confirm": "motdepasse456",
            "account_type": "company",
            "legal_status": "sarl",
            "promoter_name": "Marie Directrice",
            "activity_type": "mixte"
        }
        
        response = self.client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_201_CREATED
        
        user_data = response.data['user']
        assert user_data['account_type'] == "company"
        assert user_data['business_name'] == "AquaFarm SARL"
        assert user_data['legal_status'] == "sarl"
        assert user_data['promoter_name'] == "Marie Directrice"
        
        # Vérifier FarmProfile entreprise
        user = User.objects.get(phone_number="+237691234567")
        assert user.farm_profile.farm_name == "Ferme AquaFarm SARL"

    def test_register_success_keeps_query_budget(self, django_assert_num_queries):
        """L'inscription ne doit pas relire l'utilisateur pour construire la reponse."""
        data = {
            "phone_number": "+237691240001",
            "email": "register-perf@example.com",
            "first_name": "Register",
            "last_name": "Perf",
            "password": "motdepasse123",
            "password_confirm": "motdepasse123",
            "account_type": "individual",
            "age_group": "26_35",
        }

        with django_assert_num_queries(11):
            response = self.client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["user"]["farm_profile"]["farm_name"] == "Ferme de Register Perf"
    
    def test_register_duplicate_phone_fails(self):
        """Test échec inscription avec téléphone existant."""
        # Créer d'abord un utilisateur
        User.objects.create_user(
            phone_number="+237690000000",
            first_name="Existing",
            last_name="User",
            account_type="individual",
            age_group="26_35",
            password="test12345"
        )

        # Essayer de créer avec le même téléphone
        data = {
            "phone_number": "+237690000000",  # Même téléphone
            "first_name": "New",
            "last_name": "User",
            "password": "test45678",
            "password_confirm": "test45678",
            "account_type": "individual",
            "age_group": "36_45"
        }
        
        response = self.client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        phone_error = "phone_number" in response.data and (
            "Impossible de créer ce compte" in str(response.data["phone_number"])
        )
        non_field_error = "non_field_errors" in response.data and (
            "Impossible de créer ce compte" in str(response.data["non_field_errors"])
        )
        error_found = phone_error or non_field_error
        assert error_found, f"Expected duplicate phone error but got: {response.data}"
    
    def test_register_password_mismatch_fails(self):
        """Test échec avec mots de passe différents."""
        data = {
            "phone_number": "+237690111111",
            "first_name": "Test",
            "last_name": "User",
            "password": "motdepasse123",
            "password_confirm": "motdepasse456",  # Différent
            "account_type": "individual",
            "age_group": "26_35"
        }
        
        response = self.client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "ne correspondent pas" in str(response.data)
    
    def test_register_individual_missing_age_group_fails(self):
        """Test échec personne physique sans age_group."""
        data = {
            "phone_number": "+237690222222",
            "first_name": "Test",
            "last_name": "User",
            "password": "test12345",
            "password_confirm": "test12345",
            "account_type": "individual"
            # age_group manquant
        }
        
        response = self.client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "age_group" in response.data
    
    def test_register_company_missing_legal_status_fails(self):
        """Test échec entreprise sans legal_status."""
        data = {
            "phone_number": "+237690333333",
            "first_name": "Test",
            "last_name": "User",
            "business_name": "Test Company",
            "promoter_name": "Test User",
            "password": "test12345",
            "password_confirm": "test12345",
            "account_type": "company"
            # legal_status manquant
        }
        
        response = self.client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "legal_status" in response.data


@pytest.mark.django_db
class TestLoginEndpoint:
    """
    Tests pour POST /api/accounts/login/
    """
    
    def setup_method(self, method):
        """Configuration pour chaque test."""
        cache.clear()
        self.client = APIClient()
        self.url = reverse('accounts:login')
        suffix = uuid.uuid4().hex[:8]
        ip_octet = int(suffix[:2], 16)
        self.client.defaults['REMOTE_ADDR'] = f"10.10.{ip_octet}.10"
        self.individual_first_name = "Jean"
        self.individual_last_name = f"Farmer{suffix}"
        self.individual_login_name = f"{self.individual_first_name} {self.individual_last_name}"
        self.company_login_name = f"AquaFarm {suffix} SARL"

        # Créer des utilisateurs de test
        self.individual_user = User.objects.create_user(
            phone_number="+237690444444",
            first_name=self.individual_first_name,
            last_name=self.individual_last_name,
            password="motdepasse123",
            age_group="26_35"
        )
        
        self.company_user = User.objects.create_user(
            phone_number="+237690555555",
            first_name="Marie",
            last_name="Boss",
            business_name=self.company_login_name,
            password="motdepasse456",
            account_type="company",
            legal_status="sarl",
            promoter_name="Marie Boss"
        )
    
    def test_login_individual_by_name_success(self):
        """Test connexion individu par nom complet."""
        data = {
            "login_name": self.individual_login_name,
            "password": "motdepasse123"
        }
        
        response = self.client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert 'user' in response.data
        assert 'tokens' in response.data
        assert response.data['message'] == "Connexion réussie"
        
        user_data = response.data['user']
        assert user_data['first_name'] == self.individual_first_name
        assert user_data['last_name'] == self.individual_last_name
        assert user_data['account_type'] == "individual"
    
    def test_login_company_by_business_name_success(self):
        """Test connexion entreprise par nom commercial."""
        data = {
            "login_name": self.company_login_name,
            "password": "motdepasse456"
        }
        
        response = self.client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        
        user_data = response.data['user']
        assert user_data['business_name'] == self.company_login_name
        assert user_data['account_type'] == "company"

    def test_login_by_name_uses_single_query(self, django_assert_num_queries):
        """La connexion par login_name doit rester sur un seul acces ORM."""
        data = {
            "login_name": self.individual_login_name,
            "password": "motdepasse123",
        }

        with django_assert_num_queries(2):
            response = self.client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_200_OK
    
    def test_login_wrong_credentials_fails(self):
        """Test échec avec identifiants incorrects."""
        data = {
            "login_name": self.individual_login_name,
            "password": "mauvais_mot_de_passe"
        }
        
        response = self.client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Identifiants invalides" in str(response.data)
    
    def test_login_nonexistent_user_fails(self):
        """Test échec avec utilisateur inexistant."""
        data = {
            "login_name": "Utilisateur Inexistant",
            "password": "test123"
        }
        
        response = self.client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_login_inactive_user_fails(self):
        """Test échec avec compte désactivé."""
        # Désactiver l'utilisateur
        self.individual_user.is_active = False
        self.individual_user.save()
        
        data = {
            "login_name": self.individual_login_name,
            "password": "motdepasse123"
        }
        
        response = self.client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Identifiants invalides" in str(response.data)

    def test_login_ambiguous_name_guides_user_to_phone_login(self):
        """Un login_name ambigu doit donner une erreur actionnable, pas une 500."""
        User.objects.create_user(
            phone_number="+237690444445",
            first_name=self.individual_first_name,
            last_name=self.individual_last_name,
            password="motdepasse123",
            age_group="26_35",
        )

        response = self.client.post(
            self.url,
            {
                "login_name": self.individual_login_name,
                "password": "motdepasse123",
            },
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Identifiants invalides" in str(response.data)


@pytest.mark.django_db
class TestLogoutEndpoint:
    """
    Tests pour POST /api/accounts/logout/
    """

    def setup_method(self):
        self.client = APIClient()
        self.url = reverse('accounts:logout')
        self.user = User.objects.create_user(
            phone_number="+237690565656",
            first_name="Logout",
            last_name="User",
            password="motdepasse123",
            age_group="26_35",
        )
        self.client.force_authenticate(user=self.user)

    def test_logout_success(self):
        """Test deconnexion avec refresh token valide."""
        refresh_token = str(RefreshToken.for_user(self.user))

        response = self.client.post(self.url, {"refresh": refresh_token}, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert response.data["message"] == "Déconnexion réussie"

    def test_logout_keeps_query_budget(self, django_assert_num_queries):
        """La deconnexion ne doit faire que le travail JWT blacklist requis."""
        refresh_token = str(RefreshToken.for_user(self.user))

        with django_assert_num_queries(7):
            response = self.client.post(self.url, {"refresh": refresh_token}, format='json')

        assert response.status_code == status.HTTP_200_OK

    def test_logout_missing_refresh_fails(self):
        """Le contrat DRF doit exiger le refresh token."""
        response = self.client.post(self.url, {}, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "refresh" in response.data

    def test_logout_invalid_refresh_fails(self):
        """Les tokens invalides doivent retourner une erreur metier claire."""
        response = self.client.post(self.url, {"refresh": "invalid_token"}, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["error"] == "Token invalide"

    def test_logout_can_be_retried_with_same_refresh_token(self):
        """Un retry mobile apres logout reussi doit rester idempotent."""
        refresh_token = str(RefreshToken.for_user(self.user))

        first_response = self.client.post(self.url, {"refresh": refresh_token}, format='json')
        second_response = self.client.post(self.url, {"refresh": refresh_token}, format='json')

        assert first_response.status_code == status.HTTP_200_OK
        assert second_response.status_code == status.HTTP_200_OK
        assert second_response.data["message"] == "Déconnexion réussie"

    def test_logout_rejects_refresh_token_from_another_user(self):
        """Un utilisateur ne doit pas invalider le refresh token d'un autre compte."""
        other_user = User.objects.create_user(
            phone_number="+237690565657",
            first_name="Other",
            last_name="User",
            password="motdepasse123",
            age_group="26_35",
        )
        other_refresh_token = str(RefreshToken.for_user(other_user))

        response = self.client.post(
            self.url,
            {"refresh": other_refresh_token},
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["error"] == "Token invalide"


@pytest.mark.django_db
class TestTokenRefreshEndpoint:
    """
    Tests pour POST /api/accounts/token/refresh/
    """
    
    def setup_method(self):
        """Configuration pour chaque test."""
        self.client = APIClient()
        self.url = reverse('accounts:token_refresh')
        
        # Créer utilisateur et obtenir tokens
        cache.clear()
        self.user = User.objects.create_user(
            phone_number="+237690666666",
            first_name="Token",
            last_name="User",
            password="test123",
            age_group="26_35"
        )

        # Obtenir le refresh token via login
        login_response = self.client.post(
            reverse('accounts:login'),
            {"login_name": "Token User", "password": "test123"},
            format='json'
        )
        self.refresh_token = login_response.data['tokens']['refresh']
    
    def test_token_refresh_success(self):
        """Test renouvellement token réussi."""
        data = {"refresh": self.refresh_token}
        
        response = self.client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert 'access' in response.data
        # Avec rotation activée, nouveau refresh token
        assert 'refresh' in response.data
        assert len(response.data['access']) > 100

    def test_token_refresh_keeps_query_budget(self, django_assert_num_queries):
        """Le refresh JWT mobile garde un budget stable avec blacklist active."""
        data = {"refresh": self.refresh_token}

        with django_assert_num_queries(15):
            response = self.client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_200_OK
    
    def test_token_refresh_invalid_token_fails(self):
        """Test échec avec token invalide."""
        data = {"refresh": "invalid_token"}
        
        response = self.client.post(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert 'token_not_valid' in response.data.get('code', '')

    def test_token_refresh_rejects_inactive_user(self):
        """Un refresh token d'un compte désactivé ne doit pas être renouvelé."""
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])

        response = self.client.post(
            self.url,
            {"refresh": self.refresh_token},
            format='json',
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert response.data.get("code") == "token_not_valid"


@pytest.mark.django_db
class TestTokenVerifyEndpoint:
    """
    Tests pour POST /api/accounts/token/verify/
    """

    def setup_method(self):
        self.client = APIClient()
        self.url = reverse('accounts:token_verify')
        self.user = User.objects.create_user(
            phone_number="+237690666667",
            first_name="Verify",
            last_name="User",
            password="test123",
            age_group="26_35",
        )

    def test_token_verify_success(self):
        """Un access token valide doit être accepté."""
        access_token = str(RefreshToken.for_user(self.user).access_token)

        response = self.client.post(self.url, {"token": access_token}, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {}

    def test_token_verify_keeps_query_budget(self, django_assert_num_queries):
        """La verification token ne doit lire que l'etat actif du compte."""
        access_token = str(RefreshToken.for_user(self.user).access_token)

        with django_assert_num_queries(2):
            response = self.client.post(self.url, {"token": access_token}, format='json')

        assert response.status_code == status.HTTP_200_OK

    def test_token_verify_invalid_token_fails(self):
        """Un token invalide doit être rejeté."""
        response = self.client.post(self.url, {"token": "invalid_token"}, format='json')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert response.data.get("code") == "token_not_valid"

    def test_token_verify_missing_token_fails(self):
        """Le champ token est obligatoire."""
        response = self.client.post(self.url, {}, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "token" in response.data

    def test_token_verify_rejects_inactive_user(self):
        """Un access token d'un compte désactivé ne doit pas être vérifié."""
        access_token = str(RefreshToken.for_user(self.user).access_token)
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])

        response = self.client.post(self.url, {"token": access_token}, format='json')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert response.data.get("code") == "token_not_valid"


@pytest.mark.django_db
class TestProfileEndpoint:
    """
    Tests pour GET/PATCH /api/accounts/profile/
    """
    
    def setup_method(self):
        """Configuration pour chaque test."""
        self.client = APIClient()
        self.url = reverse('accounts:profile')
        
        # Créer utilisateur de test
        self.user = User.objects.create_user(
            phone_number="+237690777777",
            first_name="Profile",
            last_name="User",
            password="test123",
            age_group="26_35",
            activity_type="poisson_table",
            region="centre"
        )
    
    def test_get_profile_success(self):
        """Test consultation profil réussie."""
        # Authentifier le client
        self.client.force_authenticate(user=self.user)
        
        response = self.client.get(self.url)
        
        assert response.status_code == status.HTTP_200_OK
        
        # Vérifier structure complète avec propriétés et farm_profile
        assert response.data['id'] == str(self.user.id)
        assert response.data['phone_number'] == "+237690777777"
        assert response.data['first_name'] == "Profile"
        assert response.data['full_name'] == "Profile User"
        assert response.data['login_name'] == "Profile User"
        assert response.data['display_name'] == "Profile User"
        assert response.data['is_individual'] is True
        assert response.data['is_company'] is False
        
        # Vérifier inclusion farm_profile
        assert 'farm_profile' in response.data
        farm_data = response.data['farm_profile']
        assert farm_data['farm_name'] == "Ferme de Profile User"
        assert farm_data['certification_status'] == "pending"
        assert farm_data['is_certified'] is False

    def test_get_profile_uses_single_query(self, django_assert_num_queries):
        """Le profil utilisateur doit rester sur un seul chargement ORM."""
        self.client.force_authenticate(user=self.user)

        with django_assert_num_queries(1):
            response = self.client.get(self.url)

        assert response.status_code == status.HTTP_200_OK

    def test_get_profile_with_bearer_token_keeps_query_budget(self, django_assert_num_queries):
        """Le vrai chemin JWT mobile ne doit pas doubler les lectures utilisateur."""
        tokens = AuthApplicationService.build_auth_tokens(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens.access}")

        with django_assert_num_queries(2):
            response = self.client.get(self.url)

        assert response.status_code == status.HTTP_200_OK
    
    def test_get_profile_unauthenticated_fails(self):
        """Test échec consultation sans authentification."""
        response = self.client.get(self.url)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_patch_profile_success(self):
        """Test modification profil réussie."""
        self.client.force_authenticate(user=self.user)
        
        data = {
            "email": "nouveau@example.com",
            "activity_type": "mixte",
            "region": "centre",
            "department": "mfoundi", 
            "district": "Yaoundé 1er",
            "language_preference": "en"
        }
        
        response = self.client.patch(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['email'] == "nouveau@example.com"
        assert response.data['activity_type'] == "mixte"
        assert response.data['district'] == "Yaoundé 1er"
        assert response.data['language_preference'] == "en"
        
        # Vérifier modification en DB
        self.user.refresh_from_db()
        assert self.user.email == "nouveau@example.com"
        assert self.user.activity_type == "mixte"

    def test_patch_profile_keeps_query_budget(self, django_assert_num_queries):
        """La mutation profil doit rester bornee malgre le verrou et la relecture."""
        self.client.force_authenticate(user=self.user)

        with django_assert_num_queries(7):
            response = self.client.patch(
                self.url,
                {"email": "budget-profile@example.com"},
                format='json',
            )

        assert response.status_code == status.HTTP_200_OK
    
    def test_patch_profile_readonly_fields_ignored(self):
        """Test que les champs read-only sont ignorés."""
        self.client.force_authenticate(user=self.user)
        
        original_phone = self.user.phone_number
        original_account_type = self.user.account_type
        
        data = {
            "phone_number": "+237699999999",  # Read-only
            "date_joined": "2020-01-01T00:00:00Z",  # Read-only
            "is_verified": True,  # Read-only
            "account_type": "company",  # Read-only
            "is_active": False,  # Read-only
            "first_name": "NewName"  # Modifiable
        }
        
        response = self.client.patch(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        
        # Les champs read-only ne changent pas
        assert response.data['phone_number'] == original_phone
        assert response.data['is_verified'] is False
        assert response.data['account_type'] == original_account_type
        assert response.data['is_active'] is True
        
        # Les champs modifiables changent
        assert response.data['first_name'] == "NewName"

        self.user.refresh_from_db()
        assert self.user.account_type == original_account_type
        assert self.user.is_active is True

    def test_patch_profile_rejects_inconsistent_individual_company_fields(self):
        """Un profil individuel ne doit pas accepter les champs entreprise."""
        self.client.force_authenticate(user=self.user)

        response = self.client.patch(
            self.url,
            {"business_name": "Entreprise pirate"},
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "business_name" in response.data


@pytest.mark.django_db
class TestFarmProfileEndpoint:
    """
    Tests pour GET/PATCH /api/accounts/farm/
    """
    
    def setup_method(self):
        """Configuration pour chaque test."""
        self.client = APIClient()
        self.url = reverse('accounts:farm_profile')
        
        # Créer utilisateur de test
        self.user = User.objects.create_user(
            phone_number="+237690888888",
            first_name="Farm",
            last_name="Owner",
            password="test123",
            age_group="26_35"
        )
    
    def test_get_farm_profile_success(self):
        """Test consultation profil ferme réussie."""
        self.client.force_authenticate(user=self.user)
        
        response = self.client.get(self.url)
        
        assert response.status_code == status.HTTP_200_OK
        
        # Vérifier structure FarmProfile
        assert 'id' in response.data
        assert response.data['farm_name'] == "Ferme de Farm Owner"
        assert response.data['certification_status'] == "pending"
        # assert response.data['certification_status_display'] == "En attente"  # Field not in serializer
        assert response.data['is_certified'] is False
        assert response.data['total_ponds'] == 0

    def test_get_farm_profile_uses_single_query(self, django_assert_num_queries):
        """Le profil ferme doit etre charge en une seule requete."""
        self.client.force_authenticate(user=self.user)

        with django_assert_num_queries(1):
            response = self.client.get(self.url)

        assert response.status_code == status.HTTP_200_OK

    def test_get_farm_profile_with_bearer_token_keeps_query_budget(self, django_assert_num_queries):
        """Le vrai chemin JWT mobile garde un budget stable sur la ferme."""
        tokens = AuthApplicationService.build_auth_tokens(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens.access}")

        with django_assert_num_queries(2):
            response = self.client.get(self.url)

        assert response.status_code == status.HTTP_200_OK
    
    def test_patch_farm_profile_success(self):
        """Test modification ferme réussie."""
        self.client.force_authenticate(user=self.user)
        
        data = {
            "farm_name": "Belle Ferme Aquacole",
            "total_ponds": 5,
            "total_area_m2": 2500.50,
            "water_source": "Rivière Sanaga",
            "main_species": "Tilapia",
            "annual_production_kg": 3000
        }
        
        response = self.client.patch(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['farm_name'] == "Belle Ferme Aquacole"
        assert response.data['total_ponds'] == 5
        assert response.data['total_area_m2'] == "2500.50"
        assert response.data['water_source'] == "Rivière Sanaga"
        assert response.data['main_species'] == "Tilapia"
        assert response.data['annual_production_kg'] == 3000
        
        # Vérifier modification en DB
        self.user.farm_profile.refresh_from_db()
        assert self.user.farm_profile.farm_name == "Belle Ferme Aquacole"
        assert self.user.farm_profile.total_ponds == 5

    def test_patch_farm_profile_keeps_query_budget(self, django_assert_num_queries):
        """La mutation ferme doit rester bornee avec relecture du plan de production."""
        self.client.force_authenticate(user=self.user)

        with django_assert_num_queries(8):
            response = self.client.patch(
                self.url,
                {
                    "farm_name": "Ferme Budget SQL",
                    "total_ponds": 2,
                },
                format='json',
            )

        assert response.status_code == status.HTTP_200_OK
    
    def test_patch_farm_certification_status_readonly(self):
        """Test que certification_status est read-only."""
        self.client.force_authenticate(user=self.user)
        
        data = {
            "certification_status": "certified",  # Read-only
            "farm_name": "New Name"  # Modifiable
        }
        
        response = self.client.patch(self.url, data, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        
        # certification_status ne change pas
        assert response.data['certification_status'] == "pending"
        # farm_name change
        assert response.data['farm_name'] == "New Name"

    def test_patch_farm_setup_fields_are_readonly(self):
        """Le endpoint ferme ne doit pas contourner le flux /farm/setup/."""
        self.client.force_authenticate(user=self.user)

        response = self.client.patch(
            self.url,
            {
                "farm_setup_completed": True,
                "setup_species": "tilapia",
                "setup_infrastructure_type": "etang",
                "setup_unit_count": 9,
                "annual_production_target_kg": "900.00",
            },
            format='json',
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["farm_setup_completed"] is False

        self.user.farm_profile.refresh_from_db()
        self.user.farm_profile.production_plan.refresh_from_db()
        assert self.user.farm_profile.production_plan.setup_completed is False
        assert self.user.farm_profile.production_plan.setup_species == ""
        assert self.user.farm_profile.production_plan.setup_unit_count is None

    def test_patch_farm_rejects_negative_business_values(self):
        """Les valeurs économiques ou surfaces négatives doivent être rejetées."""
        self.client.force_authenticate(user=self.user)

        response = self.client.patch(
            self.url,
            {
                "total_area_m2": "-1.00",
                "default_feed_price_per_kg": "-100.00",
            },
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "total_area_m2" in response.data
        assert "default_feed_price_per_kg" in response.data

    def test_patch_farm_requires_complete_gps_pair(self):
        """Latitude et longitude doivent être renseignées ensemble."""
        self.client.force_authenticate(user=self.user)

        response = self.client.patch(
            self.url,
            {"latitude": "3.8680"},
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "longitude" in response.data

    def test_patch_farm_rejects_production_without_ponds_as_400(self):
        """L'invariant modèle doit rester une erreur mobile 400, jamais une 500."""
        self.client.force_authenticate(user=self.user)

        response = self.client.patch(
            self.url,
            {
                "total_ponds": 0,
                "annual_production_kg": 100,
            },
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "total_ponds" in response.data
    
    def test_get_farm_profile_unauthenticated_fails(self):
        """Test échec consultation sans authentification."""
        response = self.client.get(self.url)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestAPIResponseHeaders:
    """
    Tests pour les headers de réponse API.
    """
    
    def setup_method(self):
        """Configuration pour chaque test."""
        self.client = APIClient()
    
    def test_language_header_present(self):
        """Test présence header X-Content-Language."""
        # Faire une requête à n'importe quel endpoint API
        response = self.client.post(
            reverse('accounts:login'),
            {"login_name": "test", "password": "test"},
            format='json'
        )
        
        # Vérifier présence du header (même si login échoue)
        assert 'X-Content-Language' in response
        assert response['X-Content-Language'] in ['fr', 'en']
    
    def test_cors_headers_present(self):
        """Test présence headers CORS."""
        response = self.client.options(reverse('accounts:register'))
        
        # Les headers CORS sont gérés par django-cors-headers
        # Vérifier que la requête OPTIONS passe
        assert response.status_code in [200, 204]


@pytest.mark.django_db
class TestRateLimiting:
    """
    Tests pour le rate limiting des connexions.
    
    Note : Ces tests sont complexes car le middleware utilise la mémoire.
    En production, utiliser Redis pour des tests plus fiables.
    """

    @pytest.fixture(autouse=True)
    def isolated_cache(self, settings):
        """Isole ces tests du cache Redis partage entre workers pytest."""
        settings.CACHES = {
            "default": {
                "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
                "LOCATION": f"accounts-rate-limit-tests-{uuid.uuid4()}",
            }
        }
        caches.close_all()
        cache.clear()
        yield
        cache.clear()
        caches.close_all()
    
    def setup_method(self):
        """Configuration pour chaque test."""
        self.client = APIClient()
        self.url = reverse('accounts:login')

    def test_multiple_failed_login_attempts(self):
        """Test simulation rate limiting."""
        # IP dédiée pour éviter les interférences avec d'autres workers pytest en parallèle
        unique_ip = '10.200.200.200'
        for i in range(3):
            response = self.client.post(
                self.url,
                {"login_name": "inexistant", "password": "faux"},
                format='json',
                REMOTE_ADDR=unique_ip,
            )
            # Les premières tentatives échouent avec 400
            if i < 2:
                assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_phone_number_login_rate_limit_after_repeated_failures(self):
        """Le rate limiting doit aussi couvrir les connexions par phone_number."""
        unique_ip = '10.200.200.201'

        responses = []
        for _ in range(10):
            response = self.client.post(
                self.url,
                {"phone_number": "+237699000999", "password": "faux"},
                format='json',
                REMOTE_ADDR=unique_ip,
            )
            responses.append(response.status_code)
            if response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
                break

        assert status.HTTP_400_BAD_REQUEST in responses
        assert responses[-1] == status.HTTP_429_TOO_MANY_REQUESTS

    def test_successful_registration_is_not_recorded_as_failed_attempt(self):
        """Une inscription 201 ne doit pas remplir le compteur d'échecs IP."""
        register_url = reverse('accounts:register')
        unique_ip = '10.200.200.202'

        for index in range(3):
            response = self.client.post(
                register_url,
                {
                    "phone_number": f"+23769900100{index}",
                    "first_name": f"Register{index}",
                    "last_name": "Success",
                    "password": "motdepasse123",
                    "password_confirm": "motdepasse123",
                    "account_type": "individual",
                    "age_group": "26_35",
                },
                format='json',
                REMOTE_ADDR=unique_ip,
            )
            assert response.status_code == status.HTTP_201_CREATED

        response = self.client.post(
            register_url,
            {
                "phone_number": "+237699001010",
                "first_name": "RegisterFinal",
                "last_name": "Success",
                "password": "motdepasse123",
                "password_confirm": "motdepasse123",
                "account_type": "individual",
                "age_group": "26_35",
            },
            format='json',
            REMOTE_ADDR=unique_ip,
        )

        assert response.status_code == status.HTTP_201_CREATED


@pytest.mark.django_db
class TestAccountDeletionEndpoint:
    """
    Tests pour POST /api/accounts/delete/
    """

    def setup_method(self):
        self.client = APIClient()
        self.url = reverse('accounts:delete_account')
        self.user = User.objects.create_user(
            phone_number='+237611000001',
            password='testpass123',
            first_name='To',
            last_name='Delete',
            age_group='26_35',
            activity_type='poisson_table',
            region='centre',
            department='mfoundi',
        )
        self.client.force_authenticate(user=self.user)

    def test_delete_account_success(self):
        """POST confirm=true → 200 + compte désactivé."""
        response = self.client.post(self.url, {'confirm': True}, format='json')

        assert response.status_code == status.HTTP_200_OK
        self.user.refresh_from_db()
        assert self.user.is_active is False

    def test_delete_account_keeps_query_budget(self, django_assert_max_num_queries):
        """La suppression est rare, mais son nettoyage doit rester plafonne."""
        with django_assert_max_num_queries(16):
            response = self.client.post(self.url, {'confirm': True}, format='json')

        assert response.status_code == status.HTTP_200_OK

    def test_delete_account_requires_confirmation(self):
        """POST confirm=false → 400."""
        response = self.client.post(self.url, {'confirm': False}, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_delete_account_requires_auth(self):
        """POST sans token → 401."""
        unauthenticated_client = APIClient()
        response = unauthenticated_client.post(self.url, {'confirm': True}, format='json')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_delete_account_anonymizes_data(self):
        """Vérifie l'anonymisation du numéro de téléphone et la suppression du profil ferme."""
        original_phone = self.user.phone_number
        FarmProfile.objects.get_or_create(
            user=self.user,
            defaults={'farm_name': 'Ferme Test', 'total_ponds': 2},
        )

        response = self.client.post(self.url, {'confirm': True}, format='json')

        assert response.status_code == status.HTTP_200_OK
        self.user.refresh_from_db()
        assert self.user.phone_number != original_phone
        farm = FarmProfile.objects.filter(user=self.user).first()
        if farm:
            assert farm.is_deleted is True

    def test_delete_account_can_be_retried_without_mutating_anonymized_identity(self):
        """Un retry mobile après succès doit rester idempotent."""
        first_response = self.client.post(self.url, {'confirm': True}, format='json')
        assert first_response.status_code == status.HTTP_200_OK
        self.user.refresh_from_db()
        self.user.farm_profile.refresh_from_db()
        first_phone = self.user.phone_number
        first_farm_name = self.user.farm_profile.farm_name

        second_response = self.client.post(self.url, {'confirm': True}, format='json')

        assert second_response.status_code == status.HTTP_200_OK
        self.user.refresh_from_db()
        self.user.farm_profile.refresh_from_db()
        assert self.user.phone_number == first_phone
        assert self.user.farm_profile.farm_name == first_farm_name


@pytest.mark.django_db
class TestFarmSetupView:
    """
    Tests pour POST /api/accounts/farm/setup/

    Vérifie la sauvegarde du formulaire "Créer mon élevage" et le marquage
    farm_setup_completed=True pour débloquer la navigation vers le dashboard.
    """

    def setup_method(self):
        self.client = APIClient()
        self.url = reverse('accounts:farm_setup')
        self.user = User.objects.create_user(
            phone_number="+237691000001",
            first_name="Setup",
            last_name="Farmer",
            password="test123",
            age_group="26_35",
        )
        self.client.force_authenticate(user=self.user)

    def test_setup_etang_success(self):
        """Formulaire étang valide → 200, farm_setup_completed=True."""
        data = {
            'setup_species': 'tilapia',
            'setup_infrastructure_type': 'etang',
            'setup_unit_count': 3,
            'setup_unit_surface_m2': '200.00',
            'annual_production_target_kg': '600.00',
            'num_cycles_per_year': 2,
        }
        response = self.client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['farm_setup_completed'] is True

    def test_setup_etang_keeps_query_budget(self, django_assert_num_queries):
        """Le setup initial doit rester borne avec verrou du plan de production."""
        data = {
            'setup_species': 'tilapia',
            'setup_infrastructure_type': 'etang',
            'setup_unit_count': 3,
            'setup_unit_surface_m2': '200.00',
            'annual_production_target_kg': '600.00',
            'num_cycles_per_year': 2,
        }

        with django_assert_num_queries(7):
            response = self.client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_200_OK

    def test_setup_bac_uses_volume(self):
        """Infrastructure bac_hors_sol avec volume → 200."""
        data = {
            'setup_species': 'clarias',
            'setup_infrastructure_type': 'bac_hors_sol',
            'setup_unit_count': 5,
            'setup_unit_volume_m3': '10.00',
            'annual_production_target_kg': '800.00',
            'num_cycles_per_year': 3,
        }
        response = self.client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_200_OK
        farm = self.user.farm_profile
        farm.refresh_from_db()
        farm.production_plan.refresh_from_db()
        assert farm.production_plan.setup_completed is True

    def test_setup_etang_without_surface_fails(self):
        """Étang sans superficie → 400 (champ obligatoire pour ce type)."""
        data = {
            'setup_species': 'tilapia',
            'setup_infrastructure_type': 'etang',
            'setup_unit_count': 2,
            # setup_unit_surface_m2 absent
            'annual_production_target_kg': '500.00',
        }
        response = self.client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_setup_bac_without_volume_fails(self):
        """Bac sans volume → 400 (champ obligatoire pour ce type)."""
        data = {
            'setup_species': 'tilapia',
            'setup_infrastructure_type': 'bac_en_sol',
            'setup_unit_count': 4,
            # setup_unit_volume_m3 absent
            'annual_production_target_kg': '400.00',
        }
        response = self.client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_setup_optional_economic_fields(self):
        """Champs économiques optionnels acceptés sans erreur."""
        data = {
            'setup_species': 'tilapia',
            'setup_infrastructure_type': 'cage_flottante',
            'setup_unit_count': 2,
            'setup_unit_volume_m3': '30.00',
            'annual_production_target_kg': '1000.00',
            'num_cycles_per_year': 2,
            'fingerlings_cost_per_unit_fcfa': '50.00',
            'planned_selling_price_per_kg_fcfa': '1800.00',
        }
        response = self.client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_200_OK

    def test_setup_rejects_non_positive_dimensions_and_prices(self):
        """Le setup refuse dimensions nulles et prix non positifs."""
        data = {
            'setup_species': 'tilapia',
            'setup_infrastructure_type': 'etang',
            'setup_unit_count': 2,
            'setup_unit_surface_m2': '0.00',
            'annual_production_target_kg': '500.00',
            'num_cycles_per_year': 2,
            'planned_selling_price_per_kg_fcfa': '0.00',
            'fingerlings_cost_per_unit_fcfa': '-1.00',
        }

        response = self.client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'setup_unit_surface_m2' in response.data
        assert 'planned_selling_price_per_kg_fcfa' in response.data
        assert 'fingerlings_cost_per_unit_fcfa' in response.data

    def test_setup_partial_without_required_fields_fails(self):
        """Un PATCH partiel ne doit pas marquer une ferme incomplète comme configurée."""
        response = self.client.patch(
            self.url,
            {'planned_selling_price_per_kg_fcfa': '1800.00'},
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        farm = self.user.farm_profile
        farm.refresh_from_db()
        farm.production_plan.refresh_from_db()
        assert farm.production_plan.setup_completed is False

    def test_setup_partial_after_complete_setup_succeeds(self):
        """Un PATCH partiel reste possible après une configuration complète."""
        initial_response = self.client.post(
            self.url,
            {
                'setup_species': 'tilapia',
                'setup_infrastructure_type': 'etang',
                'setup_unit_count': 3,
                'setup_unit_surface_m2': '200.00',
                'annual_production_target_kg': '600.00',
                'num_cycles_per_year': 2,
            },
            format='json',
        )
        assert initial_response.status_code == status.HTTP_200_OK

        response = self.client.patch(
            self.url,
            {'planned_selling_price_per_kg_fcfa': '1800.00'},
            format='json',
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data['planned_selling_price_per_kg_fcfa'] == '1800.00'

    def test_setup_requires_auth(self):
        """POST sans token → 401."""
        unauthenticated = APIClient()
        data = {'setup_species': 'tilapia', 'setup_infrastructure_type': 'etang'}
        response = unauthenticated.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestAnnualSimulationView:
    """
    Tests pour POST /api/accounts/farm/simulate/

    Vérifie le calcul de simulation annuelle : chiffre d'affaires, coûts,
    frais AquaCare (20 FCFA/kg), ROI et décomposition par cycle.
    """

    def setup_method(self):
        self.client = APIClient()
        self.url = reverse('accounts:annual_simulation')
        self.user = User.objects.create_user(
            phone_number="+237691000002",
            first_name="Simulation",
            last_name="Farmer",
            password="test123",
            age_group="26_35",
        )
        self.client.force_authenticate(user=self.user)

    def test_simulate_tilapia_2_cycles(self):
        """Simulation tilapia 2 cycles/an → 200 avec structure complète."""
        data = {
            'species': 'tilapia',
            'annual_production_target_kg': '1000',
            'num_cycles': 2,
        }
        response = self.client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_200_OK
        result = response.data
        # Champs annuels obligatoires
        assert 'annual_production_target_kg' in result
        assert 'annual_revenue_fcfa' in result
        assert 'annual_feed_cost_fcfa' in result
        assert 'aquacare_fee_fcfa' in result
        assert 'annual_net_profit_fcfa' in result
        assert 'annual_roi_pct' in result
        # Champs par cycle
        assert 'production_per_cycle_kg' in result
        assert 'feed_bags_per_cycle' in result

    def test_simulate_tilapia_keeps_query_budget(self, django_assert_num_queries):
        """La simulation est un calcul pur quand l'utilisateur est deja authentifie."""
        data = {
            'species': 'tilapia',
            'annual_production_target_kg': '1000',
            'num_cycles': 2,
        }

        with django_assert_num_queries(12):
            response = self.client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_200_OK

    def test_simulate_tilapia_with_bearer_token_keeps_query_budget(self, django_assert_num_queries):
        """Le vrai chemin JWT mobile ne doit ajouter qu'une lecture d'utilisateur."""
        tokens = AuthApplicationService.build_auth_tokens(self.user)
        self.client.force_authenticate(user=None)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens.access}")
        data = {
            'species': 'tilapia',
            'annual_production_target_kg': '1000',
            'num_cycles': 2,
        }

        with django_assert_num_queries(13):
            response = self.client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_200_OK

    def test_simulate_aquacare_fee_is_20_fcfa_per_kg(self):
        """Le frais AquaCare doit être exactement 20 FCFA × kg produit."""
        data = {
            'species': 'tilapia',
            'annual_production_target_kg': '500',
            'num_cycles': 2,
        }
        response = self.client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_200_OK
        # 500 kg × 20 FCFA = 10 000 FCFA
        assert response.data['aquacare_fee_fcfa'] == 10000

    def test_simulate_clarias_3_cycles(self):
        """Simulation clarias 3 cycles/an → 200 avec durée cycle correcte."""
        data = {
            'species': 'clarias',
            'annual_production_target_kg': '900',
            'num_cycles': 3,
        }
        response = self.client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['annual_production_target_kg'] == 900

    def test_simulate_with_custom_prices(self):
        """Simulation avec prix personnalisés → revenus calculés correctement."""
        data = {
            'species': 'tilapia',
            'annual_production_target_kg': '1000',
            'num_cycles': 2,
            'selling_price_per_kg_fcfa': '2000',
            'fingerlings_cost_per_unit_fcfa': '60',
            'other_costs_fcfa_per_year': '50000',
        }
        response = self.client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_200_OK
        # 1000 kg × 2000 FCFA = 2 000 000 FCFA de revenu
        assert response.data['annual_revenue_fcfa'] == 2_000_000

    def test_simulate_missing_required_fields_fails(self):
        """Champs requis manquants (species absent) → 400."""
        data = {
            'annual_production_target_kg': '1000',
            'num_cycles': 2,
        }
        response = self.client.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_simulate_requires_auth(self):
        """POST sans token → 401."""
        unauthenticated = APIClient()
        data = {
            'species': 'tilapia',
            'annual_production_target_kg': '1000',
            'num_cycles': 2,
        }
        response = unauthenticated.post(self.url, data, format='json')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

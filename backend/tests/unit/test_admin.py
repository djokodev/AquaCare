"""
Tests unitaires pour l'interface d'administration Django.

Teste les fonctionnalités administratives MAVECAM.
"""
import pytest
from django.contrib.admin.sites import AdminSite
from django.contrib.auth import get_user_model
from django.http import HttpRequest
from django.test import RequestFactory
from unittest.mock import Mock, patch
from accounts.admin import UserAdmin, FarmProfileAdmin
from accounts.models import FarmProfile

User = get_user_model()


@pytest.mark.django_db
class TestUserAdmin:
    """
    Tests pour l'interface admin des utilisateurs.
    """
    
    def setup_method(self):
        """Configuration pour chaque test."""
        self.site = AdminSite()
        self.admin = UserAdmin(User, self.site)
        self.factory = RequestFactory()
    
    def test_list_display_fields(self):
        """Test champs affichés dans la liste."""
        expected_fields = (
            'phone_number', 'display_name', 'account_type', 'activity_type',
            'region', 'is_verified', 'farm_certification_status', 'date_joined'
        )
        assert self.admin.list_display == expected_fields
    
    def test_search_fields_configured(self):
        """Test champs de recherche configurés."""
        expected_fields = (
            'phone_number', 'first_name', 'last_name', 'business_name',
            'email', 'farm_profile__farm_name'
        )
        assert self.admin.search_fields == expected_fields
    
    def test_list_filter_configured(self):
        """Test filtres de liste configurés."""
        expected_filters = (
            'account_type', 'activity_type', 'region', 'is_verified', 
            'is_active', 'date_joined', 'farm_profile__certification_status'
        )
        assert self.admin.list_filter == expected_filters
    
    def test_farm_certification_status_display_certified(self):
        """Test affichage statut certification certifié."""
        user = User.objects.create_user(
            phone_number='+237690123456',
            first_name='Jean',
            last_name='Farmer',
            password='test123',
            age_group='26_35'
        )
        
        # Certifier la ferme
        user.farm_profile.certification_status = 'certified'
        user.farm_profile.save()
        
        result = self.admin.farm_certification_status(user)
        
        assert 'green' in result
        assert 'Certifiée' in result
    
    def test_farm_certification_status_display_pending(self):
        """Test affichage statut certification en attente."""
        user = User.objects.create_user(
            phone_number='+237691234567',
            first_name='Marie',
            last_name='Fermiere',
            password='test123',
            age_group='36_45'
        )
        
        result = self.admin.farm_certification_status(user)
        
        assert 'orange' in result
        assert 'En attente' in result
    
    def test_farm_certification_status_no_farm_profile(self):
        """Test affichage quand pas de profil ferme."""
        # Créer un superuser (pas de farm_profile)
        user = User.objects.create_superuser(
            phone_number='+237699000000',
            first_name='Admin',
            last_name='MAVECAM',
            password='admin123'
        )
        
        result = self.admin.farm_certification_status(user)
        assert result == '-'
    
    def test_verify_users_action(self):
        """Test action de vérification des utilisateurs."""
        users = []
        for i in range(3):
            user = User.objects.create_user(
                phone_number=f'+23769000{i:04d}',
                first_name=f'User{i}',
                last_name='Test',
                password='test123',
                age_group='26_35',
                is_verified=False
            )
            users.append(user)
        
        # Mock request et queryset
        request = Mock()
        queryset = User.objects.filter(pk__in=[u.pk for u in users])
        
        # Mock message_user method
        self.admin.message_user = Mock()
        
        # Exécuter l'action
        self.admin.verify_users(request, queryset)
        
        # Vérifier que tous les utilisateurs sont vérifiés
        for user in users:
            user.refresh_from_db()
            assert user.is_verified is True
        
        # Vérifier le message
        self.admin.message_user.assert_called_once()
        args, kwargs = self.admin.message_user.call_args
        assert '3 utilisateur(s) vérifié(s)' in args[1]
    
    def test_certify_farms_action(self):
        """Test action de certification des fermes."""
        users = []
        for i in range(2):
            user = User.objects.create_user(
                phone_number=f'+23769100{i:04d}',
                first_name=f'Farmer{i}',
                last_name='Test',
                account_type='individual',
                age_group='26_35',
                password='test123'
            )
            users.append(user)
        
        request = Mock()
        queryset = User.objects.filter(pk__in=[u.pk for u in users])
        self.admin.message_user = Mock()
        
        # Exécuter l'action
        self.admin.certify_farms(request, queryset)
        
        # Vérifier que toutes les fermes sont certifiées
        for user in users:
            user.refresh_from_db()
            assert user.farm_profile.certification_status == 'certified'
        
        self.admin.message_user.assert_called_once()
    
    def test_suspend_certifications_action(self):
        """Test action de suspension des certifications."""
        user = User.objects.create_user(
            phone_number='+237692000000',
            first_name='Suspended',
            last_name='User',
            account_type='individual',
            age_group='26_35',
            password='test123'
        )
        
        # Certifier d'abord
        user.farm_profile.certification_status = 'certified'
        user.farm_profile.save()
        
        request = Mock()
        queryset = User.objects.filter(pk=user.pk)
        self.admin.message_user = Mock()
        
        # Suspendre
        self.admin.suspend_certifications(request, queryset)
        
        user.refresh_from_db()
        assert user.farm_profile.certification_status == 'suspended'
    
    def test_export_csv_action(self):
        """Test action d'export CSV."""
        user = User.objects.create_user(
            phone_number='+237693000000',
            first_name='Export',
            last_name='Test',
            password='test123',
            age_group='26_35',
            region='centre',
            activity_type='poisson_table'
        )
        
        request = Mock()
        queryset = User.objects.filter(pk=user.pk)
        
        response = self.admin.export_csv(request, queryset)
        
        # Vérifier les headers de réponse CSV
        assert response['Content-Type'] == 'text/csv'
        assert 'utilisateurs_mavecam.csv' in response['Content-Disposition']
        
        # Vérifier le contenu CSV
        content = response.content.decode('utf-8')
        lines = content.strip().split('\n')
        
        # Header line
        assert 'Téléphone' in lines[0]
        assert 'Nom' in lines[0]
        
        # Data line
        assert user.phone_number in lines[1]
        assert user.display_name in lines[1]


@pytest.mark.django_db
class TestFarmProfileAdmin:
    """
    Tests pour l'interface admin des profils ferme.
    """
    
    def setup_method(self):
        """Configuration pour chaque test."""
        self.site = AdminSite()
        self.admin = FarmProfileAdmin(FarmProfile, self.site)
    
    def test_list_display_fields(self):
        """Test champs affichés dans la liste."""
        expected_fields = (
            'farm_name', 'user_display_name', 'certification_status', 
            'total_ponds', 'annual_production_kg', 'created_at'
        )
        assert self.admin.list_display == expected_fields
    
    def test_list_filter_configured(self):
        """Test filtres configurés."""
        expected_filters = (
            'certification_status', 'created_at', 'user__region', 
            'user__activity_type'
        )
        assert self.admin.list_filter == expected_filters
    
    def test_user_display_name_method(self):
        """Test méthode d'affichage du nom utilisateur."""
        user = User.objects.create_user(
            phone_number='+237694000000',
            first_name='Farm',
            last_name='Owner',
            password='test123',
            age_group='26_35'
        )
        
        farm = user.farm_profile
        result = self.admin.user_display_name(farm)
        
        assert result == 'Farm Owner'
    
    def test_fieldsets_configuration(self):
        """Test configuration des fieldsets."""
        fieldsets = self.admin.fieldsets
        
        # Vérifier que les sections principales existent
        section_names = [fieldset[0] for fieldset in fieldsets]
        
        assert 'Informations de base' in section_names
        assert 'Certification MAVECAM' in section_names
        assert 'Informations techniques' in section_names
        assert 'Production' in section_names
    
    def test_readonly_fields_configured(self):
        """Test champs en lecture seule."""
        expected_readonly = ('id', 'created_at', 'updated_at')
        assert self.admin.readonly_fields == expected_readonly


@pytest.mark.django_db
class TestAdminIntegration:
    """
    Tests d'intégration pour l'interface admin.
    """
    
    def test_user_admin_inline_farm_profile(self):
        """Test inline FarmProfile dans UserAdmin."""
        site = AdminSite()
        admin = UserAdmin(User, site)
        
        # Vérifier que l'inline est configuré
        assert len(admin.inlines) == 1
        from accounts.admin import FarmProfileInline
        assert admin.inlines[0] == FarmProfileInline
    
    def test_farm_profile_inline_configuration(self):
        """Test configuration de l'inline FarmProfile."""
        from accounts.admin import FarmProfileInline
        
        inline = FarmProfileInline
        assert inline.model == FarmProfile
        assert inline.extra == 0
        
        expected_fields = (
            'farm_name', 'certification_status',
            'total_ponds', 'total_area_m2', 'water_source', 'main_species',
            'annual_production_kg'
        )
        assert inline.fields == expected_fields
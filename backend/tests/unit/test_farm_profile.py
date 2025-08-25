"""
Tests unitaires pour le modèle FarmProfile.

Teste toutes les fonctionnalités liées au profil ferme MAVECAM.
"""
import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from accounts.models import FarmProfile

User = get_user_model()


@pytest.mark.django_db
class TestFarmProfileModel:
    """
    Tests pour le modèle FarmProfile.
    
    Vérifie que les profils ferme sont correctement gérés.
    """
    
    def test_create_farm_profile_success(self):
        """Test création d'un profil ferme valide."""
        user = User.objects.create_user(
            phone_number='+237690123456',
            first_name='Jean',
            last_name='Farmer',
            account_type='individual',
            age_group='26_35',
            password='test123'
        )
        
        # Le FarmProfile est créé automatiquement, on le récupère et le modifie
        farm = user.farm_profile
        farm.farm_name = 'Ferme de Jean'
        farm.total_ponds = 5
        farm.total_area_m2 = 1000.50
        farm.water_source = 'Rivière'
        farm.main_species = 'Tilapia'
        farm.annual_production_kg = 2000
        farm.save()
        
        assert farm.user == user
        assert farm.farm_name == 'Ferme de Jean'
        assert farm.total_ponds == 5
        assert farm.total_area_m2 == 1000.50
        assert farm.water_source == 'Rivière'
        assert farm.main_species == 'Tilapia'
        assert farm.annual_production_kg == 2000
        assert farm.certification_status == 'pending'
        assert farm.is_certified is False
    
    def test_farm_profile_auto_created_on_user_creation(self):
        """Test que FarmProfile est créé automatiquement avec User."""
        user = User.objects.create_user(
            phone_number='+237691234567',
            first_name='Marie',
            last_name='Fermiere',
            account_type='individual',
            age_group='36_45',
            password='test123'
        )
        
        # Vérifier que le farm_profile existe
        assert hasattr(user, 'farm_profile')
        assert user.farm_profile.farm_name == 'Ferme de Marie Fermiere'
        assert user.farm_profile.certification_status == 'pending'
    
    def test_company_farm_profile_name(self):
        """Test nom automatique pour entreprise."""
        user = User.objects.create_user(
            phone_number='+237692345678',
            first_name='Boss',
            last_name='Company',
            password='test123',
            account_type='company',
            business_name='AquaFarm SARL',
            legal_status='sarl',
            promoter_name='Boss Company'
        )
        
        assert user.farm_profile.farm_name == 'Ferme AquaFarm SARL'
    
    def test_certification_status_properties(self):
        """Test propriétés de certification."""
        user = User.objects.create_user(
            phone_number='+237693456789',
            first_name='Test',
            last_name='User',
            account_type='individual',
            age_group='26_35',
            password='test123'
        )
        
        farm = user.farm_profile
        
        # Status pending par défaut
        assert farm.is_certified is False
        
        # Changer vers certified
        farm.certification_status = 'certified'
        farm.save()
        
        assert farm.is_certified is True
    
    def test_farm_profile_validation_empty_name(self):
        """Test validation nom de ferme vide."""
        user = User.objects.create_user(
            phone_number='+237694567890',
            first_name='Test',
            last_name='User',
            password='test123',
            age_group='26_35'
        )
        
        farm = user.farm_profile
        farm.farm_name = '   '  # Nom vide avec espaces
        
        with pytest.raises(ValidationError) as exc_info:
            farm.full_clean()
        
        assert 'farm_name' in str(exc_info.value)
    
    def test_farm_profile_validation_production_without_ponds(self):
        """Test validation production sans bassins."""
        user = User.objects.create_user(
            phone_number='+237695678901',
            first_name='Test',
            last_name='User',
            password='test123',
            age_group='26_35'
        )
        
        farm = user.farm_profile
        farm.total_ponds = 0
        farm.annual_production_kg = 1000  # Production sans bassins
        
        with pytest.raises(ValidationError) as exc_info:
            farm.full_clean()
        
        assert 'total_ponds' in str(exc_info.value)
    
    def test_farm_profile_str_representation(self):
        """Test représentation textuelle."""
        user = User.objects.create_user(
            phone_number='+237696789012',
            first_name='Jean',
            last_name='Fermier',
            password='test123',
            age_group='26_35'
        )
        
        farm = user.farm_profile
        farm.farm_name = 'Belle Ferme'
        
        expected = 'Belle Ferme - Jean Fermier'
        assert str(farm) == expected
    
    def test_farm_profile_uuid_field(self):
        """Test que l'ID est un UUID valide."""
        user = User.objects.create_user(
            phone_number='+237697890123',
            first_name='Test',
            last_name='User',
            password='test123',
            age_group='26_35'
        )
        
        farm = user.farm_profile
        
        # Vérifier que c'est un UUID valide
        import uuid
        assert isinstance(farm.id, uuid.UUID)
        assert len(str(farm.id)) == 36  # Format UUID standard


@pytest.mark.django_db 
class TestFarmProfileManager:
    """
    Tests pour les opérations de gestion des profils ferme.
    """
    
    def test_farm_profile_queryset_filtering(self):
        """Test filtrage des profils ferme."""
        # Créer plusieurs utilisateurs avec fermes
        user1 = User.objects.create_user(
            phone_number='+237690000001',
            first_name='User1',
            last_name='Test',
            password='test123',
            age_group='26_35',
            region='centre'
        )
        
        user2 = User.objects.create_user(
            phone_number='+237690000002',
            first_name='User2',
            last_name='Test',
            password='test123',
            age_group='36_45',
            region='littoral'
        )
        
        # Certifier une ferme
        user1.farm_profile.certification_status = 'certified'
        user1.farm_profile.save()
        
        # Tests de filtrage
        certified_farms = FarmProfile.objects.filter(certification_status='certified')
        assert certified_farms.count() == 1
        assert certified_farms.first().user == user1
        
        pending_farms = FarmProfile.objects.filter(certification_status='pending')
        assert pending_farms.count() == 1
        assert pending_farms.first().user == user2
    
    def test_farm_profile_ordering(self):
        """Test ordre des profils ferme."""
        # Créer plusieurs fermes
        users = []
        for i in range(3):
            user = User.objects.create_user(
                phone_number=f'+23769000000{i}',
                first_name=f'User{i}',
                last_name='Test',
                password='test123',
                age_group='26_35'
            )
            users.append(user)
        
        # Vérifier l'ordre (plus récent en premier)
        farms = FarmProfile.objects.all()
        assert farms[0].user == users[2]  # Plus récent
        assert farms[1].user == users[1]
        assert farms[2].user == users[0]  # Plus ancien
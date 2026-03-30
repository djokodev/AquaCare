"""
Tests pour la feature géolocalisation GPS des fermes.

Couvre :
- Champs GPS sur FarmProfile (model + serializer)
- FarmMapView : permissions, filtres, champs de réponse
"""
from decimal import Decimal

import pytest
from accounts.models import FarmProfile
from accounts.serializers import FarmMapSerializer, FarmProfileSerializer
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient

User = get_user_model()

FARM_MAP_URL = '/api/accounts/farms/map/'


def make_user(phone, region=None, **kwargs):
    return User.objects.create_user(
        phone_number=phone,
        first_name='Jean',
        last_name='Test',
        password='pass123',
        age_group='26_35',
        region=region,
        **kwargs,
    )


def make_admin(phone):
    return User.objects.create_superuser(
        phone_number=phone,
        first_name='Admin',
        last_name='GPS',
        password='admin123',
    )


@pytest.mark.django_db
class TestFarmGPSFields:
    """Tests des champs GPS sur FarmProfile (model + serializer)."""

    def test_farmprofile_accepts_null_gps(self):
        """lat/lng null → profil valide (champs optionnels)."""
        user = make_user('+237690000001')
        farm = user.farm_profile
        assert farm.latitude is None
        assert farm.longitude is None
        # Doit se sauvegarder sans erreur
        farm.save()

    def test_farmprofile_stores_coordinates(self):
        """PATCH /api/accounts/farm/ sauvegarde lat/lng en base."""
        user = make_user('+237690000002')
        client = APIClient()
        client.force_authenticate(user=user)

        response = client.patch('/api/accounts/farm/', {
            'latitude': '3.8680',
            'longitude': '11.5174',
            'location_address': 'Yaoundé, Centre',
        }, format='json')

        assert response.status_code == 200
        user.farm_profile.refresh_from_db()
        assert user.farm_profile.latitude == Decimal('3.8680000')
        assert user.farm_profile.longitude == Decimal('11.5174000')
        assert user.farm_profile.location_address == 'Yaoundé, Centre'

    def test_farmprofile_serializer_gps_fields_present(self):
        """latitude, longitude, location_address présents dans la réponse."""
        user = make_user('+237690000003')
        farm = user.farm_profile
        farm.latitude = Decimal('4.0000000')
        farm.longitude = Decimal('9.7000000')
        farm.location_address = 'Douala, Littoral'
        farm.save()

        client = APIClient()
        client.force_authenticate(user=user)
        response = client.get('/api/accounts/farm/')

        assert response.status_code == 200
        data = response.json()
        assert 'latitude' in data
        assert 'longitude' in data
        assert 'location_address' in data
        assert data['location_address'] == 'Douala, Littoral'


@pytest.mark.django_db
class TestFarmMapView:
    """Tests de l'endpoint admin GET /api/accounts/farms/map/."""

    def _geolocate(self, farm, lat='3.8680000', lng='11.5174000'):
        farm.latitude = Decimal(lat)
        farm.longitude = Decimal(lng)
        farm.save()

    def test_farm_map_requires_admin(self):
        """403 pour un utilisateur non-staff."""
        user = make_user('+237690000010')
        client = APIClient()
        client.force_authenticate(user=user)

        response = client.get(FARM_MAP_URL)
        assert response.status_code == 403

    def test_farm_map_unauthenticated_returns_401(self):
        """401 sans token."""
        client = APIClient()
        response = client.get(FARM_MAP_URL)
        assert response.status_code == 401

    def _results(self, response):
        """Extrait la liste des résultats (supporte la pagination DRF)."""
        data = response.json()
        return data['results'] if isinstance(data, dict) and 'results' in data else data

    def test_farm_map_returns_geolocated_only(self):
        """Exclut les fermes sans coordonnées GPS."""
        admin = make_admin('+237690000020')
        user_with_gps = make_user('+237690000021')
        user_no_gps = make_user('+237690000022')

        self._geolocate(user_with_gps.farm_profile)

        client = APIClient()
        client.force_authenticate(user=admin)
        response = client.get(FARM_MAP_URL)

        assert response.status_code == 200
        farm_ids = [f['id'] for f in self._results(response)]
        assert str(user_with_gps.farm_profile.id) in farm_ids
        assert str(user_no_gps.farm_profile.id) not in farm_ids

    def test_farm_map_filter_by_region(self):
        """?region=centre filtre correctement."""
        admin = make_admin('+237690000030')
        user_centre = make_user('+237690000031', region='centre')
        user_littoral = make_user('+237690000032', region='littoral')

        self._geolocate(user_centre.farm_profile, lat='3.8680000', lng='11.5174000')
        self._geolocate(user_littoral.farm_profile, lat='4.0500000', lng='9.7000000')

        client = APIClient()
        client.force_authenticate(user=admin)
        response = client.get(FARM_MAP_URL + '?region=centre')

        assert response.status_code == 200
        farm_ids = [f['id'] for f in self._results(response)]
        assert str(user_centre.farm_profile.id) in farm_ids
        assert str(user_littoral.farm_profile.id) not in farm_ids

    def test_farm_map_filter_by_certification_status(self):
        """?certification_status=certified filtre correctement."""
        admin = make_admin('+237690000040')
        user_certified = make_user('+237690000041')
        user_pending = make_user('+237690000042')

        self._geolocate(user_certified.farm_profile)
        self._geolocate(user_pending.farm_profile, lat='4.1000000', lng='9.8000000')

        user_certified.farm_profile.certification_status = 'certified'
        user_certified.farm_profile.save()

        client = APIClient()
        client.force_authenticate(user=admin)
        response = client.get(FARM_MAP_URL + '?certification_status=certified')

        assert response.status_code == 200
        farm_ids = [f['id'] for f in self._results(response)]
        assert str(user_certified.farm_profile.id) in farm_ids
        assert str(user_pending.farm_profile.id) not in farm_ids

    def test_farm_map_popup_fields_present(self):
        """farm_name, owner_name, owner_phone présents dans chaque entrée."""
        admin = make_admin('+237690000050')
        user = make_user('+237690000051')
        self._geolocate(user.farm_profile)

        client = APIClient()
        client.force_authenticate(user=admin)
        response = client.get(FARM_MAP_URL)

        assert response.status_code == 200
        farms = self._results(response)
        assert len(farms) >= 1
        farm = next(f for f in farms if str(user.farm_profile.id) == f['id'])
        assert 'farm_name' in farm
        assert 'owner_name' in farm
        assert 'owner_phone' in farm
        assert farm['owner_phone'] == '+237690000051'

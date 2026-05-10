"""
Tests pour la feature géolocalisation GPS des fermes.

Couvre :
- Champs GPS sur FarmProfile (model + serializer)
- Carte admin : permissions, filtres, pagination, champs de réponse
"""
from decimal import Decimal
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model
from django.test import Client
from rest_framework.test import APIClient

User = get_user_model()

FARM_MAP_API_URL = '/api/accounts/farms/map/'
FARM_MAP_ADMIN_DATA_URL = '/admin/accounts/farmprofile/map-data/'
FARM_MAP_TEMPLATE = Path(__file__).resolve().parents[1] / 'templates/admin/accounts/farm_map.html'


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

    def test_farmprofile_rejects_out_of_range_coordinates(self):
        """Les coordonnées GPS hors bornes WGS84 doivent être rejetées."""
        user = make_user('+237690000004')
        client = APIClient()
        client.force_authenticate(user=user)

        response = client.patch('/api/accounts/farm/', {
            'latitude': '100.0000',
            'longitude': '200.0000',
        }, format='json')

        assert response.status_code == 400
        assert 'latitude' in response.data
        assert 'longitude' in response.data

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
    """Tests du payload carte admin GET /admin/accounts/farmprofile/map-data/."""

    def _geolocate(self, farm, lat='3.8680000', lng='11.5174000'):
        farm.latitude = Decimal(lat)
        farm.longitude = Decimal(lng)
        farm.save()

    def test_farm_map_requires_admin(self):
        """Redirection admin login pour un utilisateur non-staff."""
        user = make_user('+237690000010')
        client = Client()
        client.force_login(user)

        response = client.get(FARM_MAP_ADMIN_DATA_URL)

        assert response.status_code == 302
        assert '/admin/login/' in response.url

    def test_farm_map_unauthenticated_redirects_to_admin_login(self):
        """Redirection admin login sans session admin."""
        client = Client()

        response = client.get(FARM_MAP_ADMIN_DATA_URL)

        assert response.status_code == 302
        assert '/admin/login/' in response.url

    def test_farm_map_is_not_exposed_as_mobile_api(self):
        """La carte des fermes n'est pas exposée sous /api/accounts/."""
        client = APIClient()

        response = client.get(FARM_MAP_API_URL)

        assert response.status_code == 404

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

        client = Client()
        client.force_login(admin)
        response = client.get(FARM_MAP_ADMIN_DATA_URL)

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

        client = Client()
        client.force_login(admin)
        response = client.get(f'{FARM_MAP_ADMIN_DATA_URL}?region=centre')

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

        client = Client()
        client.force_login(admin)
        response = client.get(f'{FARM_MAP_ADMIN_DATA_URL}?certification_status=certified')

        assert response.status_code == 200
        farm_ids = [f['id'] for f in self._results(response)]
        assert str(user_certified.farm_profile.id) in farm_ids
        assert str(user_pending.farm_profile.id) not in farm_ids

    def test_farm_map_popup_fields_present(self):
        """farm_name, owner_name, owner_phone présents dans chaque entrée."""
        admin = make_admin('+237690000050')
        user = make_user('+237690000051')
        self._geolocate(user.farm_profile)

        client = Client()
        client.force_login(admin)
        response = client.get(FARM_MAP_ADMIN_DATA_URL)

        assert response.status_code == 200
        farms = self._results(response)
        assert len(farms) >= 1
        farm = next(f for f in farms if str(user.farm_profile.id) == f['id'])
        assert 'farm_name' in farm
        assert 'owner_name' in farm
        assert 'owner_phone' in farm
        assert farm['owner_phone'] == '+237690000051'

    def test_farm_map_is_paginated_to_bound_payload_size(self):
        """La carte admin ne doit pas renvoyer toutes les fermes en un payload."""
        admin = make_admin('+237690000060')
        for index in range(55):
            user = make_user(f'+23769001{index:04d}')
            self._geolocate(
                user.farm_profile,
                lat=f'3.{8600000 + index:07d}',
                lng='11.5174000',
            )

        client = Client()
        client.force_login(admin)
        response = client.get(FARM_MAP_ADMIN_DATA_URL)

        assert response.status_code == 200
        data = response.json()
        assert data['count'] == 55
        assert len(data['results']) == 50
        assert data['next'] is not None

    def test_farm_map_popup_escapes_user_controlled_fields(self):
        """La popup admin doit échapper les champs venant des profils utilisateurs."""
        template = FARM_MAP_TEMPLATE.read_text(encoding='utf-8')

        assert 'function escapeHtml(value)' in template
        assert '${escapeHtml(farm.farm_name)}' in template
        assert '${escapeHtml(farm.owner_name)}' in template
        assert '${escapeHtml(farm.location_address)}' in template
        assert 'knownCertificationStatus(farm.certification_status)' in template

"""
Tests d'intégration pour les endpoints de récolte partielle.

Couvre :
- POST /aquaculture/cycles/{id}/partial-harvest/ (succès, erreurs)
- GET /aquaculture/cycles/{id}/partial-harvests/ (historique)
- Permissions : seul le propriétaire du cycle peut récolter
"""
from datetime import date, timedelta
from decimal import Decimal

import pytest
from aquaculture.models import PartialHarvest
from django.urls import reverse
from rest_framework import status


@pytest.mark.django_db
class TestPartialHarvestEndpoint:
    """Tests pour l'endpoint POST partial-harvest."""

    def test_partial_harvest_success(self, auth_client, production_cycle):
        """Récolte partielle réussie : current_count décrémenté, cycle actif."""
        # production_cycle: 950 poissons, poids moyen 35g
        # Pour atteindre le minimum clarias (250g), on fixe le poids dans conftest
        # mais en réalité le cycle de test a poids=35g — donc on simule un cycle mature
        production_cycle.current_average_weight = Decimal('35.00')
        production_cycle.current_count = 950
        production_cycle.current_biomass = Decimal('33.25')
        # Passer clarias à 300g pour franchir le minimum de 250g
        production_cycle.current_average_weight = Decimal('300.00')
        production_cycle.current_biomass = Decimal('285.00')  # 950 * 300 / 1000
        production_cycle.save()

        url = reverse('aquaculture:production-cycle-partial-harvest', kwargs={'pk': production_cycle.id})
        data = {
            'harvest_date': date.today().isoformat(),
            'count_harvested': 100,
            'average_weight_g': '300.00',
            'sale_price_fcfa_per_kg': '1800.00',
            'notes': 'Vente client Yaoundé',
        }

        response = auth_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert 'message' in response.data
        assert 'cycle' in response.data
        assert 'partial_harvest' in response.data

        # Cycle reste actif
        assert response.data['cycle']['status'] == 'active'
        # current_count décrémenté
        assert response.data['cycle']['current_count'] == 850

        # Enregistrement créé
        ph_data = response.data['partial_harvest']
        assert ph_data['count_harvested'] == 100
        assert Decimal(ph_data['average_weight_g']) == Decimal('300.00')
        assert ph_data['estimated_revenue_fcfa'] == 54000.0  # 30kg * 1800

    def test_partial_harvest_fails_count_exceeds_available(self, auth_client, production_cycle):
        """Erreur si count_harvested > current_count."""
        production_cycle.current_average_weight = Decimal('300.00')
        production_cycle.save()

        url = reverse('aquaculture:production-cycle-partial-harvest', kwargs={'pk': production_cycle.id})
        data = {
            'harvest_date': date.today().isoformat(),
            'count_harvested': production_cycle.current_count + 100,
            'average_weight_g': '300.00',
        }

        response = auth_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'error' in response.data

    def test_partial_harvest_fails_on_harvested_cycle(self, auth_client, production_cycle):
        """Erreur si le cycle est déjà récolté."""
        production_cycle.status = 'harvested'
        production_cycle.save()

        url = reverse('aquaculture:production-cycle-partial-harvest', kwargs={'pk': production_cycle.id})
        data = {
            'harvest_date': date.today().isoformat(),
            'count_harvested': 50,
            'average_weight_g': '300.00',
        }

        response = auth_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_partial_harvest_fails_below_minimum_weight(self, auth_client, production_cycle):
        """Erreur si poids inférieur au minimum commercial de l'espèce."""
        url = reverse('aquaculture:production-cycle-partial-harvest', kwargs={'pk': production_cycle.id})
        data = {
            'harvest_date': date.today().isoformat(),
            'count_harvested': 50,
            'average_weight_g': '100.00',  # < 250g pour clarias
        }

        response = auth_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_partial_harvest_unauthenticated(self, api_client, production_cycle):
        """Requête sans authentification → 401."""
        url = reverse('aquaculture:production-cycle-partial-harvest', kwargs={'pk': production_cycle.id})
        data = {
            'harvest_date': date.today().isoformat(),
            'count_harvested': 50,
            'average_weight_g': '300.00',
        }

        response = api_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_partial_harvest_wrong_user_cannot_access(self, user_factory, production_cycle, api_client):
        """Un autre utilisateur ne peut pas récolter le cycle d'un autre."""
        other_user = user_factory(phone_number='+237690111222')
        # other_user n'a pas de cycle avec cet ID (cycle appartient à authenticated_user)
        api_client.force_authenticate(user=other_user)

        url = reverse('aquaculture:production-cycle-partial-harvest', kwargs={'pk': production_cycle.id})
        data = {
            'harvest_date': date.today().isoformat(),
            'count_harvested': 50,
            'average_weight_g': '300.00',
        }

        response = api_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestPartialHarvestsListEndpoint:
    """Tests pour l'endpoint GET partial-harvests."""

    def test_list_partial_harvests_empty(self, auth_client, production_cycle):
        """Retourne liste vide si aucune récolte partielle."""
        url = reverse('aquaculture:production-cycle-partial-harvests', kwargs={'pk': production_cycle.id})
        response = auth_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data == []

    def test_list_partial_harvests_returns_history(self, auth_client, production_cycle):
        """Retourne toutes les récoltes partielles du cycle."""
        # Créer 2 récoltes partielles directement
        PartialHarvest.objects.create(
            cycle=production_cycle,
            harvest_date=date.today() - timedelta(days=5),
            count_harvested=50,
            average_weight_g=Decimal('300.00'),
            total_weight_kg=Decimal('15.000'),
            sale_price_fcfa_per_kg=Decimal('1800.00'),
        )
        PartialHarvest.objects.create(
            cycle=production_cycle,
            harvest_date=date.today(),
            count_harvested=30,
            average_weight_g=Decimal('320.00'),
            total_weight_kg=Decimal('9.600'),
        )

        url = reverse('aquaculture:production-cycle-partial-harvests', kwargs={'pk': production_cycle.id})
        response = auth_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 2

        # Vérifier les champs retournés
        first = response.data[0]
        assert 'count_harvested' in first
        assert 'total_weight_kg' in first
        assert 'estimated_revenue_fcfa' in first

    def test_list_partial_harvests_unauthenticated(self, api_client, production_cycle):
        """Requête sans auth → 401."""
        url = reverse('aquaculture:production-cycle-partial-harvests', kwargs={'pk': production_cycle.id})
        response = api_client.get(url)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

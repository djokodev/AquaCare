from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
from aquaculture.models import CycleUnitAllocation, ProductionCycle, ProductionReport, ProductionUnit
from django.urls import reverse
from rest_framework import status

from tests.fixtures.factories import ProductionCycleFactory


def _create_unit(farm_profile, name: str, volume_m3: str) -> ProductionUnit:
    return ProductionUnit.objects.create(
        farm_profile=farm_profile,
        name=name,
        unit_type='tank',
        volume_m3=Decimal(volume_m3),
    )


def _create_allocation(
    cycle: ProductionCycle,
    production_unit: ProductionUnit,
    initial_fish_count: int,
) -> CycleUnitAllocation:
    biomass = Decimal(initial_fish_count) * Decimal('10') / Decimal('1000')
    return CycleUnitAllocation.objects.create(
        cycle=cycle,
        production_unit=production_unit,
        initial_fish_count=initial_fish_count,
        current_fish_count=initial_fish_count,
        initial_biomass_kg=biomass,
        current_biomass_kg=biomass,
    )


@pytest.mark.django_db
class TestScopedProductionReportsApi:
    def test_generate_report_rejects_unknown_unit_allocation(self, auth_client, farm_profile):
        cycle = ProductionCycleFactory(farm_profile=farm_profile, status='active')

        response = auth_client.post(
            reverse('aquaculture:production-report-generate'),
            {
                'report_type': 'daily',
                'scope': 'unit',
                'cycle_id': str(cycle.id),
                'cycle_unit_allocation_id': str(uuid4()),
            },
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'allocation' in str(response.data).lower() or 'unité' in str(response.data).lower()

    def test_list_reports_rejects_invalid_cycle_uuid(self, auth_client):
        response = auth_client.get(
            reverse('aquaculture:production-report-list'),
            {'scope': 'cycle', 'cycle_id': 'not-a-uuid'},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'cycle_id' in response.data

    def test_list_reports_rejects_invalid_unit_uuid(self, auth_client):
        response = auth_client.get(
            reverse('aquaculture:production-report-list'),
            {'scope': 'unit', 'cycle_unit_allocation_id': 'not-a-uuid'},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'cycle_unit_allocation_id' in response.data

    def test_list_reports_filters_cycle_and_unit_scopes(self, auth_client, farm_profile):
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            cycle_name='Cycle Rapports',
            status='active',
        )
        bac_1 = _create_unit(farm_profile, 'Bac 1', '3.00')
        allocation_1 = _create_allocation(cycle, bac_1, 1000)

        cycle_report = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type='daily',
            period_start=date(2026, 6, 30),
            period_end=date(2026, 6, 30),
            status='draft',
            scope_type='cycle',
            scope_object_id=cycle.id,
            payload={
                'report_meta': {
                    'scope_type': 'cycle',
                    'scope_object_id': str(cycle.id),
                    'cycle_scope_id': str(cycle.id),
                    'scope_name': cycle.cycle_name,
                    'scope_label': 'Rapport du cycle',
                }
            },
        )
        unit_report = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type='daily',
            period_start=date(2026, 6, 30),
            period_end=date(2026, 6, 30),
            status='draft',
            scope_type='unit',
            scope_object_id=allocation_1.id,
            payload={
                'report_meta': {
                    'scope_type': 'unit',
                    'scope_object_id': str(allocation_1.id),
                    'cycle_scope_id': str(cycle.id),
                    'cycle_unit_allocation_id': str(allocation_1.id),
                    'cycle_scope_name': cycle.cycle_name,
                    'scope_name': bac_1.name,
                    'scope_label': "Rapport de l'unité",
                }
            },
        )

        list_url = reverse('aquaculture:production-report-list')

        cycle_response = auth_client.get(
            list_url,
            {'scope': 'cycle', 'cycle_id': str(cycle.id)},
        )
        unit_response = auth_client.get(
            list_url,
            {'scope': 'unit', 'cycle_id': str(cycle.id), 'cycle_unit_allocation_id': str(allocation_1.id)},
        )

        assert cycle_response.status_code == status.HTTP_200_OK
        assert unit_response.status_code == status.HTTP_200_OK
        assert [item['id'] for item in cycle_response.data['results']] == [str(cycle_report.id)]
        assert [item['id'] for item in unit_response.data['results']] == [str(unit_report.id)]
        assert cycle_response.data['results'][0]['scope_type'] == 'cycle'
        assert unit_response.data['results'][0]['scope_type'] == 'unit'
        assert unit_response.data['results'][0]['scope_label'] == "Rapport de l'unité"

from datetime import date, timedelta
from decimal import Decimal

import pytest
from aquaculture.models import CycleLog, CycleUnitAllocation, ProductionUnit, SanitaryLog
from django.urls import reverse


def _create_production_unit(farm_profile, name: str, volume_m3: str) -> ProductionUnit:
    return ProductionUnit.objects.create(
        farm_profile=farm_profile,
        name=name,
        unit_type='tank',
        volume_m3=Decimal(volume_m3),
    )


def _create_allocation(cycle, production_unit, initial_fish_count: int) -> CycleUnitAllocation:
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
class TestProductionUnitActionIntegrity:
    def test_unit_scoped_history_filters_by_allocation(self, auth_client, production_cycle, farm_profile):
        bac_1 = _create_production_unit(farm_profile, 'Bac 1', '3.00')
        bac_2 = _create_production_unit(farm_profile, 'Bac 2', '4.00')
        allocation_1 = _create_allocation(production_cycle, bac_1, 900)
        allocation_2 = _create_allocation(production_cycle, bac_2, 900)

        CycleLog.objects.create(
            cycle=production_cycle,
            cycle_unit_allocation=allocation_1,
            log_date=date.today() - timedelta(days=1),
            mortality_count=1,
            feed_quantity=Decimal('5.00'),
            average_weight=Decimal('20.00'),
        )
        CycleLog.objects.create(
            cycle=production_cycle,
            cycle_unit_allocation=allocation_2,
            log_date=date.today(),
            mortality_count=2,
            feed_quantity=Decimal('8.00'),
            average_weight=Decimal('22.00'),
        )
        SanitaryLog.objects.create(
            cycle=production_cycle,
            cycle_unit_allocation=allocation_1,
            event_date=date.today() - timedelta(days=1),
            event_type='disease',
            symptoms='Points blancs observés sur Bac 1',
            resolved=False,
        )
        SanitaryLog.objects.create(
            cycle=production_cycle,
            cycle_unit_allocation=allocation_2,
            event_date=date.today(),
            event_type='treatment',
            symptoms='Traitement préventif Bac 2',
            resolved=False,
        )

        daily_response = auth_client.get(
            reverse('aquaculture:cycle-log-list'),
            {
                'cycle_id': str(production_cycle.id),
                'cycle_unit_allocation': str(allocation_1.id),
            },
        )
        sanitary_response = auth_client.get(
            reverse('aquaculture:sanitary-log-list'),
            {
                'cycle_id': str(production_cycle.id),
                'cycle_unit_allocation': str(allocation_1.id),
            },
        )

        assert daily_response.status_code == 200
        assert len(daily_response.data['results']) == 1
        assert str(daily_response.data['results'][0]['cycle_unit_allocation']) == str(allocation_1.id)
        assert daily_response.data['results'][0]['feed_quantity'] == '5.00'

        assert sanitary_response.status_code == 200
        assert len(sanitary_response.data['results']) == 1
        assert str(sanitary_response.data['results'][0]['cycle_unit_allocation']) == str(allocation_1.id)
        assert sanitary_response.data['results'][0]['event_type'] == 'disease'

    def test_unit_dashboards_aggregate_without_mixing_allocations(self, auth_client, production_cycle, farm_profile):
        bac_1 = _create_production_unit(farm_profile, 'Bac 1', '3.00')
        bac_2 = _create_production_unit(farm_profile, 'Bac 2', '4.00')
        allocation_1 = _create_allocation(production_cycle, bac_1, 900)
        allocation_2 = _create_allocation(production_cycle, bac_2, 900)

        CycleLog.objects.create(
            cycle=production_cycle,
            cycle_unit_allocation=allocation_1,
            log_date=date.today(),
            mortality_count=0,
            feed_quantity=Decimal('5.00'),
            average_weight=Decimal('20.00'),
        )
        CycleLog.objects.create(
            cycle=production_cycle,
            cycle_unit_allocation=allocation_2,
            log_date=date.today(),
            mortality_count=0,
            feed_quantity=Decimal('8.00'),
            average_weight=Decimal('22.00'),
        )

        unit_1_response = auth_client.get(
            reverse('aquaculture:cycle-unit-allocation-dashboard', kwargs={'pk': allocation_1.id})
        )
        unit_2_response = auth_client.get(
            reverse('aquaculture:cycle-unit-allocation-dashboard', kwargs={'pk': allocation_2.id})
        )
        cycle_response = auth_client.get(
            reverse('aquaculture:production-cycle-dashboard', kwargs={'pk': production_cycle.id})
        )

        assert unit_1_response.status_code == 200
        assert unit_2_response.status_code == 200
        assert cycle_response.status_code == 200

        assert unit_1_response.data['summary']['estimated_current_fish_count'] == 900
        assert unit_2_response.data['summary']['estimated_current_fish_count'] == 900
        assert Decimal(str(unit_1_response.data['summary']['total_feed_consumed_kg'])) == Decimal('5.00')
        assert Decimal(str(unit_2_response.data['summary']['total_feed_consumed_kg'])) == Decimal('8.00')
        assert cycle_response.data['summary']['total_estimated_current_fish_count'] == 1800
        assert Decimal(str(cycle_response.data['summary']['total_feed_consumed_kg'])) == Decimal('13.00')
        assert cycle_response.data['summary']['data_source'] == 'unit_allocations'
        assert cycle_response.data['summary']['total_allocations'] == 2
        assert cycle_response.data['summary']['units_with_today_log_count'] == 2
        assert cycle_response.data['summary']['units_missing_today_log_count'] == 0

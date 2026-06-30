from datetime import date, timedelta
from decimal import Decimal

import pytest
from aquaculture.models import CycleLog, CycleUnitAllocation, ProductionCycle, ProductionUnit, SanitaryLog
from aquaculture.services.report_service import ReportService

from tests.fixtures.factories import FarmProfileFactory, ProductionCycleFactory


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
    current_fish_count: int,
    current_biomass_kg: str,
) -> CycleUnitAllocation:
    biomass = Decimal(initial_fish_count) * Decimal('10') / Decimal('1000')
    return CycleUnitAllocation.objects.create(
        cycle=cycle,
        production_unit=production_unit,
        initial_fish_count=initial_fish_count,
        current_fish_count=current_fish_count,
        initial_biomass_kg=biomass,
        current_biomass_kg=Decimal(current_biomass_kg),
    )


def _create_cycle_log(
    *,
    cycle: ProductionCycle,
    allocation: CycleUnitAllocation | None,
    log_date: date,
    mortality_count: int,
    feed_quantity: str,
    average_weight: str,
) -> CycleLog:
    return CycleLog.objects.create(
        cycle=cycle,
        cycle_unit_allocation=allocation,
        log_date=log_date,
        mortality_count=mortality_count,
        feed_quantity=Decimal(feed_quantity),
        average_weight=Decimal(average_weight),
    )


def _create_sanitary_log(
    *,
    cycle: ProductionCycle,
    allocation: CycleUnitAllocation | None,
    event_date: date,
    event_type: str,
    symptoms: str,
    resolved: bool,
) -> SanitaryLog:
    return SanitaryLog.objects.create(
        cycle=cycle,
        cycle_unit_allocation=allocation,
        event_date=event_date,
        event_type=event_type,
        symptoms=symptoms,
        resolved=resolved,
    )


@pytest.mark.django_db
class TestUnitCycleAwareReportPayloads:
    def test_cycle_report_aggregates_allocations_and_counts_today_logs(self):
        today = date.today()
        yesterday = today - timedelta(days=1)
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            cycle_name='Cycle Clarias Juin 2026',
            species='clarias',
            status='active',
            initial_count=1800,
            current_count=1770,
            current_average_weight=Decimal('100.00'),
            current_biomass=Decimal('177.00'),
            total_feed_consumed=Decimal('14.50'),
        )

        bac_1 = _create_unit(farm_profile, 'Bac 1', '3.00')
        bac_2 = _create_unit(farm_profile, 'Bac 2', '4.00')
        allocation_1 = _create_allocation(cycle, bac_1, 1000, 990, '99.00')
        allocation_2 = _create_allocation(cycle, bac_2, 800, 780, '78.00')

        _create_cycle_log(
            cycle=cycle,
            allocation=allocation_1,
            log_date=today,
            mortality_count=10,
            feed_quantity='6.00',
            average_weight='100.00',
        )
        _create_cycle_log(
            cycle=cycle,
            allocation=allocation_2,
            log_date=yesterday,
            mortality_count=20,
            feed_quantity='8.50',
            average_weight='100.00',
        )
        _create_sanitary_log(
            cycle=cycle,
            allocation=allocation_1,
            event_date=today,
            event_type='disease',
            symptoms='Points blancs',
            resolved=False,
        )
        _create_sanitary_log(
            cycle=cycle,
            allocation=allocation_2,
            event_date=yesterday,
            event_type='treatment',
            symptoms='Traitement préventif',
            resolved=True,
        )

        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type='daily',
            period_start=yesterday,
            period_end=today,
            scope_type='cycle',
            cycle_id=str(cycle.id),
        )

        summary = payload['summary']
        assert summary['total_units'] == 2
        assert summary['initial_fish_count'] == 1800
        assert summary['estimated_current_fish_count'] == 1770
        assert summary['total_mortality_count'] == 30
        assert summary['mortality_rate_pct'] == 1.67
        assert summary['total_feed_consumed_kg'] == 14.5
        assert summary['estimated_current_biomass_kg'] == 177.0
        assert summary['units_with_today_log_count'] == 1
        assert summary['units_missing_today_log_count'] == 1
        assert summary['active_sanitary_events_count'] == 1
        assert summary['comparison_units_count'] == 2

        assert len(payload['cycles']) == 2
        assert len(payload['units']) == 2
        assert payload['cycles'][0]['unit']['production_unit_name'] == 'Bac 1'
        assert payload['cycles'][1]['unit']['production_unit_name'] == 'Bac 2'
        assert payload['cycles'][0]['current_metrics']['current_count'] == 990
        assert payload['cycles'][1]['current_metrics']['current_count'] == 780
        assert payload['cycles'][0]['period_metrics']['total_feed'] == 6.0
        assert payload['cycles'][1]['period_metrics']['total_feed'] == 8.5
        assert payload['units'][0]['name'] == 'Bac 1'
        assert payload['units'][0]['sanitary_status_short'] == 'active'
        assert payload['units'][1]['sanitary_status_short'] == 'ok'

    def test_unit_report_isolated_to_selected_allocation(self):
        today = date.today()
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            cycle_name='Cycle Silure Juin 2026',
            species='clarias',
            status='active',
            initial_count=1800,
            current_count=1770,
            current_average_weight=Decimal('100.00'),
            current_biomass=Decimal('177.00'),
            total_feed_consumed=Decimal('14.50'),
        )

        bac_1 = _create_unit(farm_profile, 'Bac 1', '3.00')
        bac_2 = _create_unit(farm_profile, 'Bac 2', '4.00')
        allocation_1 = _create_allocation(cycle, bac_1, 1000, 990, '99.00')
        allocation_2 = _create_allocation(cycle, bac_2, 800, 780, '78.00')

        _create_cycle_log(
            cycle=cycle,
            allocation=allocation_1,
            log_date=today,
            mortality_count=10,
            feed_quantity='6.00',
            average_weight='100.00',
        )
        _create_cycle_log(
            cycle=cycle,
            allocation=allocation_2,
            log_date=today,
            mortality_count=20,
            feed_quantity='8.50',
            average_weight='100.00',
        )
        _create_sanitary_log(
            cycle=cycle,
            allocation=allocation_1,
            event_date=today,
            event_type='disease',
            symptoms='Points blancs',
            resolved=False,
        )
        _create_sanitary_log(
            cycle=cycle,
            allocation=allocation_2,
            event_date=today,
            event_type='treatment',
            symptoms='Traitement préventif',
            resolved=True,
        )

        payload_bac_1 = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type='daily',
            period_start=today,
            period_end=today,
            scope_type='unit',
            scope_object_id=str(allocation_1.id),
        )
        payload_bac_2 = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type='daily',
            period_start=today,
            period_end=today,
            scope_type='unit',
            scope_object_id=str(allocation_2.id),
        )

        assert payload_bac_1['report_meta']['scope_type'] == 'unit'
        assert payload_bac_1['report_meta']['cycle_unit_allocation_id'] == str(allocation_1.id)
        assert payload_bac_1['summary']['total_units'] == 1
        assert payload_bac_1['summary']['initial_fish_count'] == 1000
        assert payload_bac_1['summary']['estimated_current_fish_count'] == 990
        assert payload_bac_1['summary']['total_mortality_count'] == 10
        assert payload_bac_1['summary']['total_feed_consumed_kg'] == 6.0
        assert payload_bac_1['summary']['estimated_current_biomass_kg'] == 99.0
        assert payload_bac_1['summary']['active_sanitary_events_count'] == 1
        assert payload_bac_1['cycles'][0]['unit']['production_unit_name'] == 'Bac 1'
        assert payload_bac_1['cycles'][0]['logs'][0]['mortality_count'] == 10
        assert payload_bac_1['cycles'][0]['sanitary_logs'][0]['resolved'] is False

        assert payload_bac_2['report_meta']['scope_type'] == 'unit'
        assert payload_bac_2['report_meta']['cycle_unit_allocation_id'] == str(allocation_2.id)
        assert payload_bac_2['summary']['total_units'] == 1
        assert payload_bac_2['summary']['initial_fish_count'] == 800
        assert payload_bac_2['summary']['estimated_current_fish_count'] == 780
        assert payload_bac_2['summary']['total_mortality_count'] == 20
        assert payload_bac_2['summary']['total_feed_consumed_kg'] == 8.5
        assert payload_bac_2['summary']['estimated_current_biomass_kg'] == 78.0
        assert payload_bac_2['summary']['active_sanitary_events_count'] == 0
        assert payload_bac_2['cycles'][0]['unit']['production_unit_name'] == 'Bac 2'
        assert payload_bac_2['cycles'][0]['logs'][0]['mortality_count'] == 20
        assert payload_bac_2['cycles'][0]['sanitary_logs'][0]['resolved'] is True

    def test_cycle_without_allocations_remains_stable(self):
        today = date.today()
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            cycle_name='Cycle Legacy',
            status='active',
            initial_count=500,
            current_count=490,
            current_average_weight=Decimal('40.00'),
            current_biomass=Decimal('19.60'),
            total_feed_consumed=Decimal('5.00'),
        )

        _create_cycle_log(
            cycle=cycle,
            allocation=None,
            log_date=today,
            mortality_count=10,
            feed_quantity='5.00',
            average_weight='40.00',
        )
        _create_sanitary_log(
            cycle=cycle,
            allocation=None,
            event_date=today,
            event_type='disease',
            symptoms='Event legacy',
            resolved=False,
        )

        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type='daily',
            period_start=today,
            period_end=today,
            scope_type='cycle',
            cycle_id=str(cycle.id),
        )

        assert payload['summary']['total_units'] == 0
        assert payload['summary']['cycle_count'] == 1
        assert payload['summary']['initial_fish_count'] == 500
        assert payload['summary']['estimated_current_fish_count'] == 480
        assert payload['summary']['total_mortality'] == 10
        assert payload['summary']['total_feed'] == 5.0
        assert payload['summary']['active_sanitary_events_count'] == 1
        assert len(payload['cycles']) == 1
        assert payload['cycles'][0]['cycle']['id'] == str(cycle.id)
        assert payload['units'] == []

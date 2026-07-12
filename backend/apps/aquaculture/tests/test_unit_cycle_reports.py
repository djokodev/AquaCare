from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from aquaculture.models import (
    CycleLog,
    CycleUnitAllocation,
    PartialHarvest,
    ProductionCycle,
    ProductionUnit,
    SanitaryLog,
)
from aquaculture.services.production_unit_stock_snapshot_service import ProductionUnitStockSnapshotService
from aquaculture.services.report_fcr_service import ReportFcrService
from aquaculture.services.report_service import ReportService
from aquaculture.services.report_visuals import aggregate_growth_points
from django.db.models import Prefetch
from django.utils import timezone

from tests.fixtures.factories import FarmProfileFactory, ProductionCycleFactory


def _create_unit(farm_profile, name: str, volume_m3: str) -> ProductionUnit:
    return ProductionUnit.objects.create(
        farm_profile=farm_profile,
        name=name,
        unit_type="tank",
        volume_m3=Decimal(volume_m3),
    )


def _create_allocation(
    cycle: ProductionCycle,
    production_unit: ProductionUnit,
    initial_fish_count: int,
    current_fish_count: int,
    current_biomass_kg: str,
) -> CycleUnitAllocation:
    biomass = Decimal(initial_fish_count) * Decimal("10") / Decimal("1000")
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
    feed_quantity: str | None,
    average_weight: str,
) -> CycleLog:
    return CycleLog.objects.create(
        cycle=cycle,
        cycle_unit_allocation=allocation,
        log_date=log_date,
        mortality_count=mortality_count,
        feed_quantity=Decimal(feed_quantity) if feed_quantity is not None else None,
        average_weight=Decimal(average_weight) if average_weight is not None else None,
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
    def test_unit_daily_report_separates_period_logs_from_cumulative_summary(self):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(farm_profile=farm_profile, status="active")
        allocation = _create_allocation(
            cycle,
            _create_unit(farm_profile, "Bassin période", "3.00"),
            1000,
            990,
            "99.00",
        )
        for log_date, feed, mortality in (
            (date(2026, 7, 1), "1.00", 2),
            (date(2026, 7, 5), "2.00", 3),
            (date(2026, 7, 12), "3.00", 4),
            (date(2026, 7, 19), "4.00", 1),
        ):
            _create_cycle_log(
                cycle=cycle,
                allocation=allocation,
                log_date=log_date,
                mortality_count=mortality,
                feed_quantity=feed,
                average_weight="100.00",
            )

        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=date(2026, 7, 19),
            period_end=date(2026, 7, 19),
            scope_type="unit",
            scope_object_id=str(allocation.id),
        )
        section = payload["cycles"][0]

        assert payload["summary"]["total_feed_consumed_kg"] == 10.0
        assert payload["summary"]["total_mortality_count"] == 10
        assert len(section["logs"]) == 1
        assert section["logs"][0]["log_date"] == "2026-07-19"
        assert section["period_metrics"]["total_feed"] == 4.0
    def test_historical_stock_snapshot_ignores_mutable_future_count(self):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            species="clarias",
            status="active",
            start_date=date(2026, 6, 1),
            initial_count=1000,
            current_count=920,
            current_average_weight=Decimal("200.00"),
            current_biomass=Decimal("184.00"),
        )
        allocation = _create_allocation(
            cycle,
            _create_unit(farm_profile, "Bassin historique", "3.00"),
            1000,
            920,
            "184.00",
        )
        _create_cycle_log(
            cycle=cycle,
            allocation=allocation,
            log_date=date(2026, 7, 15),
            mortality_count=40,
            feed_quantity="1.00",
            average_weight="190.00",
        )
        _create_cycle_log(
            cycle=cycle,
            allocation=allocation,
            log_date=date(2026, 7, 25),
            mortality_count=40,
            feed_quantity="1.00",
            average_weight="200.00",
        )
        allocation.current_fish_count = 920
        allocation.save(update_fields=["current_fish_count", "updated_at"])

        before_future_event = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=date(2026, 7, 19),
            period_end=date(2026, 7, 19),
            scope_type="cycle",
            cycle_id=str(cycle.id),
        )
        after_future_event = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="monthly",
            period_start=date(2026, 7, 1),
            period_end=date(2026, 7, 31),
            scope_type="cycle",
            cycle_id=str(cycle.id),
        )

        before_summary = before_future_event["summary"]
        after_summary = after_future_event["summary"]
        assert before_summary["total_mortality_count"] == 40
        assert before_summary["estimated_current_fish_count"] == 960
        assert before_summary["mortality_rate_pct"] == 4.0
        assert before_future_event["cycles"][0]["current_metrics"]["survival_rate"] == 96.0
        assert after_summary["total_mortality_count"] == 80
        assert after_summary["estimated_current_fish_count"] == 920
        assert after_summary["mortality_rate_pct"] == 8.0
        assert after_future_event["cycles"][0]["current_metrics"]["survival_rate"] == 92.0

    def test_historical_stock_snapshot_subtracts_partial_harvest_by_date(self):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            species="clarias",
            status="active",
            start_date=date(2026, 6, 1),
            initial_count=1000,
            current_count=850,
            current_average_weight=Decimal("200.00"),
            current_biomass=Decimal("170.00"),
        )
        allocation = _create_allocation(
            cycle,
            _create_unit(farm_profile, "Bassin récolte", "3.00"),
            1000,
            850,
            "170.00",
        )
        _create_cycle_log(
            cycle=cycle,
            allocation=allocation,
            log_date=date(2026, 7, 15),
            mortality_count=40,
            feed_quantity="1.00",
            average_weight="190.00",
        )
        PartialHarvest.objects.create(
            cycle=cycle,
            cycle_unit_allocation=allocation,
            harvest_date=date(2026, 7, 18),
            count_harvested=100,
            average_weight_g=Decimal("190.00"),
            total_weight_kg=Decimal("19.00"),
        )
        PartialHarvest.objects.create(
            cycle=cycle,
            cycle_unit_allocation=allocation,
            harvest_date=date(2026, 7, 25),
            count_harvested=50,
            average_weight_g=Decimal("200.00"),
            total_weight_kg=Decimal("10.00"),
        )

        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="weekly",
            period_start=date(2026, 7, 13),
            period_end=date(2026, 7, 19),
            scope_type="cycle",
            cycle_id=str(cycle.id),
        )

        assert payload["summary"]["estimated_current_fish_count"] == 860
        assert payload["summary"]["total_mortality_count"] == 40
        assert payload["summary"]["total_harvested_fish_count"] == 100
        assert payload["summary"]["total_harvested_biomass_kg"] == 19.0
        assert payload["cycles"][0]["current_metrics"]["survival_rate"] == 96.0
        assert payload["cycles"][0]["cumulative_metrics"]["stock_remaining_rate_pct"] == 86.0
        assert payload["cycles"][0]["unit"]["harvested_fish_count"] == 100
        assert payload["cycles"][0]["unit"]["harvested_biomass_kg"] == 19.0
        assert "current_fish_count" not in payload["cycles"][0]["unit"]
        assert "current_biomass_kg" not in payload["cycles"][0]["unit"]

    def test_biological_survival_is_not_reduced_by_final_harvest(self):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="harvested",
            initial_count=1000,
            current_count=0,
            current_biomass=Decimal("0.00"),
        )
        allocation = _create_allocation(
            cycle,
            _create_unit(farm_profile, "Bassin final", "3.00"),
            1000,
            0,
            "0.00",
        )
        allocation.status = CycleUnitAllocation.STATUS_HARVESTED
        allocation.final_harvest_date = date(2026, 7, 19)
        allocation.final_fish_count = 1000
        allocation.final_biomass_kg = Decimal("100.00")
        allocation.save(update_fields=["status", "final_harvest_date", "final_fish_count", "final_biomass_kg"])

        snapshot = ProductionUnitStockSnapshotService.build_as_of(
            allocation=allocation,
            as_of_date=date(2026, 7, 19),
        )

        assert snapshot["estimated_current_fish_count"] == 0
        assert snapshot["mortality_rate_pct"] == 0
        assert snapshot["biological_survival_rate_pct"] == 100
        assert snapshot["stock_remaining_rate_pct"] == 0

    def test_report_fcr_uses_harvested_biomass_and_returns_none_when_missing(self):
        assert ReportFcrService.calculate(
            feed_consumed_kg=Decimal("120"),
            initial_biomass_kg=Decimal("50"),
            current_biomass_kg=Decimal("100"),
            harvested_biomass_kg=Decimal("50"),
        ) == 1.2
        assert ReportFcrService.calculate(
            feed_consumed_kg=Decimal("120"),
            initial_biomass_kg=Decimal("50"),
            current_biomass_kg=Decimal("100"),
            harvested_biomass_kg=None,
            harvest_data_complete=False,
        ) is None

    def test_partial_harvests_are_prefetched_once_for_many_units(self, django_assert_num_queries):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(farm_profile=farm_profile, status="active")
        for index in range(10):
            allocation = _create_allocation(
                cycle,
                _create_unit(farm_profile, f"Bassin {index}", "3.00"),
                1000,
                1000,
                "20.00",
            )
            PartialHarvest.objects.create(
                cycle=cycle,
                cycle_unit_allocation=allocation,
                harvest_date=date(2026, 7, 18),
                count_harvested=10,
                average_weight_g=Decimal("200.00"),
                total_weight_kg=Decimal("2.00"),
            )

        with django_assert_num_queries(2):
            allocations = list(
                cycle.unit_allocations.select_related("production_unit").prefetch_related(
                    Prefetch(
                        "unit_partial_harvests",
                        queryset=PartialHarvest.objects.filter(harvest_date__lte=date(2026, 7, 31)),
                        to_attr="cumulative_partial_harvests",
                    )
                )
            )
            for allocation in allocations:
                snapshot = ProductionUnitStockSnapshotService.build_as_of(
                    allocation=allocation,
                    as_of_date=date(2026, 7, 31),
                    daily_logs=[],
                    partial_harvests=allocation.cumulative_partial_harvests,
                )
                assert snapshot["harvested_fish_count"] == 10

    def test_legacy_feed_resolution_exposes_source_and_completeness(self):
        farm_profile = FarmProfileFactory()
        period_end = date(2026, 7, 31)

        empty_cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            start_date=date(2026, 7, 1),
            total_feed_consumed=Decimal("0"),
        )
        empty_resolution = ReportService._resolve_legacy_cumulative_feed(
            cycle=empty_cycle,
            logs=[],
            period_end=period_end,
        )
        assert empty_resolution["feed_consumed_kg"] is None
        assert empty_resolution["history_complete"] is False

        stored_cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            start_date=date(2026, 7, 1),
            total_feed_consumed=Decimal("77.50"),
        )
        stored_cycle.refresh_from_db()
        stored_resolution = ReportService._resolve_legacy_cumulative_feed(
            cycle=stored_cycle,
            logs=[],
            period_end=period_end,
        )
        assert stored_resolution["source"] == "legacy_stored_total_minimum_known"
        assert stored_resolution["feed_consumed_kg"] == 77.5

        partial_cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            start_date=date(2026, 7, 1),
            total_feed_consumed=Decimal("77.50"),
        )
        partial_log = _create_cycle_log(
            cycle=partial_cycle,
            allocation=None,
            log_date=date(2026, 7, 19),
            mortality_count=0,
            feed_quantity="2.50",
            average_weight="200.00",
        )
        ProductionCycle.objects.filter(id=partial_cycle.id).update(
            total_feed_consumed=Decimal("77.50"),
            updated_at=timezone.make_aware(datetime(2026, 8, 2, 10, 0)),
        )
        partial_cycle.refresh_from_db()
        partial_resolution = ReportService._resolve_legacy_cumulative_feed(
            cycle=partial_cycle,
            logs=[partial_log],
            period_end=period_end,
        )
        assert partial_resolution["source"] == "legacy_logs_minimum_known"
        assert partial_resolution["history_complete"] is False
        assert "legacy_stored_total_feed_consumed_rejected_post_period" in partial_resolution["fallbacks_used"]

        partial_payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="monthly",
            period_start=date(2026, 7, 1),
            period_end=period_end,
            scope_type="cycle",
            cycle_id=str(partial_cycle.id),
        )
        assert partial_payload["cycles"][0]["current_metrics"]["fcr"] is None
        assert partial_payload["summary"]["feed_history_warning"] is True
        assert partial_payload["calculation_metadata"]["legacy_feed"]["history_complete"] is False

    def test_legacy_first_and_last_logs_do_not_prove_complete_feed_history(self):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="active",
            start_date=date(2026, 4, 1),
            total_feed_consumed=Decimal("5.00"),
        )
        first_log = _create_cycle_log(
            cycle=cycle,
            allocation=None,
            log_date=date(2026, 4, 1),
            mortality_count=0,
            feed_quantity="2.00",
            average_weight=None,
        )
        last_log = _create_cycle_log(
            cycle=cycle,
            allocation=None,
            log_date=date(2026, 7, 31),
            mortality_count=0,
            feed_quantity="3.00",
            average_weight=None,
        )
        ProductionCycle.objects.filter(id=cycle.id).update(
            total_feed_consumed=Decimal("5.00"),
            updated_at=timezone.make_aware(datetime(2026, 7, 31, 18, 0)),
        )
        cycle.refresh_from_db()

        resolution = ReportService._resolve_legacy_cumulative_feed(
            cycle=cycle,
            logs=[first_log, last_log],
            period_end=date(2026, 7, 31),
        )
        assert resolution["history_complete"] is False
        assert resolution["source"] == "legacy_logs_minimum_known"
        assert resolution["feed_consumed_kg"] == 5.0

        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="monthly",
            period_start=date(2026, 7, 1),
            period_end=date(2026, 7, 31),
            scope_type="cycle",
            cycle_id=str(cycle.id),
        )
        assert payload["cycles"][0]["current_metrics"]["fcr"] is None
        assert payload["summary"]["feed_history_warning"] is True

    def test_legacy_daily_logs_with_quantities_are_complete_and_fcr_is_available(self):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="active",
            start_date=date(2026, 7, 1),
            initial_count=100,
            initial_biomass=Decimal("2.00"),
            current_count=100,
            current_biomass=Decimal("20.00"),
            total_feed_consumed=Decimal("99.00"),
        )
        logs = [
            _create_cycle_log(
                cycle=cycle,
                allocation=None,
                log_date=date(2026, 7, day),
                mortality_count=0,
                feed_quantity="2.00",
                average_weight="200.00",
            )
            for day in range(1, 4)
        ]

        resolution = ReportService._resolve_legacy_cumulative_feed(
            cycle=cycle,
            logs=logs,
            period_end=date(2026, 7, 3),
        )
        assert resolution["history_complete"] is True
        assert resolution["source"] == "legacy_logs"
        assert resolution["feed_consumed_kg"] == 6.0

        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="monthly",
            period_start=date(2026, 7, 1),
            period_end=date(2026, 7, 3),
            scope_type="cycle",
            cycle_id=str(cycle.id),
        )
        assert payload["summary"]["feed_history_warning"] is False
        assert payload["cycles"][0]["current_metrics"]["fcr"] is not None

    def test_legacy_none_feed_quantity_makes_history_incomplete(self):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="active",
            start_date=date(2026, 7, 1),
            initial_count=100,
            initial_biomass=Decimal("2.00"),
            current_count=100,
            current_biomass=Decimal("20.00"),
        )
        logs = [
            _create_cycle_log(
                cycle=cycle,
                allocation=None,
                log_date=date(2026, 7, day),
                mortality_count=0,
                feed_quantity=None if day == 2 else "2.00",
                average_weight="200.00",
            )
            for day in range(1, 4)
        ]

        resolution = ReportService._resolve_legacy_cumulative_feed(
            cycle=cycle,
            logs=logs,
            period_end=date(2026, 7, 3),
        )
        assert resolution["history_complete"] is False
        assert resolution["source"] == "legacy_logs_minimum_known"
        assert resolution["feed_consumed_kg"] == 4.0

        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="monthly",
            period_start=date(2026, 7, 1),
            period_end=date(2026, 7, 3),
            scope_type="cycle",
            cycle_id=str(cycle.id),
        )
        assert payload["summary"]["feed_history_warning"] is True
        assert payload["cycles"][0]["current_metrics"]["fcr"] is None

    def test_legacy_logs_without_any_feed_quantity_are_unavailable(self):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="active",
            start_date=date(2026, 7, 1),
            total_feed_consumed=Decimal("0"),
        )
        log = _create_cycle_log(
            cycle=cycle,
            allocation=None,
            log_date=date(2026, 7, 1),
            mortality_count=0,
            feed_quantity=None,
            average_weight="200.00",
        )

        resolution = ReportService._resolve_legacy_cumulative_feed(
            cycle=cycle,
            logs=[log],
            period_end=date(2026, 7, 1),
        )
        assert resolution["history_complete"] is False
        assert resolution["source"] == "legacy_feed_unavailable"
        assert resolution["feed_consumed_kg"] is None

    def test_eligible_stored_feed_is_only_a_minimum_for_incomplete_logs(self):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            status="active",
            start_date=date(2026, 7, 1),
            total_feed_consumed=Decimal("30.00"),
        )
        log = _create_cycle_log(
            cycle=cycle,
            allocation=None,
            log_date=date(2026, 7, 1),
            mortality_count=0,
            feed_quantity="2.00",
            average_weight="200.00",
        )
        cycle.__class__.objects.filter(pk=cycle.pk).update(
            total_feed_consumed=Decimal("30.00"),
            updated_at=timezone.make_aware(datetime(2026, 7, 2, 12, 0)),
        )
        cycle.refresh_from_db()

        resolution = ReportService._resolve_legacy_cumulative_feed(
            cycle=cycle,
            logs=[log],
            period_end=date(2026, 7, 3),
        )

        assert resolution["history_complete"] is False
        assert resolution["feed_consumed_kg"] == 30.0
        assert resolution["source"] == "legacy_logs_minimum_known"
        assert "legacy_stored_total_minimum_known" in resolution["fallbacks_used"]
    def test_custom_unit_cycle_duration_is_used_for_cost_progress(self):
        today = date.today()
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            species="clarias",
            status="active",
            start_date=today - timedelta(days=74),
            planned_cycle_duration_days=150,
            initial_count=1800,
            current_count=1800,
            current_average_weight=Decimal("20.00"),
            current_biomass=Decimal("36.00"),
        )
        _create_allocation(cycle, _create_unit(farm_profile, "Bac 1", "3.00"), 900, 900, "18.00")
        _create_allocation(cycle, _create_unit(farm_profile, "Bac 2", "4.00"), 900, 900, "18.00")

        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="weekly",
            period_start=today - timedelta(days=6),
            period_end=today,
            scope_type="cycle",
            cycle_id=str(cycle.id),
        )

        assert payload["cycles"][0]["cycle"]["planned_cycle_duration_days"] == 150
        assert payload["calculation_metadata"]["other_costs_progress"] == pytest.approx(0.5, abs=0.01)

    def test_resolved_event_after_period_end_is_still_active(self):
        today = date.today()
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(farm_profile=farm_profile, status="active")
        event = _create_sanitary_log(
            cycle=cycle,
            allocation=None,
            event_date=today - timedelta(days=5),
            event_type="disease",
            symptoms="Suivi",
            resolved=True,
        )
        event.resolution_date = today + timedelta(days=2)
        event.save(update_fields=["resolution_date"])

        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=today,
            period_end=today,
            scope_type="cycle",
            cycle_id=str(cycle.id),
        )

        assert payload["summary"]["active_sanitary_events_count"] == 1
        assert payload["summary"]["active_sanitary_affected_fish_count"] == 0

    def test_unit_growth_logs_take_precedence_over_global_same_week(self):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(farm_profile=farm_profile, status="active")
        unit = _create_unit(farm_profile, "Bac 1", "3.00")
        allocation = _create_allocation(cycle, unit, 900, 900, "18.00")
        _create_cycle_log(
            cycle=cycle,
            allocation=None,
            log_date=date(2026, 7, 8),
            mortality_count=0,
            feed_quantity="1.00",
            average_weight="100.00",
        )
        _create_cycle_log(
            cycle=cycle,
            allocation=allocation,
            log_date=date(2026, 7, 8),
            mortality_count=0,
            feed_quantity="1.00",
            average_weight="10.00",
        )
        growth_logs = ReportService._build_growth_logs(cycle, [allocation], date(2026, 7, 6), date(2026, 7, 12))
        points = aggregate_growth_points(
            growth_logs,
            "weekly",
            date(2026, 7, 6),
            date(2026, 7, 12),
            {"previous": "Previous week", "current": "Covered week", "week": "Week"},
        )
        assert points[0]["value_g"] == 10

    def test_cycle_report_aggregates_allocations_and_counts_today_logs(self):
        today = date.today()
        yesterday = today - timedelta(days=1)
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            cycle_name="Cycle Clarias Juin 2026",
            species="clarias",
            status="active",
            initial_count=1800,
            current_count=1770,
            current_average_weight=Decimal("100.00"),
            current_biomass=Decimal("177.00"),
            total_feed_consumed=Decimal("14.50"),
        )

        bac_1 = _create_unit(farm_profile, "Bac 1", "3.00")
        bac_2 = _create_unit(farm_profile, "Bac 2", "4.00")
        allocation_1 = _create_allocation(cycle, bac_1, 1000, 990, "99.00")
        allocation_2 = _create_allocation(cycle, bac_2, 800, 780, "78.00")

        _create_cycle_log(
            cycle=cycle,
            allocation=allocation_1,
            log_date=today,
            mortality_count=10,
            feed_quantity="6.00",
            average_weight="100.00",
        )
        _create_cycle_log(
            cycle=cycle,
            allocation=allocation_2,
            log_date=yesterday,
            mortality_count=20,
            feed_quantity="8.50",
            average_weight="100.00",
        )
        _create_sanitary_log(
            cycle=cycle,
            allocation=allocation_1,
            event_date=today,
            event_type="disease",
            symptoms="Points blancs",
            resolved=False,
        )
        _create_sanitary_log(
            cycle=cycle,
            allocation=allocation_2,
            event_date=yesterday,
            event_type="treatment",
            symptoms="Traitement préventif",
            resolved=True,
        )

        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=yesterday,
            period_end=today,
            scope_type="cycle",
            cycle_id=str(cycle.id),
        )

        summary = payload["summary"]
        assert summary["total_units"] == 2
        assert summary["initial_fish_count"] == 1800
        assert summary["estimated_current_fish_count"] == 1770
        assert summary["total_mortality_count"] == 30
        assert summary["mortality_rate_pct"] == 1.67
        assert summary["total_feed_consumed_kg"] == 14.5
        assert summary["estimated_current_biomass_kg"] == 177.0
        assert summary["units_with_today_log_count"] == 1
        assert summary["units_missing_today_log_count"] == 1
        assert summary["active_sanitary_events_count"] == 1
        assert summary["comparison_units_count"] == 2

        assert len(payload["cycles"]) == 2
        assert len(payload["units"]) == 2
        assert payload["cycles"][0]["unit"]["production_unit_name"] == "Bac 1"
        assert payload["cycles"][1]["unit"]["production_unit_name"] == "Bac 2"
        assert payload["cycles"][0]["current_metrics"]["current_count"] == 990
        assert payload["cycles"][1]["current_metrics"]["current_count"] == 780
        assert payload["cycles"][0]["period_metrics"]["total_feed"] == 6.0
        assert payload["cycles"][1]["period_metrics"]["total_feed"] == 8.5
        assert payload["units"][0]["name"] == "Bac 1"
        assert payload["units"][0]["sanitary_status_short"] == "active"
        assert payload["units"][1]["sanitary_status_short"] == "ok"

    def test_unit_report_isolated_to_selected_allocation(self):
        today = date.today()
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            cycle_name="Cycle Silure Juin 2026",
            species="clarias",
            status="active",
            initial_count=1800,
            current_count=1770,
            current_average_weight=Decimal("100.00"),
            current_biomass=Decimal("177.00"),
            total_feed_consumed=Decimal("14.50"),
        )

        bac_1 = _create_unit(farm_profile, "Bac 1", "3.00")
        bac_2 = _create_unit(farm_profile, "Bac 2", "4.00")
        allocation_1 = _create_allocation(cycle, bac_1, 1000, 990, "99.00")
        allocation_2 = _create_allocation(cycle, bac_2, 800, 780, "78.00")

        _create_cycle_log(
            cycle=cycle,
            allocation=allocation_1,
            log_date=today,
            mortality_count=10,
            feed_quantity="6.00",
            average_weight="100.00",
        )
        _create_cycle_log(
            cycle=cycle,
            allocation=allocation_2,
            log_date=today,
            mortality_count=20,
            feed_quantity="8.50",
            average_weight="100.00",
        )
        _create_sanitary_log(
            cycle=cycle,
            allocation=allocation_1,
            event_date=today,
            event_type="disease",
            symptoms="Points blancs",
            resolved=False,
        )
        _create_sanitary_log(
            cycle=cycle,
            allocation=allocation_2,
            event_date=today,
            event_type="treatment",
            symptoms="Traitement préventif",
            resolved=True,
        )

        payload_bac_1 = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=today,
            period_end=today,
            scope_type="unit",
            scope_object_id=str(allocation_1.id),
        )
        payload_bac_2 = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=today,
            period_end=today,
            scope_type="unit",
            scope_object_id=str(allocation_2.id),
        )

        assert payload_bac_1["report_meta"]["scope_type"] == "unit"
        assert payload_bac_1["report_meta"]["cycle_unit_allocation_id"] == str(allocation_1.id)
        assert payload_bac_1["summary"]["total_units"] == 1
        assert payload_bac_1["summary"]["initial_fish_count"] == 1000
        assert payload_bac_1["summary"]["estimated_current_fish_count"] == 990
        assert payload_bac_1["summary"]["total_mortality_count"] == 10
        assert payload_bac_1["summary"]["total_feed_consumed_kg"] == 6.0
        assert payload_bac_1["summary"]["estimated_current_biomass_kg"] == 99.0
        assert payload_bac_1["summary"]["active_sanitary_events_count"] == 1
        assert payload_bac_1["cycles"][0]["unit"]["production_unit_name"] == "Bac 1"
        assert payload_bac_1["cycles"][0]["logs"][0]["mortality_count"] == 10
        assert payload_bac_1["cycles"][0]["sanitary_logs"][0]["resolved"] is False

        assert payload_bac_2["report_meta"]["scope_type"] == "unit"
        assert payload_bac_2["report_meta"]["cycle_unit_allocation_id"] == str(allocation_2.id)
        assert payload_bac_2["summary"]["total_units"] == 1
        assert payload_bac_2["summary"]["initial_fish_count"] == 800
        assert payload_bac_2["summary"]["estimated_current_fish_count"] == 780
        assert payload_bac_2["summary"]["total_mortality_count"] == 20
        assert payload_bac_2["summary"]["total_feed_consumed_kg"] == 8.5
        assert payload_bac_2["summary"]["estimated_current_biomass_kg"] == 78.0
        assert payload_bac_2["summary"]["active_sanitary_events_count"] == 0
        assert payload_bac_2["cycles"][0]["unit"]["production_unit_name"] == "Bac 2"
        assert payload_bac_2["cycles"][0]["logs"][0]["mortality_count"] == 20
        assert payload_bac_2["cycles"][0]["sanitary_logs"][0]["resolved"] is True

    def test_unit_report_uses_latest_state_available_at_generation_time(self):
        today = date.today()
        yesterday = today - timedelta(days=1)
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            cycle_name="Cycle Etat Courant",
            species="clarias",
            status="active",
            initial_count=900,
            current_count=900,
            current_average_weight=Decimal("20.00"),
            current_biomass=Decimal("18.00"),
            total_feed_consumed=Decimal("10.00"),
        )

        bac_1 = _create_unit(farm_profile, "Bac 1", "3.00")
        allocation = _create_allocation(cycle, bac_1, 900, 895, "17.90")

        _create_cycle_log(
            cycle=cycle,
            allocation=allocation,
            log_date=yesterday,
            mortality_count=5,
            feed_quantity="10.00",
            average_weight="20.00",
        )
        _create_sanitary_log(
            cycle=cycle,
            allocation=allocation,
            event_date=yesterday,
            event_type="disease",
            symptoms="Suspicion de maladie",
            resolved=False,
        )

        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=today,
            period_end=today,
            scope_type="unit",
            scope_object_id=str(allocation.id),
        )

        summary = payload["summary"]
        section = payload["cycles"][0]

        assert summary["estimated_current_fish_count"] == 895
        assert summary["total_mortality_count"] == 5
        assert summary["total_feed_consumed_kg"] == 10.0
        assert summary["active_sanitary_events_count"] == 1
        assert summary["units_with_today_log_count"] == 0
        assert summary["units_missing_today_log_count"] == 1
        assert section["current_metrics"]["current_count"] == 895
        assert section["current_metrics"]["total_feed_consumed"] == 10.0
        assert section["logs"] == []
        assert section["period_metrics"]["log_count"] == 0
        assert section["active_sanitary_logs"][0]["event_date"] == yesterday.isoformat()
        assert section["sanitary_logs"] == []

    def test_cycle_without_allocations_remains_stable(self):
        today = date.today()
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile,
            cycle_name="Cycle Legacy",
            status="active",
            initial_count=500,
            current_count=490,
            current_average_weight=Decimal("40.00"),
            current_biomass=Decimal("19.60"),
            total_feed_consumed=Decimal("5.00"),
        )

        _create_cycle_log(
            cycle=cycle,
            allocation=None,
            log_date=today,
            mortality_count=10,
            feed_quantity="5.00",
            average_weight="40.00",
        )
        _create_sanitary_log(
            cycle=cycle,
            allocation=None,
            event_date=today,
            event_type="disease",
            symptoms="Event legacy",
            resolved=False,
        )

        payload = ReportService._build_payload(
            farm_profile=farm_profile,
            report_type="daily",
            period_start=today,
            period_end=today,
            scope_type="cycle",
            cycle_id=str(cycle.id),
        )

        assert payload["summary"]["total_units"] == 0
        assert payload["summary"]["cycle_count"] == 1
        assert payload["summary"]["initial_fish_count"] == 500
        assert payload["summary"]["estimated_current_fish_count"] == 490
        assert payload["summary"]["total_mortality"] == 10
        assert payload["cycles"][0]["current_metrics"]["survival_rate"] == 98.0
        assert payload["summary"]["total_feed"] == 5.0
        assert payload["calculation_metadata"]["legacy_feed"]["source"] == "legacy_logs"
        assert payload["summary"]["active_sanitary_events_count"] == 1
        assert len(payload["cycles"]) == 1
        assert payload["cycles"][0]["sanitary_logs"] == []
        assert len(payload["global_sanitary_logs"]["active_logs"]) == 1
        assert len(payload["global_sanitary_logs"]["period_logs"]) == 1
        assert payload["cycles"][0]["cycle"]["id"] == str(cycle.id)
        assert payload["units"] == []

    def test_cycle_report_uses_latest_weight_for_units_biomass_and_growth(self):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile, status="active", start_date=date(2026, 6, 1),
            initial_count=1840, current_count=1840, current_biomass=Decimal("999.00"),
        )
        allocation_a = _create_allocation(cycle, _create_unit(farm_profile, "Bassin A", "3.00"), 920, 920, "999.00")
        allocation_b = _create_allocation(cycle, _create_unit(farm_profile, "Bassin B", "3.00"), 920, 920, "999.00")
        for allocation in (allocation_a, allocation_b):
            previous = _create_cycle_log(
                cycle=cycle, allocation=allocation, log_date=date(2026, 7, 12), mortality_count=0,
                feed_quantity="1.00", average_weight="165.00",
            )
            previous.sample_count = 20
            previous.save(update_fields=["sample_count"])
            current = _create_cycle_log(
                cycle=cycle, allocation=allocation, log_date=date(2026, 7, 19), mortality_count=0,
                feed_quantity="1.00", average_weight="198.00",
            )
            current.sample_count = 20
            current.save(update_fields=["sample_count"])

        payload = ReportService._build_payload(
            farm_profile=farm_profile, report_type="weekly", period_start=date(2026, 7, 13),
            period_end=date(2026, 7, 19), scope_type="cycle", cycle_id=str(cycle.id),
        )

        assert [section["current_metrics"]["current_average_weight"] for section in payload["cycles"]] == [198.0, 198.0]
        assert [section["current_metrics"]["current_biomass"] for section in payload["cycles"]] == [182.16, 182.16]
        assert payload["summary"]["estimated_current_biomass_kg"] == 364.32
        assert payload["growth_chart"]["points"][-1]["value_g"] == 198

    def test_cycle_report_separates_unit_and_global_sanitary_events(self):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(farm_profile=farm_profile, status="active")
        allocation_a = _create_allocation(cycle, _create_unit(farm_profile, "Bassin A", "3.00"), 920, 920, "182.16")
        _create_allocation(cycle, _create_unit(farm_profile, "Bassin B", "3.00"), 920, 920, "182.16")
        unit_event = _create_sanitary_log(
            cycle=cycle, allocation=allocation_a, event_date=date(2026, 7, 15), event_type="disease",
            symptoms="Points blancs", resolved=False,
        )
        unit_event.affected_count = 18
        unit_event.save(update_fields=["affected_count"])
        resolved_during_period = _create_sanitary_log(
            cycle=cycle, allocation=allocation_a, event_date=date(2026, 7, 10), event_type="treatment",
            symptoms="Traitement", resolved=True,
        )
        resolved_during_period.resolution_date = date(2026, 7, 17)
        resolved_during_period.save(update_fields=["resolution_date"])
        global_event = _create_sanitary_log(
            cycle=cycle, allocation=None, event_date=date(2026, 7, 16), event_type="water_quality",
            symptoms="Eau trouble", resolved=False,
        )
        global_event.affected_count = 5
        global_event.save(update_fields=["affected_count"])

        payload = ReportService._build_payload(
            farm_profile=farm_profile, report_type="weekly", period_start=date(2026, 7, 13),
            period_end=date(2026, 7, 19), scope_type="cycle", cycle_id=str(cycle.id),
        )

        section_a, section_b = payload["cycles"]
        assert section_a["active_sanitary_events_count"] == 1
        assert section_b["active_sanitary_events_count"] == 0
        assert len(section_a["active_sanitary_logs"]) == 1
        assert len(section_b["active_sanitary_logs"]) == 0
        assert len(section_a["sanitary_logs"]) == 2
        assert len(section_b["sanitary_logs"]) == 0
        assert len(payload["global_sanitary_logs"]["active_logs"]) == 1
        assert len(payload["global_sanitary_logs"]["period_logs"]) == 1

    def test_daily_report_keeps_last_known_weight_when_day_has_no_weighing(self):
        farm_profile = FarmProfileFactory()
        cycle = ProductionCycleFactory(
            farm_profile=farm_profile, status="active", start_date=date(2026, 6, 1),
            initial_count=920, current_count=920, current_biomass=Decimal("999.00"),
        )
        allocation = _create_allocation(cycle, _create_unit(farm_profile, "Bassin A", "3.00"), 920, 920, "999.00")
        previous = _create_cycle_log(
            cycle=cycle, allocation=allocation, log_date=date(2026, 7, 12), mortality_count=0,
            feed_quantity="1.00", average_weight="170.00",
        )
        previous.sample_count = 20
        previous.save(update_fields=["sample_count"])
        daily = _create_cycle_log(
            cycle=cycle, allocation=allocation, log_date=date(2026, 7, 19), mortality_count=0,
            feed_quantity="1.00", average_weight=None,
        )

        payload = ReportService._build_payload(
            farm_profile=farm_profile, report_type="daily", period_start=date(2026, 7, 19),
            period_end=date(2026, 7, 19), scope_type="cycle", cycle_id=str(cycle.id),
        )

        section = payload["cycles"][0]
        assert section["current_metrics"]["current_average_weight"] == 170.0
        assert section["current_metrics"]["current_biomass"] == 156.4
        assert section["logs"][0]["id"] == str(daily.id)
        assert section["logs"][0]["average_weight"] is None

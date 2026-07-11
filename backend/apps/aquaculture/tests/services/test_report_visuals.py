from datetime import date, time
from types import SimpleNamespace

from aquaculture.services.report_service import ReportService
from aquaculture.services.report_visuals import (
    aggregate_growth_points,
    build_cost_breakdown,
    build_donut_svg,
    build_growth_svg,
)


def _weight_log(log_date, weight=None, sample_count=None, sample_total_weight=None):
    return SimpleNamespace(
        log_date=log_date,
        log_time=time(8, 0),
        average_weight=weight,
        sample_count=sample_count,
        sample_total_weight=sample_total_weight,
    )


def test_latest_valid_weight_is_resolved_as_of_period_end_and_recalculates_biomass():
    logs = [_weight_log(date(2026, 7, 10), 170), _weight_log(date(2026, 7, 19), 198)]
    assert ReportService._resolve_latest_valid_weight_as_of(logs, date(2026, 7, 12)) == 170
    assert ReportService._resolve_latest_valid_weight_as_of(logs, date(2026, 7, 19)) == 198
    assert ReportService._resolve_latest_valid_weight_as_of(logs, date(2026, 7, 9)) is None
    assert round(920 * 198 / 1000, 2) == 182.16


def test_latest_valid_weight_recalculates_sample_total_when_average_missing():
    log = _weight_log(date(2026, 7, 19), sample_count=20, sample_total_weight=3960)
    assert ReportService._resolve_latest_valid_weight_as_of([log], date(2026, 7, 19)) == 198


def test_growth_uses_sample_count_weighting_and_legacy_fallback():
    points = aggregate_growth_points(
        [
            {"log_date": "2026-07-06", "average_weight": 10, "sample_count": 10},
            {"log_date": "2026-07-07", "average_weight": 20, "sample_count": 30},
        ],
        "monthly",
        date(2026, 7, 1),
        date(2026, 7, 31),
    )
    assert points[0]["value_g"] == 17.5


def test_weekly_growth_uses_previous_and_current_week_only():
    points = aggregate_growth_points(
        [
            {"log_date": "2026-07-06", "average_weight": 25, "sample_count": 10},
            {"log_date": "2026-07-13", "average_weight": 31, "sample_count": 20},
        ],
        "weekly",
        date(2026, 7, 13),
        date(2026, 7, 19),
        {"previous": "Previous week", "current": "Covered week", "week": "Week", "language": "en"},
    )

    assert [point["value_g"] for point in points] == [25, 31]
    assert [point["label"] for point in points] == ["06–12 Jul", "13–19 Jul"]


def test_cost_breakdown_excludes_zero_values_and_has_no_nan():
    result = build_cost_breakdown({"feed": 100, "fingerlings": 0, "other": 25})
    assert result["total_fcfa"] == 125
    assert len(result["items"]) == 2
    assert sum(item["amount_fcfa"] for item in result["items"]) == result["total_fcfa"]
    svg = build_donut_svg(result["items"], center_value="125 FCFA", center_label="Coût total")
    assert svg.startswith("<svg")
    assert "125 FCFA" in svg
    assert "Coût total" in svg
    assert build_donut_svg([]) == ""
    assert build_donut_svg([{"key": "feed", "amount_fcfa": 125, "percentage": 100}]).count("<circle") == 2
    growth_svg = build_growth_svg([
        {"label": "Previous week", "value_g": 25},
        {"label": "Covered week", "value_g": 31},
    ])
    assert build_growth_svg([]) == ""
    assert '<svg' in growth_svg and '<rect' in growth_svg
    assert 'width="520"' in growth_svg and 'height="220"' in growth_svg


def test_enriched_payload_separates_direct_and_total_costs():
    payload = {
        "economic_plan": {
            "feed_cost_consumed_fcfa": 185000,
            "fingerlings_cost_fcfa": 95000,
            "other_operational_costs_fcfa": 42000,
        },
        "cycles": [{
            "cycle": {
                "start_date": "2026-01-01",
                "status": "harvested",
                "species": "clarias",
            },
            "dashboard_metrics": {"estimated_market_value_fcfa": 0, "feed_cost_consumed_fcfa": 185000},
            "economic_plan": {},
            "logs": [],
        }],
        "growth_logs": [],
    }
    enriched = ReportService._enrich_payload(
        payload,
        report_type="monthly",
        period_end=date(2026, 7, 31),
    )
    assert enriched["cycle_dashboard"]["direct_production_cost_fcfa"] == 280000
    assert enriched["cycle_dashboard"]["total_production_cost_to_date_fcfa"] == 322000
    assert enriched["cost_breakdown"]["total_fcfa"] == 322000

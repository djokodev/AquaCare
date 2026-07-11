from datetime import date

from aquaculture.services.report_visuals import (
    aggregate_growth_points,
    build_cost_breakdown,
    build_donut_svg,
    build_growth_svg,
)


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

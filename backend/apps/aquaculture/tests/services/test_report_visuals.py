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
            {'log_date': '2026-07-06', 'average_weight': 10, 'sample_count': 10},
            {'log_date': '2026-07-07', 'average_weight': 20, 'sample_count': 30},
        ],
        'monthly',
        date(2026, 7, 1),
        date(2026, 7, 31),
    )
    assert points[0]['value_g'] == 17.5


def test_cost_breakdown_excludes_zero_values_and_has_no_nan():
    result = build_cost_breakdown({'feed': 100, 'fingerlings': 0, 'other': 25})
    assert result['total_fcfa'] == 125
    assert len(result['items']) == 2
    assert sum(item['amount_fcfa'] for item in result['items']) == result['total_fcfa']
    assert build_donut_svg(result['items']).startswith('<svg')
    assert build_donut_svg([]) == ''
    assert build_growth_svg([]) == ''

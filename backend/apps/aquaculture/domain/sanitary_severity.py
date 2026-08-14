"""Stable sanitary severity mapping independent from mutable stock metrics."""

from typing import Final

SANITARY_SEVERITY_BY_EVENT_TYPE: Final[dict[str, str]] = {
    'disease': 'critical',
    'abnormal_mortality': 'critical',
    'water_quality': 'warning',
    'treatment': 'info',
    'vaccination': 'info',
    'other': 'info',
}


def sanitary_severity(event_type: str) -> str:
    """Return the historical severity determined solely by event type."""
    return SANITARY_SEVERITY_BY_EVENT_TYPE.get(event_type, 'info')

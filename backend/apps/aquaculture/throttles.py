from __future__ import annotations

from rest_framework.throttling import UserRateThrottle


class AquacultureSyncThrottle(UserRateThrottle):
    """Throttle for offline sync requests."""

    scope = "aquaculture_sync"


class AquacultureReportActionThrottle(UserRateThrottle):
    """Throttle for report generation and dispatch actions."""

    scope = "aquaculture_report_action"


class AquacultureSanitaryActionThrottle(UserRateThrottle):
    """Throttle for sanitary issue mutations."""

    scope = "aquaculture_sanitary_action"

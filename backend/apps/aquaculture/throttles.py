from __future__ import annotations

from rest_framework.throttling import UserRateThrottle


class AquacultureSyncThrottle(UserRateThrottle):
    """Throttle for offline sync requests."""

    scope = "aquaculture_sync"


class AquacultureReportActionThrottle(UserRateThrottle):
    """Throttle for report generation and dispatch actions."""

    scope = "aquaculture_report_action"


class AquacultureReportDownloadThrottle(UserRateThrottle):
    """Throttle for report PDF downloads."""

    scope = "aquaculture_report_download"


class AquacultureSanitaryActionThrottle(UserRateThrottle):
    """Throttle for sanitary issue mutations."""

    scope = "aquaculture_sanitary_action"


class AquacultureProductionPlanSetupThrottle(UserRateThrottle):
    """
    Throttle for production-plan setup mutations.

    Reuses the existing rate scope to keep runtime settings backward compatible.
    """

    scope = "accounts_farm_setup"


class AquacultureProductionPlanSimulationThrottle(UserRateThrottle):
    """
    Throttle for production-plan simulation requests.

    Reuses the existing rate scope to keep runtime settings backward compatible.
    """

    scope = "accounts_simulation"

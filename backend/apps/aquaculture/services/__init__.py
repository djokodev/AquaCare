"""
Services métier pour le module aquaculture.

Ce package centralise toute la logique métier du système aquaculture
dans des services stateless, réutilisables et testables.

Architecture :
- Services découplés des views/serializers
- Logique métier atomique et cohérente
- Validation métier centralisée
- Gestion transactionnelle explicite

Utilisation dans views.py :
    from aquaculture.services import ProductionCycleService

    @action(detail=True, methods=['post'])
    def harvest(self, request, pk=None):
        cycle = self.get_object()
        harvested = ProductionCycleService.harvest_cycle(
            cycle, **serializer.validated_data
        )
        return Response(...)
"""
from .analytics_service import AnalyticsService
from .annual_simulation_service import (
    AQUACARE_FEE_PER_KG,
    AnnualSimulationResult,
    AnnualSimulationService,
)
from .base import BaseService
from .cycle_application_service import HarvestCycleCommand, PartialHarvestCommand, ProductionCycleApplicationService
from .cycle_service import ProductionCycleService
from .dashboard_application_service import DashboardApplicationService, InvalidDashboardCycleScopeError
from .dashboard_service import DashboardService
from .feeding_application_service import (
    FeedingCycleNotFoundError,
    FeedingPlanApplicationService,
    GenerateFeedingPlansCommand,
)
from .feeding_service import FeedingPlanService
from .farm_production_plan_service import FarmProductionPlanService
from .log_application_service import (
    CycleLogApplicationService,
    CycleLogMutationResult,
    UnauthorizedCycleAccessError,
)
from .log_service import CycleLogService
from .report_application_service import (
    GenerateReportCommand,
    InvalidReportCycleScopeError,
    MissingReportEmailError,
    ReportApplicationService,
    ReportDownloadDecision,
    WhatsAppShareCommand,
)
from .report_service import ReportService
from .sanitary_application_service import (
    CreateSanitaryLogCommand,
    ResolveSanitaryIssueCommand,
    SanitaryApplicationService,
)
from .sanitary_service import SanitaryService
from .sync_application_service import SyncApplicationService, SyncExecutionResult
from .sync_service import SyncService

__all__ = [
    'BaseService',
    'ProductionCycleService',
    'ProductionCycleApplicationService',
    'HarvestCycleCommand',
    'PartialHarvestCommand',
    'CycleLogService',
    'CycleLogApplicationService',
    'CycleLogMutationResult',
    'UnauthorizedCycleAccessError',
    'FeedingPlanService',
    'FarmProductionPlanService',
    'FeedingPlanApplicationService',
    'FeedingCycleNotFoundError',
    'GenerateFeedingPlansCommand',
    'AnalyticsService',
    'AnnualSimulationService',
    'AnnualSimulationResult',
    'AQUACARE_FEE_PER_KG',
    'DashboardApplicationService',
    'InvalidDashboardCycleScopeError',
    'GenerateReportCommand',
    'InvalidReportCycleScopeError',
    'MissingReportEmailError',
    'ReportApplicationService',
    'ReportDownloadDecision',
    'ReportService',
    'SanitaryService',
    'SanitaryApplicationService',
    'CreateSanitaryLogCommand',
    'ResolveSanitaryIssueCommand',
    'SyncService',
    'SyncApplicationService',
    'SyncExecutionResult',
    'WhatsAppShareCommand',
    'DashboardService',
]

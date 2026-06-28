"""
ViewSets DRF et vues API pour le module aquaculture.

Re-exporte tous les ViewSets pour maintenir la compatibilité avec urls.py.
"""
from .cycle_views import ProductionCycleViewSet
from .dashboard_views import DashboardView
from .feeding_views import FeedingPlanViewSet
from .log_views import CycleLogViewSet
from .nutritional_views import NutritionalGuideViewSet
from .production_unit_views import CycleUnitAllocationViewSet, ProductionUnitViewSet
from .production_plan_views import ProductionPlanSetupView, ProductionPlanSimulationView
from .report_views import ProductionReportViewSet
from .sanitary_views import SanitaryLogViewSet
from .sync_views import SyncView

__all__ = [
    'ProductionCycleViewSet',
    'CycleLogViewSet',
    'FeedingPlanViewSet',
    'SanitaryLogViewSet',
    'NutritionalGuideViewSet',
    'ProductionUnitViewSet',
    'CycleUnitAllocationViewSet',
    'ProductionPlanSetupView',
    'ProductionPlanSimulationView',
    'ProductionReportViewSet',
    'DashboardView',
    'SyncView',
]

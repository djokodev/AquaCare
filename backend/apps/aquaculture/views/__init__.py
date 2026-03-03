"""
ViewSets DRF et vues API pour le module aquaculture.

Re-exporte tous les ViewSets pour maintenir la compatibilité avec urls.py.
"""
from .cycle_views import ProductionCycleViewSet
from .log_views import CycleLogViewSet
from .feeding_views import FeedingPlanViewSet
from .sanitary_views import SanitaryLogViewSet
from .nutritional_views import NutritionalGuideViewSet
from .report_views import ProductionReportViewSet
from .dashboard_views import DashboardView
from .sync_views import SyncView

__all__ = [
    'ProductionCycleViewSet',
    'CycleLogViewSet',
    'FeedingPlanViewSet',
    'SanitaryLogViewSet',
    'NutritionalGuideViewSet',
    'ProductionReportViewSet',
    'DashboardView',
    'SyncView',
]

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
from .base import BaseService
from .cycle_service import ProductionCycleService
from .log_service import CycleLogService
from .feeding_service import FeedingPlanService
from .analytics_service import AnalyticsService
# NotificationService moved to apps/notifications/services.py
# from .notification_service import NotificationService
from .sanitary_service import SanitaryService
from .sync_service import SyncService

__all__ = [
    'BaseService',
    'ProductionCycleService',
    'CycleLogService',
    'FeedingPlanService',
    'AnalyticsService',
    # 'NotificationService',  # Moved to apps/notifications
    'SanitaryService',
    'SyncService',
]

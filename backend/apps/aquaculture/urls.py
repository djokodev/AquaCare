"""
Configuration des URLs pour le module aquaculture de MAVECAM AquaCare.
Définit les endpoints d'API REST pour la gestion de la pisciculture.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ProductionCycleViewSet, CycleLogViewSet, FeedingPlanViewSet,
    SanitaryLogViewSet, NutritionalGuideViewSet,
    DashboardView, SyncView, ProductionReportViewSet
)

app_name = 'aquaculture'

# DRF Router for ViewSets
router = DefaultRouter()
router.register(r'cycles', ProductionCycleViewSet, basename='production-cycle')
router.register(r'cycle-logs', CycleLogViewSet, basename='cycle-log')
router.register(r'feeding-plans', FeedingPlanViewSet, basename='feeding-plan')
router.register(r'sanitary-logs', SanitaryLogViewSet, basename='sanitary-log')
router.register(r'nutritional-guides', NutritionalGuideViewSet, basename='nutritional-guide')
router.register(r'reports', ProductionReportViewSet, basename='production-report')
# router.register(r'notifications', NotificationViewSet, basename='notification')  # Moved to /api/notifications/

urlpatterns = [
    # Dashboard - Main entry point for mobile app
    path('dashboard/', DashboardView.as_view(), name='dashboard'),
    
    # Synchronization endpoint for offline-first mobile app
    path('sync/', SyncView.as_view(), name='sync'),
    
    # Include all ViewSet routes
    path('', include(router.urls)),
]

"""
API Endpoints Summary:

DASHBOARD & SYNC:
GET  /api/aquaculture/dashboard/           - Complete dashboard data
POST /api/aquaculture/sync/                - Offline synchronization

PRODUCTION CYCLES:
GET    /api/aquaculture/cycles/            - List user's cycles
POST   /api/aquaculture/cycles/            - Create new cycle
GET    /api/aquaculture/cycles/{id}/       - Get cycle details
PUT    /api/aquaculture/cycles/{id}/       - Update cycle
DELETE /api/aquaculture/cycles/{id}/       - Delete cycle
POST   /api/aquaculture/cycles/{id}/harvest/ - Complete cycle (harvest)
GET    /api/aquaculture/cycles/{id}/statistics/ - Detailed cycle statistics
GET    /api/aquaculture/cycles/{id}/comparison/ - Compare with previous cycles

DAILY LOGS:
GET    /api/aquaculture/cycle-logs/        - List logs (filterable by cycle_id)
POST   /api/aquaculture/cycle-logs/        - Create daily log
GET    /api/aquaculture/cycle-logs/{id}/   - Get log details
PUT    /api/aquaculture/cycle-logs/{id}/   - Update log
DELETE /api/aquaculture/cycle-logs/{id}/   - Delete log
POST   /api/aquaculture/cycle-logs/bulk_create/ - Bulk create for sync

FEEDING PLANS:
GET    /api/aquaculture/feeding-plans/     - List active feeding plans
POST   /api/aquaculture/feeding-plans/     - Create feeding plan
GET    /api/aquaculture/feeding-plans/{id}/ - Get plan details
PUT    /api/aquaculture/feeding-plans/{id}/ - Update plan
DELETE /api/aquaculture/feeding-plans/{id}/ - Delete plan
POST   /api/aquaculture/feeding-plans/generate/ - Auto-generate plans

SANITARY LOGS:
GET    /api/aquaculture/sanitary-logs/     - List sanitary events
POST   /api/aquaculture/sanitary-logs/     - Create sanitary log (with photo)
GET    /api/aquaculture/sanitary-logs/{id}/ - Get log details
PUT    /api/aquaculture/sanitary-logs/{id}/ - Update log
DELETE /api/aquaculture/sanitary-logs/{id}/ - Delete log
POST   /api/aquaculture/sanitary-logs/{id}/resolve/ - Mark as resolved
GET    /api/aquaculture/sanitary-logs/active_issues/ - Get unresolved issues

NUTRITIONAL GUIDES (Read-only reference data):
GET    /api/aquaculture/nutritional-guides/ - List all guides
GET    /api/aquaculture/nutritional-guides/{id}/ - Get guide details
GET    /api/aquaculture/nutritional-guides/for_species/?species=clarias - Guides for species

NOTIFICATIONS:
GET    /api/aquaculture/notifications/     - List user notifications
POST   /api/aquaculture/notifications/     - Create notification
GET    /api/aquaculture/notifications/{id}/ - Get notification details
PUT    /api/aquaculture/notifications/{id}/ - Update notification
DELETE /api/aquaculture/notifications/{id}/ - Delete notification
POST   /api/aquaculture/notifications/{id}/mark_read/ - Mark as read
POST   /api/aquaculture/notifications/mark_all_read/ - Mark all as read

QUERY PARAMETERS:
- cycle-logs: ?cycle_id=uuid (filter logs by cycle)
- nutritional-guides: ?species=clarias (filter by species)
- All list endpoints support DRF pagination, ordering, and filtering

AUTHENTICATION:
All endpoints require JWT token authentication via Authorization header:
Authorization: Bearer <access_token>

PERMISSIONS:
- Users can only access their own farm's data
- Farm profiles are automatically linked to authenticated user
- No cross-farm data access allowed

ERROR RESPONSES:
- 400: Bad Request (validation errors)
- 401: Unauthorized (no/invalid token)
- 403: Forbidden (not user's data)
- 404: Not Found
- 500: Internal Server Error

SYNC ENDPOINT DETAILS:
POST /api/aquaculture/sync/
Request body:
{
    "cycle_logs": [...],           // Array of CycleLog objects
    "sanitary_logs": [...],        // Array of SanitaryLog objects  
    "new_cycles": [...],           // Array of ProductionCycle objects
    "last_sync": "2024-01-14T18:00:00Z",  // ISO datetime
    "client_id": "uuid"            // Device identifier
}

Response:
{
    "status": "success",
    "timestamp": "2024-01-15T09:30:00Z",
    "processed": {
        "cycle_logs": 15,
        "sanitary_logs": 2,
        "new_cycles": 1
    },
    "errors": [],
    "server_updates": {
        "cycles": [...],           // Updated cycles since last_sync
        "logs": [...],             // New server-side logs
        "feeding_plans": [...]     // New feeding plans
    }
}

MOBILE APP INTEGRATION:
1. Initial load: GET /api/aquaculture/dashboard/
2. Daily sync: POST /api/aquaculture/sync/
3. Real-time updates: Individual CRUD operations
4. Photo uploads: Use multipart/form-data content type
5. Offline support: Store data locally, sync when connected
"""

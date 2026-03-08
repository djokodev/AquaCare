"""
URLs pour l'API REST des notifications.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import NotificationPreferenceViewSet, NotificationViewSet

# Router pour les ViewSets
router = DefaultRouter()
router.register(r'notifications', NotificationViewSet, basename='notification')

app_name = 'notifications'

urlpatterns = [
    # ViewSet routes (notifications)
    path('', include(router.urls)),

    # Notification preferences endpoints
    path('notification-preferences/', NotificationPreferenceViewSet.as_view({
        'get': 'list',
        'put': 'update',
        'patch': 'partial_update'
    }), name='notification-preferences'),
]

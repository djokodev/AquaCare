# coding: utf-8
"""
URL configuration for chat app.
Maps API endpoints to viewsets.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import ConversationViewSet

# Create router and register viewsets
router = DefaultRouter()
router.register(r'conversations', ConversationViewSet, basename='conversation')

# URL patterns
urlpatterns = [
    path('', include(router.urls)),
]

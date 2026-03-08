"""
Configuration URLs pour le module commerce MAVECAM AquaCare.

Routes API REST pour catalogue produits et gestion commandes.
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import OrderViewSet, ProductViewSet

# Router DRF pour URLs automatiques
router = DefaultRouter()
router.register(r'products', ProductViewSet, basename='product')
router.register(r'orders', OrderViewSet, basename='order')

app_name = 'commerce'

urlpatterns = [
    path('', include(router.urls)),
]

"""
Configuration des URLs principales - MAVECAM AquaCare API.

Structure de l'API:
- /admin/ : Interface d'administration Django pour équipe MAVECAM
- /api/accounts/ : Authentification et profils utilisateurs
- /api/aquaculture/ : Cycles de production et logs (Phase 2)
- /api/commerce/ : Catalogue et commandes (Phase 3)
- /api/support/ : Assistance technique (Phase 4)
- /api/education/ : Guides et formation (Phase 5)
"""
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.conf import settings
from django.conf.urls.static import static
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView

def api_root(request):
    """Endpoint racine fournissant les informations sur l'API."""
    return JsonResponse({
        'api': 'AquaCare API',
        'version': '1.0.0 MVP',
        'documentation': {
            'swagger': '/api/docs/',
            'redoc': '/api/redoc/',
            'schema': '/api/schema/',
        },
        'endpoints': {
            'accounts': '/api/accounts/',
            'aquaculture': '/api/aquaculture/',
            'commerce': '/api/commerce/',
            'notifications': '/api/notifications/',
            'support': '/api/support/',
            'admin': '/admin/',
        },
    })

def health_check(request):
    """Health check endpoint pour Docker healthchecks et monitoring."""
    from django.db import connection
    try:
        # Test connexion database
        connection.ensure_connection()
        return JsonResponse({
            'status': 'healthy',
            'database': 'connected',
            'api': 'operational'
        }, status=200)
    except Exception as e:
        return JsonResponse({
            'status': 'unhealthy',
            'database': 'disconnected',
            'error': str(e)
        }, status=503)

urlpatterns = [
    path('i18n/', include('django.conf.urls.i18n')),  # Required for Jazzmin language switcher
    path('admin/', admin.site.urls),
    path('api/', api_root, name='api-root'),
    path('api/health/', health_check, name='health-check'),  # Health check pour Docker

    # Documentation Swagger/OpenAPI
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),

    # API Endpoints
    path('api/accounts/', include('accounts.urls')),
    path('api/aquaculture/', include('apps.aquaculture.urls')),
    path('api/commerce/', include('apps.commerce.urls')),  # Module commerce
    path('api/support/', include('apps.chat.urls')),  # Module chat support
    path('api/', include('apps.notifications.urls')),  # Module notifications

]

# Servir les fichiers media en développement
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

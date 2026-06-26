"""
Configuration des URLs principales - AquaCare API.

Structure de l'API:
- /admin/ : Interface d'administration Django pour l'équipe AquaCare
- /api/accounts/ : Authentification et profils utilisateurs
- /api/aquaculture/ : Cycles de production et logs (Phase 2)
- /api/commerce/ : Catalogue et commandes (Phase 3)
- /api/support/ : Assistance technique (Phase 4)
- /api/education/ : Guides et formation (Phase 5)
"""
from __future__ import annotations

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.core.cache import cache
from django.db.utils import DatabaseError
from django.http import HttpRequest, JsonResponse
from django.urls import include, path
from django.views.generic import TemplateView
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView


def api_root(request: HttpRequest) -> JsonResponse:
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

def health_check(request: HttpRequest) -> JsonResponse:
    """Health check endpoint pour Docker healthchecks et monitoring."""
    from django.db import connection

    checks = {
        'database': 'connected',
        'cache': 'connected',
    }
    status_code = 200

    try:
        # Test connexion database
        connection.ensure_connection()
    except DatabaseError:
        checks['database'] = 'disconnected'
        status_code = 503

    try:
        cache.get('health-check')
    except Exception:
        checks['cache'] = 'disconnected'
        status_code = 503

    return JsonResponse({
        'status': 'healthy' if status_code == 200 else 'unhealthy',
        'database': checks['database'],
        'cache': checks['cache'],
        'api': 'operational' if status_code == 200 else 'degraded',
    }, status=status_code)


urlpatterns = [
    # Legal pages (required for Google Play Store)
    path(
        'privacy-policy/',
        TemplateView.as_view(template_name='legal/privacy_policy.html'),
        name='privacy-policy',
    ),
    path(
        'account-deletion/',
        TemplateView.as_view(template_name='legal/account_deletion.html'),
        name='account-deletion',
    ),

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
    path('api/aquaculture/', include('aquaculture.urls')),
    path('api/commerce/', include('commerce.urls')),  # Module commerce
    path('api/support/', include('chat.urls')),  # Module chat support
    path('api/', include('notifications.urls')),  # Module notifications

]

# Servir les fichiers media en développement
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

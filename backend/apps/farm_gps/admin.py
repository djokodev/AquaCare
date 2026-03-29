import json

from django.contrib import admin
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _

from .models import GeolocatedFarm


@admin.register(GeolocatedFarm)
class GeolocatedFarmAdmin(admin.ModelAdmin):
    """
    Section GPS de l'admin : liste des fermes géolocalisées + carte Leaflet interactive.
    Cliquer sur une ligne de la liste centre la carte sur cette ferme.
    """

    list_display = (
        'farm_name',
        'owner_display',
        'owner_phone_display',
        'location_address',
        'coordinates_display',
        'certification_badge',
        'gps_captured_at',
    )
    list_filter = ('certification_status', 'user__region', 'user__activity_type')
    search_fields = (
        'farm_name',
        'user__first_name',
        'user__last_name',
        'user__phone_number',
        'location_address',
    )
    ordering = ('-updated_at',)

    # Tous les champs GPS sont en lecture seule (saisis depuis le mobile)
    readonly_fields = (
        'id', 'latitude', 'longitude', 'location_address',
        'created_at', 'updated_at',
    )

    fieldsets = (
        (_('Ferme'), {
            'fields': ('user', 'farm_name', 'certification_status'),
        }),
        (_('Coordonnées GPS'), {
            'fields': ('latitude', 'longitude', 'location_address', 'updated_at'),
        }),
    )

    def get_queryset(self, request):
        return (
            super().get_queryset(request)
            .select_related('user')
            .filter(latitude__isnull=False, longitude__isnull=False, is_deleted=False)
        )

    def has_add_permission(self, request):
        """La géolocalisation se fait depuis le mobile, pas depuis l'admin."""
        return False

    # ── Display methods ──────────────────────────────────────────────────────

    def owner_display(self, obj):
        return obj.user.display_name
    owner_display.short_description = _('Propriétaire')
    owner_display.admin_order_field = 'user__first_name'

    def owner_phone_display(self, obj):
        return obj.user.phone_number
    owner_phone_display.short_description = _('Téléphone')

    def coordinates_display(self, obj):
        if obj.latitude and obj.longitude:
            return format_html(
                '<span style="font-family:monospace;font-size:11px;">{}, {}</span>',
                float(obj.latitude),
                float(obj.longitude),
            )
        return '—'
    coordinates_display.short_description = _('Coordonnées')

    def certification_badge(self, obj):
        colors = {
            'certified': ('#28a745', 'Certifiée'),
            'pending': ('#fd7e14', 'En attente'),
            'suspended': ('#dc3545', 'Suspendue'),
            'rejected': ('#6c757d', 'Rejetée'),
        }
        color, label = colors.get(obj.certification_status, ('#999', obj.certification_status))
        return format_html(
            '<span style="background:{};color:white;padding:2px 8px;border-radius:10px;font-size:11px;">{}</span>',
            color, label,
        )
    certification_badge.short_description = _('Certification')
    certification_badge.admin_order_field = 'certification_status'

    def gps_captured_at(self, obj):
        if obj.updated_at:
            return obj.updated_at.strftime('%d/%m/%Y %H:%M')
        return '—'
    gps_captured_at.short_description = _('Capturé le')
    gps_captured_at.admin_order_field = 'updated_at'

    # ── Changelist view avec carte ────────────────────────────────────────────

    def changelist_view(self, request, extra_context=None):
        extra_context = extra_context or {}

        farms_qs = self.get_queryset(request)
        farms_data = [
            {
                'id': str(farm.pk),
                'farm_name': farm.farm_name or '',
                'latitude': str(farm.latitude),
                'longitude': str(farm.longitude),
                'location_address': farm.location_address or '',
                'certification_status': farm.certification_status,
                'owner_name': farm.user.display_name,
                'owner_phone': farm.user.phone_number,
            }
            for farm in farms_qs
        ]
        extra_context['farms_json'] = json.dumps(farms_data, ensure_ascii=False)
        return super().changelist_view(request, extra_context)

from django.contrib import admin
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _

from .models import GeolocatedFarm


@admin.register(GeolocatedFarm)
class GeolocatedFarmAdmin(admin.ModelAdmin):
    """
    Section GPS de l'admin : liste des fermes géolocalisées.
    """

    list_display = (
        'farm_name',
        'owner_display',
        'owner_phone_display',
        'location_address',
        'coordinates_display',
        'gps_captured_at',
    )
    list_filter = ('user__region',)
    search_fields = (
        'farm_name',
        'user__first_name',
        'user__last_name',
        'user__phone_number',
        'location_address',
    )
    ordering = ('-updated_at',)

    readonly_fields = (
        'id', 'latitude', 'longitude', 'location_address',
        'created_at', 'updated_at',
    )

    fieldsets = (
        (_('Ferme'), {
            'fields': ('user', 'farm_name'),
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

    def gps_captured_at(self, obj):
        if obj.updated_at:
            return obj.updated_at.strftime('%d/%m/%Y %H:%M')
        return '—'
    gps_captured_at.short_description = _('Capturé le')
    gps_captured_at.admin_order_field = 'updated_at'

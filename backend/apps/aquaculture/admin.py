"""
Administration securisee du module aquaculture AquaCare.
Implemente le RBAC multi-niveau avec audit logging.

Roles:
- OWNER (is_superuser): Controle total
- MANAGERS (aquacare_managers): Acces complet aquaculture
- COMMERCE (aquacare_commerce): Lecture seule pour contexte
- SUPPORT: Pas d'acces
"""
import csv
import io
import logging
import zipfile
from datetime import date

from common.admin_mixins import (
    RBACConstants,
    SecuredModelAdmin,
)
from django.contrib import admin, messages
from django.contrib.admin.models import CHANGE
from django.db.models import Avg, Count, Sum
from django.http import HttpResponse, HttpResponseRedirect
from django.urls import reverse
from django.utils.html import escape, format_html, mark_safe
from django.utils.translation import gettext_lazy as _

from .models import (
    CycleLog,
    CycleMetrics,
    CycleUnitAllocation,
    FeedingPlan,
    NutritionalGuide,
    ProductionCycle,
    ProductionReport,
    ProductionUnit,
    ReportDispatchLog,
    SanitaryLog,
)

logger = logging.getLogger(__name__)


class AquacultureSecuredAdmin(SecuredModelAdmin):
    """
    Base class pour tous les admins du module aquaculture.
    Managers et commerce ont acces, support n'a pas acces.
    """

    def has_module_permission(self, request):
        """Managers et commerce peuvent voir le module aquaculture."""
        if request.user.is_superuser:
            return True

        user_groups = set(request.user.groups.values_list('name', flat=True))

        # Managers: acces complet
        if RBACConstants.GROUP_MANAGERS in user_groups:
            return True

        # Commerce: acces lecture pour contexte produits
        if RBACConstants.GROUP_COMMERCE in user_groups:
            return True

        return False

    def has_add_permission(self, request):
        """Seuls superusers et managers peuvent ajouter."""
        if request.user.is_superuser:
            return True
        return request.user.groups.filter(
            name=RBACConstants.GROUP_MANAGERS
        ).exists()

    def has_change_permission(self, request, obj=None):
        """Seuls superusers et managers peuvent modifier."""
        if request.user.is_superuser:
            return True
        return request.user.groups.filter(
            name=RBACConstants.GROUP_MANAGERS
        ).exists()

    def has_delete_permission(self, request, obj=None):
        """Seul superuser peut supprimer."""
        return request.user.is_superuser

    def get_search_fields(self, request):
        """Retire phone_number de la recherche pour non-managers."""
        search_fields = list(getattr(self, 'search_fields', []))

        # Retirer les champs contenant phone_number pour non-superusers
        if not request.user.is_superuser:
            is_manager = request.user.groups.filter(
                name=RBACConstants.GROUP_MANAGERS
            ).exists()

            if not is_manager:
                search_fields = [
                    f for f in search_fields
                    if 'phone_number' not in f
                ]

        return search_fields


class CycleUnitAllocationInline(admin.TabularInline):
    """Affiche les allocations directement depuis la page d'un cycle."""

    model = CycleUnitAllocation
    fk_name = 'cycle'
    extra = 0
    show_change_link = True
    fields = (
        'production_unit',
        'initial_fish_count',
        'current_fish_count',
        'initial_biomass_kg',
        'current_biomass_kg',
        'expected_survival_rate_pct',
        'survival_rate_pct',
        'created_at',
    )
    readonly_fields = ('survival_rate_pct', 'created_at')


class CycleLogInline(admin.TabularInline):
    """Affiche les journaux quotidiens liés à une allocation."""

    model = CycleLog
    fk_name = 'cycle_unit_allocation'
    extra = 0
    show_change_link = True
    can_delete = False
    fields = ('log_date', 'mortality_count', 'feed_quantity', 'average_weight', 'created_offline')
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False


class SanitaryLogInline(admin.TabularInline):
    """Affiche les journaux sanitaires liés à une allocation."""

    model = SanitaryLog
    fk_name = 'cycle_unit_allocation'
    extra = 0
    show_change_link = True
    can_delete = False
    fields = ('event_date', 'event_type', 'resolved', 'affected_count', 'created_offline')
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(ProductionCycle)
class ProductionCycleAdmin(AquacultureSecuredAdmin):
    """
    Administration securisee des cycles de production.

    Permet a l'equipe AquaCare de :
    - Surveiller les performances des eleveurs en temps reel
    - Identifier les cycles a problemes rapidement
    - Generer des rapports de performance
    - Exporter les donnees pour analyses approfondies
    - Marquer les cycles comme termines
    """
    list_display = [
        'id_short',
        'cycle_name',
        'farm_display',
        'species_display',
        'status_display',
        'start_date',
        'days_active',
        'current_biomass_display',
        'survival_rate_display',
        'fcr_display',
        'performance_indicator',
    ]
    list_filter = [
        'farm_profile',
        'status',
        'species',
        'start_date',
        'farm_profile__certification_status', 'farm_profile__user__region'
    ]
    search_fields = [
        'cycle_name', 'farm_profile__farm_name',
        'farm_profile__user__phone_number', 'farm_profile__user__first_name',
        'farm_profile__user__last_name'
    ]
    inlines = [CycleUnitAllocationInline]
    readonly_fields = [
        'id', 'initial_biomass', 'current_biomass', 'survival_rate', 'fcr',
        'days_active', 'created_at', 'updated_at'
    ]

    fieldsets = (
        (_('Informations de base'), {
            'fields': ('farm_profile', 'cycle_name', 'species', 'status')
        }),
        (_('Bassin et infrastructure'), {
            'fields': ('pond_identifier', 'pond_surface_m2', 'pond_volume_m3')
        }),
        (_('Donnees initiales'), {
            'fields': (
                'start_date', 'initial_count', 'initial_average_weight',
                'initial_biomass'
            )
        }),
        (_('Donnees actuelles'), {
            'fields': (
                'current_count', 'current_average_weight', 'current_biomass',
                'total_feed_consumed', 'survival_rate', 'fcr'
            ),
            'classes': ('collapse',)
        }),
        (_('Recolte'), {
            'fields': (
                'end_date', 'final_count', 'final_average_weight', 'final_biomass'
            ),
            'classes': ('collapse',)
        }),
        (_('Metadonnees'), {
            'fields': ('days_active', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        })
    )

    actions = ['export_cycles_csv', 'generate_performance_report', 'mark_as_completed']

    def get_queryset(self, request):
        """Optimize queries with select_related."""
        return super().get_queryset(request).select_related(
            'farm_profile__user'
        ).prefetch_related('logs', 'feeding_plans', 'sanitary_logs', 'unit_allocations')

    def get_actions(self, request):
        """Retire les actions selon le role."""
        actions = super().get_actions(request)

        if not request.user.is_superuser:
            is_manager = request.user.groups.filter(
                name=RBACConstants.GROUP_MANAGERS
            ).exists()

            if not is_manager:
                # Commerce n'a pas acces aux actions
                for action in ['export_cycles_csv', 'generate_performance_report', 'mark_as_completed']:
                    if action in actions:
                        del actions[action]

        return actions

    # --- Display methods ---

    def farm_display(self, obj):
        """Display farm info with link to farm profile."""
        user = obj.farm_profile.user
        url = reverse('admin:accounts_farmprofile_change', args=[obj.farm_profile.id])
        return format_html(
            '<a href="{}">{} ({})</a>',
            url, obj.farm_profile.farm_name, user.display_name
        )
    farm_display.short_description = _('Ferme')
    farm_display.admin_order_field = 'farm_profile__farm_name'

    def species_display(self, obj):
        """Display species with icon."""
        return obj.get_species_display()
    species_display.short_description = _('Espece')
    species_display.admin_order_field = 'species'

    def status_display(self, obj):
        """Display status with color coding."""
        colors = {
            'planned': '#FFA500',
            'active': '#28A745',
            'harvested': '#007BFF',
            'cancelled': '#DC3545'
        }
        color = colors.get(obj.status, '#6C757D')
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color, obj.get_status_display()
        )
    status_display.short_description = _('Statut')
    status_display.admin_order_field = 'status'

    def days_active(self, obj):
        """Calculate and display days active."""
        return obj.days_active()
    days_active.short_description = _('Jours actifs')

    def current_biomass_display(self, obj):
        """Display current biomass with formatting."""
        if obj.current_biomass:
            return f"{obj.current_biomass:.1f} kg"
        return "-"
    current_biomass_display.short_description = _('Biomasse')
    current_biomass_display.admin_order_field = 'current_biomass'

    def survival_rate_display(self, obj):
        """Display survival rate with color coding."""
        if obj.survival_rate:
            if obj.survival_rate >= 85:
                color = '#28A745'
            elif obj.survival_rate >= 70:
                color = '#FFC107'
            else:
                color = '#DC3545'

            return format_html(
                '<span style="color: {}; font-weight: bold;">{}%</span>',
                color, f"{obj.survival_rate:.1f}"
            )
        return "-"
    survival_rate_display.short_description = _('Taux survie')
    survival_rate_display.admin_order_field = 'survival_rate'

    def fcr_display(self, obj):
        """Display FCR with color coding."""
        if obj.fcr:
            if obj.fcr <= 1.5:
                color = '#28A745'
            elif obj.fcr <= 2.0:
                color = '#FFC107'
            else:
                color = '#DC3545'

            return format_html(
                '<span style="color: {}; font-weight: bold;">{}</span>',
                color, f"{obj.fcr:.2f}"
            )
        return "-"
    fcr_display.short_description = _('FCR')
    fcr_display.admin_order_field = 'fcr'

    def performance_indicator(self, obj):
        """Overall performance indicator."""
        if obj.status != 'active' or not obj.survival_rate:
            return "-"

        score = 0
        if obj.survival_rate >= 80:
            score += 1
        if obj.fcr and obj.fcr <= 2.0:
            score += 1
        if obj.days_active() <= 150:
            score += 1

        if score >= 2:
            return format_html('<span style="color: #28A745;">Bon</span>')
        elif score == 1:
            return format_html('<span style="color: #FFC107;">Moyen</span>')
        else:
            return format_html('<span style="color: #DC3545;">Faible</span>')
    performance_indicator.short_description = _('Performance')

    def id_short(self, obj):
        """Display short ID for easy reference."""
        return str(obj.id)[:8] + "..."
    id_short.short_description = _('ID')

    # --- Actions securisees ---

    @admin.action(description=_("Exporter selection en CSV"))
    def export_cycles_csv(self, request, queryset):
        """Export selected cycles to CSV. Managers only."""
        if not request.user.is_superuser:
            if not request.user.groups.filter(name=RBACConstants.GROUP_MANAGERS).exists():
                messages.error(request, _("Vous n'avez pas la permission d'exporter."))
                return

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="cycles_production.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'Ferme', 'Cycle', 'Espece', 'Statut',
            'Date debut', 'Date fin', 'Duree (jours)',
            'Nombre initial', 'Nombre final', 'Taux survie (%)',
            'Poids initial (g)', 'Poids final (g)',
            'Aliment consomme (kg)', 'FCR', 'Biomasse finale (kg)'
        ])

        for cycle in queryset.select_related('farm_profile__user'):
            duration = cycle.days_active()

            writer.writerow([
                cycle.farm_profile.farm_name,
                cycle.cycle_name,
                cycle.get_species_display(),
                cycle.get_status_display(),
                cycle.start_date,
                cycle.end_date or '-',
                duration,
                cycle.initial_count,
                cycle.final_count or cycle.current_count,
                f"{cycle.survival_rate:.1f}" if cycle.survival_rate is not None else '-',
                cycle.initial_average_weight,
                cycle.final_average_weight or cycle.current_average_weight,
                cycle.total_feed_consumed,
                f"{cycle.fcr:.2f}" if cycle.fcr is not None else '-',
                cycle.final_biomass or cycle.current_biomass
            ])

        # Audit
        self.log_action(
            request, queryset.first(), CHANGE,
            message=f"Export CSV de {queryset.count()} cycles"
        )

        return response

    @admin.action(description=_("Generer rapport performance"))
    def generate_performance_report(self, request, queryset):
        """Generate performance report for selected cycles."""
        if not request.user.is_superuser:
            if not request.user.groups.filter(name=RBACConstants.GROUP_MANAGERS).exists():
                messages.error(request, _("Vous n'avez pas la permission de generer des rapports."))
                return

        stats = queryset.aggregate(
            avg_survival=Avg('survival_rate'),
            avg_fcr=Avg('fcr'),
            total_biomass=Sum('current_biomass'),
            cycle_count=Count('id')
        )

        avg_survival = stats['avg_survival'] or 0
        avg_fcr = stats['avg_fcr'] or 0
        total_biomass = stats['total_biomass'] or 0

        messages.success(
            request,
            f"Rapport: {stats['cycle_count']} cycles, "
            f"Survie moyenne: {avg_survival:.1f}%, "
            f"FCR moyen: {avg_fcr:.2f}, "
            f"Biomasse totale: {total_biomass:.1f} kg"
        )

    @admin.action(description=_("Marquer comme termine"))
    def mark_as_completed(self, request, queryset):
        """Mark selected active cycles as completed."""
        if not request.user.is_superuser:
            if not request.user.groups.filter(name=RBACConstants.GROUP_MANAGERS).exists():
                messages.error(request, _("Vous n'avez pas la permission de terminer des cycles."))
                return

        updated = queryset.filter(status='active').update(
            status='harvested',
            end_date=date.today()
        )

        # Audit
        for cycle in queryset.filter(status='harvested'):
            self.log_action(request, cycle, CHANGE, message="Cycle marque comme termine")

        messages.success(request, _('{} cycle(s) marque(s) comme termine(s).').format(updated))


@admin.register(ProductionUnit)
class ProductionUnitAdmin(AquacultureSecuredAdmin):
    """Administration des unités de production réelles."""

    list_display = [
        'name',
        'farm_display',
        'unit_type_display',
        'dimension_display',
        'recommended_capacity_display',
        'status_display',
        'created_at',
    ]
    list_filter = ['farm_profile', 'unit_type', 'status', 'farm_profile__user__region']
    search_fields = [
        'name',
        'farm_profile__farm_name',
        'farm_profile__user__phone_number',
        'farm_profile__user__first_name',
        'farm_profile__user__last_name',
    ]
    readonly_fields = ['id', 'created_at', 'updated_at']

    fieldsets = (
        (_('Informations de base'), {
            'fields': ('farm_profile', 'name', 'unit_type', 'status')
        }),
        (_('Dimensions'), {
            'fields': ('volume_m3', 'surface_m2')
        }),
        (_('Métadonnées'), {
            'fields': ('id', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('farm_profile', 'farm_profile__user')

    def farm_display(self, obj):
        url = reverse('admin:accounts_farmprofile_change', args=[obj.farm_profile.id])
        return format_html('<a href="{}">{}</a>', url, obj.farm_profile.farm_name)
    farm_display.short_description = _('Ferme')

    def unit_type_display(self, obj):
        return obj.get_unit_type_display()
    unit_type_display.short_description = _('Type')

    def dimension_display(self, obj):
        return obj.display_dimension or '-'
    dimension_display.short_description = _('Dimension')

    def recommended_capacity_display(self, obj):
        return obj.recommended_capacity or '-'
    recommended_capacity_display.short_description = _('Capacité conseillée')

    def status_display(self, obj):
        return obj.get_status_display()
    status_display.short_description = _('Statut')


@admin.register(CycleUnitAllocation)
class CycleUnitAllocationAdmin(AquacultureSecuredAdmin):
    """Administration des allocations de cycle par unité."""

    list_display = [
        'farm_display',
        'cycle_display',
        'production_unit_display',
        'initial_fish_count',
        'current_fish_count',
        'survival_rate_display',
        'created_at',
    ]
    list_filter = [
        'cycle__farm_profile',
        'cycle',
        'cycle__status',
        'production_unit',
        'production_unit__unit_type',
        'production_unit__status',
        'created_at',
    ]
    search_fields = [
        'cycle__cycle_name',
        'cycle__farm_profile__farm_name',
        'production_unit__name',
    ]
    readonly_fields = ['id', 'survival_rate_pct', 'created_at', 'updated_at']
    inlines = [CycleLogInline, SanitaryLogInline]

    fieldsets = (
        (_('Allocation'), {
            'fields': (
                'cycle',
                'production_unit',
                'initial_fish_count',
                'current_fish_count',
                'survival_rate_pct',
            )
        }),
        (_('Biomasse'), {
            'fields': ('initial_biomass_kg', 'current_biomass_kg', 'expected_survival_rate_pct')
        }),
        (_('Métadonnées'), {
            'fields': ('id', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            'cycle',
            'cycle__farm_profile',
            'production_unit',
            'production_unit__farm_profile',
        )

    def farm_display(self, obj):
        url = reverse('admin:accounts_farmprofile_change', args=[obj.cycle.farm_profile.id])
        return format_html('<a href="{}">{}</a>', url, obj.cycle.farm_profile.farm_name)
    farm_display.short_description = _('Ferme')

    def cycle_display(self, obj):
        url = reverse('admin:aquaculture_productioncycle_change', args=[obj.cycle.id])
        return format_html('<a href="{}">{}</a>', url, obj.cycle.cycle_name)
    cycle_display.short_description = _('Cycle')

    def production_unit_display(self, obj):
        url = reverse('admin:aquaculture_productionunit_change', args=[obj.production_unit.id])
        return format_html('<a href="{}">{}</a>', url, obj.production_unit.name)
    production_unit_display.short_description = _('Unité')

    def survival_rate_display(self, obj):
        return obj.survival_rate_pct or '-'
    survival_rate_display.short_description = _('Survie')


@admin.register(CycleLog)
class CycleLogAdmin(AquacultureSecuredAdmin):
    """Administration securisee des journaux de cycle."""
    list_display = [
        'id_short',
        'farm_display',
        'cycle_display',
        'allocation_display',
        'production_unit_display',
        'log_date',
        'mortality_count',
        'average_weight',
        'feed_quantity',
        'water_temp_status',
        'created_offline',
    ]
    list_filter = [
        'cycle__farm_profile',
        'cycle',
        'cycle_unit_allocation',
        'cycle_unit_allocation__production_unit',
        'created_offline',
        'log_date',
        'cycle__species',
        'cycle__status',
    ]
    search_fields = [
        'cycle__cycle_name',
        'cycle__farm_profile__farm_name',
        'cycle_unit_allocation__production_unit__name',
        'observations',
    ]
    readonly_fields = [
        'id', 'client_uuid', 'synced_at', 'created_at', 'log_time'
    ]
    date_hierarchy = 'log_date'

    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            'cycle__farm_profile',
            'cycle_unit_allocation__production_unit',
        )

    fieldsets = (
        (_('Informations de base'), {
            'fields': ('cycle', 'cycle_unit_allocation', 'log_date', 'log_time')
        }),
        (_('Donnees de mortalite'), {
            'fields': ('mortality_count', 'mortality_reason')
        }),
        (_('Donnees de croissance'), {
            'fields': ('sample_count', 'sample_total_weight', 'average_weight')
        }),
        (_('Alimentation'), {
            'fields': ('feed_quantity', 'feed_type', 'feed_size_mm', 'feeding_times')
        }),
        (_('Parametres environnementaux'), {
            'fields': (
                'water_temperature', 'dissolved_oxygen', 'ph_level', 'ammonia_level'
            ),
            'classes': ('collapse',)
        }),
        (_('Observations'), {
            'fields': ('observations',)
        }),
        (_('Synchronisation'), {
            'fields': ('client_uuid', 'created_offline', 'synced_at', 'created_at'),
            'classes': ('collapse',)
        })
    )

    def cycle_display(self, obj):
        """Display cycle name with link."""
        url = reverse('admin:aquaculture_productioncycle_change', args=[obj.cycle.id])
        return format_html('<a href="{}">{}</a>', url, obj.cycle.cycle_name)
    cycle_display.short_description = _('Cycle')
    cycle_display.admin_order_field = 'cycle__cycle_name'

    def farm_display(self, obj):
        """Display farm name with link."""
        url = reverse('admin:accounts_farmprofile_change', args=[obj.cycle.farm_profile.id])
        return format_html('<a href="{}">{}</a>', url, obj.cycle.farm_profile.farm_name)
    farm_display.short_description = _('Ferme')
    farm_display.admin_order_field = 'cycle__farm_profile__farm_name'

    def allocation_display(self, obj):
        allocation = obj.cycle_unit_allocation
        if not allocation:
            return '-'
        url = reverse('admin:aquaculture_cycleunitallocation_change', args=[allocation.id])
        return format_html('<a href="{}">{}</a>', url, f"{str(allocation.id)[:8]}...")
    allocation_display.short_description = _('Allocation')

    def production_unit_display(self, obj):
        allocation = obj.cycle_unit_allocation
        if not allocation or not allocation.production_unit:
            return '-'
        url = reverse('admin:aquaculture_productionunit_change', args=[allocation.production_unit.id])
        return format_html('<a href="{}">{}</a>', url, allocation.production_unit.name)
    production_unit_display.short_description = _('Unité')

    def water_temp_status(self, obj):
        """Display water temperature with status indicator."""
        if not obj.water_temperature:
            return "-"

        temp = float(obj.water_temperature)
        if 25 <= temp <= 32:
            color = '#28A745'
            status = 'OK'
        elif 20 <= temp <= 35:
            color = '#FFC107'
            status = '!'
        else:
            color = '#DC3545'
            status = 'X'

        return format_html(
            '<span style="color: {};">{} {}C</span>',
            color, status, f"{temp:.1f}"
        )
    water_temp_status.short_description = _('Temperature')

    def id_short(self, obj):
        """Display short ID for easy reference."""
        return str(obj.id)[:8] + "..."
    id_short.short_description = _('ID')

    def changelist_view(self, request, extra_context=None):
        from common.models import AdminViewState
        from django.core.cache import cache
        AdminViewState.mark_seen(request.user, AdminViewState.SECTION_CYCLE_LOGS)
        cache.delete(f"admin_badge_counts_{request.user.pk}")
        return super().changelist_view(request, extra_context)


@admin.register(SanitaryLog)
class SanitaryLogAdmin(AquacultureSecuredAdmin):
    """Administration securisee des journaux sanitaires."""
    list_display = [
        'id_short',
        'farm_display',
        'cycle_display',
        'allocation_display',
        'production_unit_display',
        'event_date',
        'event_type_display',
        'affected_count',
        'resolution_status',
        'has_photo',
    ]
    list_filter = [
        'cycle__farm_profile',
        'cycle',
        'cycle_unit_allocation',
        'cycle_unit_allocation__production_unit',
        'event_type',
        'resolved',
        'event_date',
        'created_offline',
    ]
    search_fields = [
        'cycle__cycle_name',
        'cycle__farm_profile__farm_name',
        'cycle_unit_allocation__production_unit__name',
        'symptoms',
        'treatment_applied',
    ]
    readonly_fields = ['id', 'created_at', 'farmer_contact']
    date_hierarchy = 'event_date'

    def get_queryset(self, request):
        """Optimize queries with select_related for farmer contact info."""
        return super().get_queryset(request).select_related(
            'cycle__farm_profile__user',
            'cycle_unit_allocation__production_unit',
        )

    fieldsets = (
        (_('Informations de base'), {
            'fields': ('cycle', 'cycle_unit_allocation', 'farmer_contact', 'event_date', 'event_type')
        }),
        (_('Details de l evenement'), {
            'fields': ('symptoms', 'affected_count')
        }),
        (_('Traitement'), {
            'fields': (
                'treatment_applied', 'medication_used',
                'dosage', 'treatment_duration_days', 'notes'
            )
        }),
        (_('Documentation'), {
            'fields': ('photo',)
        }),
        (_('Suivi'), {
            'fields': ('resolved', 'resolution_date')
        }),
        (_('Metadonnees'), {
            'fields': ('id', 'created_offline', 'created_at'),
            'classes': ('collapse',)
        })
    )

    def cycle_display(self, obj):
        """Display cycle name with link."""
        url = reverse('admin:aquaculture_productioncycle_change', args=[obj.cycle.id])
        return format_html('<a href="{}">{}</a>', url, obj.cycle.cycle_name)
    cycle_display.short_description = _('Cycle')

    def farm_display(self, obj):
        """Display farm name with link."""
        url = reverse('admin:accounts_farmprofile_change', args=[obj.cycle.farm_profile.id])
        return format_html('<a href="{}">{}</a>', url, obj.cycle.farm_profile.farm_name)
    farm_display.short_description = _('Ferme')

    def allocation_display(self, obj):
        allocation = obj.cycle_unit_allocation
        if not allocation:
            return '-'
        url = reverse('admin:aquaculture_cycleunitallocation_change', args=[allocation.id])
        return format_html('<a href="{}">{}</a>', url, f"{str(allocation.id)[:8]}...")
    allocation_display.short_description = _('Allocation')

    def production_unit_display(self, obj):
        allocation = obj.cycle_unit_allocation
        if not allocation or not allocation.production_unit:
            return '-'
        url = reverse('admin:aquaculture_productionunit_change', args=[allocation.production_unit.id])
        return format_html('<a href="{}">{}</a>', url, allocation.production_unit.name)
    production_unit_display.short_description = _('Unité')

    def event_type_display(self, obj):
        """Display event type with warning for abnormal mortality."""
        if obj.event_type == 'abnormal_mortality':
            return format_html('<span style="color: #DC3545;">! {}</span>', obj.get_event_type_display())
        return obj.get_event_type_display()
    event_type_display.short_description = _('Type')

    def resolution_status(self, obj):
        """Display resolution status with color coding."""
        if obj.resolved:
            return format_html(
                '<span style="color: #28A745;">Resolu ({})</span>',
                obj.resolution_date
            )
        else:
            days_since = (date.today() - obj.event_date).days
            if days_since > 7:
                color = '#DC3545'
            else:
                color = '#FFC107'
            return format_html(
                '<span style="color: {};">En cours ({} jours)</span>',
                color, days_since
            )
    resolution_status.short_description = _('Statut resolution')

    def has_photo(self, obj):
        """Display photo link if available."""
        if obj.photo:
            return format_html(
                '<a href="{}" target="_blank">Voir photo</a>',
                obj.photo.url
            )
        return "-"
    has_photo.short_description = _('Photo')

    def farmer_contact(self, obj):
        """Display farmer contact information for communication."""
        user = obj.cycle.farm_profile.user
        farm = obj.cycle.farm_profile

        return format_html(
            '<div style="font-size: 12px; line-height: 1.4;">'
            '<strong style="color: #059669;">{}</strong><br>'
            '<span style="color: #666;">Ferme: {}</span><br>'
            '<span style="color: #999; font-size: 10px;">Lieu: {}</span>'
            '</div>',
            user.display_name or f"{user.first_name} {user.last_name}",
            farm.farm_name[:30] + ('...' if len(farm.farm_name) > 30 else ''),
            f"{user.region}, {user.city}" if user.region and user.city else user.region or user.city or 'N/A'
        )
    farmer_contact.short_description = _('Eleveur')

    def id_short(self, obj):
        """Display short ID for easy reference."""
        return str(obj.id)[:8] + "..."
    id_short.short_description = _('ID')

    def changelist_view(self, request, extra_context=None):
        from common.models import AdminViewState
        from django.core.cache import cache
        AdminViewState.mark_seen(request.user, AdminViewState.SECTION_SANITARY_LOGS)
        cache.delete(f"admin_badge_counts_{request.user.pk}")
        return super().changelist_view(request, extra_context)


@admin.register(FeedingPlan)
class FeedingPlanAdmin(AquacultureSecuredAdmin):
    """Administration securisee des plans d'alimentation."""
    list_display = [
        'id_short', 'cycle_display', 'week_number', 'period_display',
        'biomass', 'daily_feed_amount', 'feeding_rate', 'is_active'
    ]
    list_filter = [
        'is_active', 'week_number', 'protein_percentage', 'start_date'
    ]
    search_fields = ['cycle__cycle_name', 'recommended_feed_type']
    readonly_fields = ['id', 'created_at']

    fieldsets = (
        (_('Informations de base'), {
            'fields': ('cycle', 'week_number', 'start_date', 'end_date', 'is_active')
        }),
        (_('Parametres du cycle'), {
            'fields': ('estimated_fish_count', 'average_weight', 'biomass')
        }),
        (_('Plan d alimentation'), {
            'fields': (
                'daily_feed_amount', 'feeding_rate', 'meals_per_day', 'feed_per_meal'
            )
        }),
        (_('Specifications de l aliment'), {
            'fields': (
                'recommended_feed_type', 'feed_size_mm', 'protein_percentage'
            )
        }),
        (_('Metadonnees'), {
            'fields': ('created_at',),
            'classes': ('collapse',)
        })
    )

    def cycle_display(self, obj):
        """Display cycle name with link."""
        url = reverse('admin:aquaculture_productioncycle_change', args=[obj.cycle.id])
        return format_html('<a href="{}">{}</a>', url, obj.cycle.cycle_name)
    cycle_display.short_description = _('Cycle')

    def period_display(self, obj):
        """Display week period."""
        return f"{obj.start_date} - {obj.end_date}"
    period_display.short_description = _('Periode')

    def id_short(self, obj):
        """Display short ID for easy reference."""
        return str(obj.id)[:8] + "..."
    id_short.short_description = _('ID')


@admin.register(NutritionalGuide)
class NutritionalGuideAdmin(AquacultureSecuredAdmin):
    """Administration securisee des guides nutritionnels (donnees de reference)."""
    list_display = [
        'id_short', 'species_display', 'growth_stage_display', 'weight_range',
        'feeding_rate_percentage', 'protein_requirement', 'meals_per_day'
    ]
    list_filter = ['species', 'growth_stage', 'protein_requirement']
    search_fields = ['recommended_products']
    readonly_fields = ['id', 'created_at']

    fieldsets = (
        (_('Classification'), {
            'fields': ('species', 'growth_stage')
        }),
        (_('Plage de poids'), {
            'fields': ('min_weight', 'max_weight')
        }),
        (_('Recommandations nutritionnelles'), {
            'fields': (
                'feeding_rate_percentage', 'protein_requirement',
                'meals_per_day', 'feed_size_mm', 'expected_fcr'
            )
        }),
        (_('Produits recommandés'), {
            'fields': ('recommended_products',)
        }),
        (_('Notes'), {
            'fields': ('feeding_notes',)
        }),
        (_('Metadonnees'), {
            'fields': ('created_at',),
            'classes': ('collapse',)
        })
    )

    def species_display(self, obj):
        """Display species with icon."""
        return obj.get_species_display()
    species_display.short_description = _('Espece')

    def growth_stage_display(self, obj):
        """Display growth stage."""
        return obj.get_growth_stage_display()
    growth_stage_display.short_description = _('Stade')

    def weight_range(self, obj):
        """Display weight range."""
        return f"{obj.min_weight}-{obj.max_weight}g"
    weight_range.short_description = _('Plage de poids')

    def id_short(self, obj):
        """Display short ID for easy reference."""
        return str(obj.id)[:8] + "..."
    id_short.short_description = _('ID')


@admin.register(CycleMetrics)
class CycleMetricsAdmin(AquacultureSecuredAdmin):
    """Administration securisee des metriques de cycle (analytics en lecture seule)."""
    list_display = [
        'id_short', 'cycle_display', 'daily_growth_rate', 'specific_growth_rate',
        'performance_score', 'last_calculated'
    ]
    list_filter = ['last_calculated']
    search_fields = ['cycle__cycle_name']
    readonly_fields = [
        'id', 'cycle', 'growth_curve_data', 'daily_growth_rate',
        'specific_growth_rate', 'survival_curve_data', 'weekly_mortality_rate',
        'cumulative_feed_data', 'average_daily_feed', 'performance_score',
        'last_calculated'
    ]

    def cycle_display(self, obj):
        """Display cycle name with link."""
        url = reverse('admin:aquaculture_productioncycle_change', args=[obj.cycle.id])
        return format_html('<a href="{}">{}</a>', url, obj.cycle.cycle_name)
    cycle_display.short_description = _('Cycle')

    def id_short(self, obj):
        """Display short ID for easy reference."""
        return str(obj.id)[:8] + "..."
    id_short.short_description = _('ID')

    def has_add_permission(self, request):
        """Disable manual creation of metrics, except for superusers."""
        return request.user.is_superuser

    def has_change_permission(self, request, obj=None):
        """Read-only for all except superusers."""
        return request.user.is_superuser


@admin.register(ProductionReport)
class ProductionReportAdmin(AquacultureSecuredAdmin):
    """Administration des rapports de production."""

    list_display = [
        'id_short',
        'farm_display',
        'report_type_badge',
        'period_display',
        'status_badge',
        'email_status',
        'whatsapp_status',
        'generated_at',
        'pdf_download_link',
    ]
    list_filter = ['report_type', 'status', 'email_status', 'whatsapp_status']
    search_fields = ['farm_profile__farm_name', 'farm_profile__user__phone_number']
    readonly_fields = [
        'id', 'farm_profile', 'report_type', 'period_start', 'period_end',
        'status', 'payload', 'pdf_file', 'generated_at', 'validated_at',
        'validated_by', 'email_status', 'email_sent_at',
        'whatsapp_status', 'whatsapp_shared_at', 'created_at', 'updated_at',
        'pdf_download_link', 'report_content_preview',
    ]
    fieldsets = (
        (_('Rapport'), {
            'fields': ('farm_profile', 'report_type', 'period_start', 'period_end', 'status'),
        }),
        (_('Aperçu du contenu'), {
            'fields': ('report_content_preview',),
        }),
        (_('PDF'), {
            'fields': ('pdf_download_link', 'pdf_file', 'generated_at'),
        }),
        (_('Validation'), {
            'fields': ('validated_by', 'validated_at'),
            'classes': ('collapse',),
        }),
        (_('Diffusion Email'), {
            'fields': ('email_status', 'email_sent_at'),
            'classes': ('collapse',),
        }),
        (_('WhatsApp'), {
            'fields': ('whatsapp_status', 'whatsapp_shared_at'),
            'classes': ('collapse',),
        }),
        (_('Données JSON brutes'), {
            'fields': ('payload',),
            'classes': ('collapse',),
        }),
        (_('Métadonnées'), {
            'fields': ('id', 'created_at', 'updated_at'),
            'classes': ('collapse',),
        }),
    )
    actions = ['download_report_pdf_action', 'regenerate_report_action', 'validate_report_action']

    # --- Permissions ---

    def has_view_permission(self, request, obj=None):
        """Managers et superusers peuvent voir les rapports (lecture seule)."""
        if request.user.is_superuser:
            return True
        return request.user.groups.filter(name=RBACConstants.GROUP_MANAGERS).exists()

    def has_add_permission(self, request):
        return request.user.is_superuser

    def has_change_permission(self, request, obj=None):
        """Tout est readonly — seul le superuser garde le droit 'change'."""
        return request.user.is_superuser

    # --- Custom URL for single-report PDF download ---

    def get_urls(self):
        from django.urls import path
        urls = super().get_urls()
        custom = [
            path(
                '<path:object_id>/view-pdf/',
                self.admin_site.admin_view(self.view_pdf_view),
                name='aquaculture_productionreport_view_pdf',
            ),
            path(
                '<path:object_id>/download-pdf/',
                self.admin_site.admin_view(self.download_pdf_view),
                name='aquaculture_productionreport_download_pdf',
            ),
        ]
        return custom + urls

    def _get_or_generate_pdf_content(self, report):
        """Retourne le contenu PDF binaire du rapport (génère si absent)."""
        if not report.pdf_file:
            from ..services.report_service import ReportService
            report = ReportService.regenerate(report)
        report.pdf_file.open('rb')
        content = report.pdf_file.read()
        report.pdf_file.close()
        return report, content

    def view_pdf_view(self, request, object_id):
        """Ouvre le PDF du rapport directement dans le navigateur (nouvel onglet)."""
        report = self.get_object(request, object_id)
        if report is None:
            return HttpResponse("Rapport introuvable.", status=404)
        if not self.has_view_permission(request, report):
            return HttpResponse("Accès refusé.", status=403)
        try:
            report, content = self._get_or_generate_pdf_content(report)
            filename = f"rapport_{report.report_type}_{report.period_start}_{report.period_end}.pdf"
            response = HttpResponse(content, content_type='application/pdf')
            response['Content-Disposition'] = f'inline; filename="{filename}"'
            return response
        except Exception as exc:
            logger.exception(
                "Erreur admin lors de l'affichage PDF rapport %s",
                object_id,
                exc_info=exc,
            )
            return HttpResponse("Erreur interne lors de la génération du PDF.", status=500)

    def download_pdf_view(self, request, object_id):
        """Télécharge le PDF du rapport."""
        report = self.get_object(request, object_id)
        if report is None:
            return HttpResponse("Rapport introuvable.", status=404)
        if not self.has_view_permission(request, report):
            return HttpResponse("Accès refusé.", status=403)
        try:
            report, content = self._get_or_generate_pdf_content(report)
            filename = f"rapport_{report.report_type}_{report.period_start}_{report.period_end}.pdf"
            response = HttpResponse(content, content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response
        except Exception as exc:
            logger.exception(
                "Erreur admin lors du téléchargement PDF rapport %s",
                object_id,
                exc_info=exc,
            )
            messages.error(request, _("Erreur interne lors de la génération du PDF."))
            return HttpResponseRedirect(
                reverse('admin:aquaculture_productionreport_change', args=[object_id])
            )

    # --- Display methods ---

    def id_short(self, obj):
        return str(obj.id)[:8] + "..."
    id_short.short_description = _('ID')

    def farm_display(self, obj):
        return obj.farm_profile.farm_name
    farm_display.short_description = _('Ferme')

    def period_display(self, obj):
        return f"{obj.period_start} → {obj.period_end}"
    period_display.short_description = _('Période')

    def report_type_badge(self, obj):
        labels = {'daily': 'Journalier', 'weekly': 'Hebdomadaire', 'monthly': 'Mensuel'}
        colors = {'daily': '#6b7280', 'weekly': '#3b82f6', 'monthly': '#059669'}
        color = colors.get(obj.report_type, '#6b7280')
        label = labels.get(obj.report_type, obj.report_type)
        return format_html(
            '<span style="background:{}; color:white; padding:3px 8px; border-radius:4px;">{}</span>',
            color, label
        )
    report_type_badge.short_description = _('Type')

    def status_badge(self, obj):
        colors = {'draft': '#f59e0b', 'validated': '#059669', 'archived': '#6b7280'}
        labels = {'draft': 'Brouillon', 'validated': 'Validé', 'archived': 'Archivé'}
        color = colors.get(obj.status, '#6b7280')
        label = labels.get(obj.status, obj.status)
        return format_html(
            '<span style="background:{}; color:white; padding:3px 8px; border-radius:4px;">{}</span>',
            color, label
        )
    status_badge.short_description = _('Statut')

    def pdf_download_link(self, obj):
        """Boutons Visualiser + Télécharger PDF (liste + détail)."""
        if not obj.pk:
            return "—"
        view_url = reverse('admin:aquaculture_productionreport_view_pdf', args=[obj.pk])
        download_url = reverse('admin:aquaculture_productionreport_download_pdf', args=[obj.pk])
        btn_base = (
            'display:inline-block;padding:4px 10px;border-radius:4px;'
            'text-decoration:none;font-size:12px;font-weight:bold;'
        )
        if obj.pdf_file:
            return format_html(
                '<a href="{}" target="_blank" style="{}background:#3b82f6;color:white;">👁 Visualiser</a>'
                '&nbsp;'
                '<a href="{}" style="{}background:#059669;color:white;">📄 Télécharger</a>',
                view_url, btn_base, download_url, btn_base,
            )
        return format_html(
            '<a href="{}" style="{}background:#6b7280;color:white;">🔄 Générer PDF</a>',
            download_url, btn_base,
        )
    pdf_download_link.short_description = _('PDF')

    def report_content_preview(self, obj):
        """Affiche un aperçu lisible du contenu du rapport directement dans l'admin."""
        if not obj.payload or not isinstance(obj.payload, dict):
            return mark_safe('<em style="color:#6b7280;">Aucune donnée — générez d\'abord le rapport.</em>')

        payload = obj.payload
        farm = payload.get('farm', {}) or {}
        summary = payload.get('summary', {}) or {}
        cycles = payload.get('cycles', []) or []
        meta = payload.get('report_meta', {}) or {}

        farm_name = escape(str(farm.get('farm_name', '—')))
        period_start = escape(str(meta.get('period_start', '?')))
        period_end = escape(str(meta.get('period_end', '?')))
        promoter = escape(str(farm.get('promoter_name', '') or farm.get('promoter_phone', '')))

        type_labels = {'daily': 'Journalier', 'weekly': 'Hebdomadaire', 'monthly': 'Mensuel'}
        type_label = escape(type_labels.get(str(meta.get('report_type', '')), meta.get('report_type', '—')))

        # -- Header --
        html = (
            '<div style="font-family:sans-serif;max-width:780px;border:1px solid #d1fae5;'
            'border-radius:8px;overflow:hidden;margin:4px 0;">'
            f'<div style="background:#059669;color:white;padding:10px 16px;display:flex;'
            f'justify-content:space-between;align-items:center;">'
            f'<strong style="font-size:14px;">🐟 {farm_name}</strong>'
            f'<span style="font-size:12px;opacity:0.85;">{type_label} · {period_start} → {period_end}</span>'
            f'</div>'
            f'<div style="font-size:12px;color:#374151;padding:4px 16px;background:#ecfdf5;">'
            f'Promoteur : {promoter}'
            f'</div>'
        )

        # -- Résumé global --
        html += (
            '<div style="display:flex;gap:0;border-bottom:1px solid #e5e7eb;">'
        )
        for label, value, color in [
            ('Cycles actifs', summary.get('cycle_count', '—'), '#059669'),
            ('Logs saisis', summary.get('total_log_count', '—'), '#374151'),
            ('Aliment (kg)', summary.get('total_feed', '—'), '#374151'),
            ('Mortalité', summary.get('total_mortality', '—'), '#dc2626'),
            ('Événements sanitaires', summary.get('total_sanitary_events', '—'), '#f59e0b'),
        ]:
            val = escape(str(value if value is not None else '—'))
            html += (
                f'<div style="flex:1;padding:10px 12px;border-right:1px solid #e5e7eb;text-align:center;">'
                f'<div style="font-size:18px;font-weight:bold;color:{color};">{val}</div>'
                f'<div style="font-size:11px;color:#6b7280;">{escape(label)}</div>'
                f'</div>'
            )
        html += '</div>'

        # -- Détail par cycle --
        if cycles:
            html += (
                '<div style="padding:4px 16px 0;background:#f9fafb;border-bottom:1px solid #e5e7eb;">'
                '<strong style="font-size:12px;color:#374151;">Détail par cycle</strong>'
                '</div>'
            )
            for section in cycles:
                cycle = section.get('cycle', {}) or {}
                metrics = section.get('current_metrics', {}) or {}
                period = section.get('period_metrics', {}) or {}
                eco = section.get('economic_plan', {}) or {}

                cycle_name = escape(str(cycle.get('cycle_name', '?')))
                pond = escape(str(cycle.get('pond_identifier', '')))
                species = escape(str(cycle.get('species_display', '')))
                days = escape(str(cycle.get('days_active', '?')))

                fcr = metrics.get('fcr')
                fcr_color = '#059669' if fcr and float(fcr) <= 1.5 else (
                    '#f59e0b' if fcr and float(fcr) <= 2.0 else '#dc2626'
                )
                fcr_str = escape(f'{float(fcr):.2f}' if fcr else '—')

                survival = metrics.get('survival_rate')
                surv_color = '#059669' if survival and float(survival) >= 85 else (
                    '#f59e0b' if survival and float(survival) >= 70 else '#dc2626'
                )
                surv_str = escape(f'{float(survival):.1f}%' if survival else '—')

                biomass = escape(
                    str(
                        f'{float(metrics["current_biomass"]):.1f} kg'
                        if metrics.get('current_biomass')
                        else '—'
                    )
                )
                weight = escape(
                    str(
                        f'{float(metrics["current_average_weight"]):.0f} g'
                        if metrics.get('current_average_weight')
                        else '—'
                    )
                )
                count = escape(str(metrics.get('current_count', '—')))
                p_feed = escape(str(f'{float(period["total_feed"]):.1f} kg' if period.get('total_feed') else '—'))
                p_mort = escape(str(period.get('total_mortality', '—')))
                p_temp = escape(
                    str(
                        f'{float(period["average_temperature"]):.1f}°C'
                        if period.get('average_temperature')
                        else '—'
                    )
                )
                p_logs = escape(str(period.get('log_count', '—')))
                roi = eco.get('projected_roi_pct')
                roi_str = escape(f'{float(roi):.1f}%' if roi is not None else '—')
                roi_color = '#059669' if roi and float(roi) > 0 else '#dc2626'

                html += (
                    f'<div style="padding:10px 16px;border-bottom:1px solid #f3f4f6;">'
                    f'<div style="margin-bottom:6px;">'
                    f'<strong style="color:#065f46;">{cycle_name}</strong>'
                    f'<span style="color:#6b7280;font-size:12px;margin-left:8px;">{species} · {pond} · J+{days}</span>'
                    f'</div>'
                    f'<div style="display:flex;flex-wrap:wrap;gap:16px;font-size:12px;">'
                    f'<span>🐟 <strong>{count}</strong> poissons</span>'
                    f'<span>⚖️ <strong>{weight}</strong> poids moy.</span>'
                    f'<span>📦 <strong>{biomass}</strong> biomasse</span>'
                    f'<span style="color:{fcr_color};">📊 FCR <strong>{fcr_str}</strong></span>'
                    f'<span style="color:{surv_color};">💚 Survie <strong>{surv_str}</strong></span>'
                    f'<span style="color:{roi_color};">💰 ROI estimé <strong>{roi_str}</strong></span>'
                    f'</div>'
                    f'<div style="margin-top:4px;font-size:11px;color:#6b7280;">'
                    f'Période : {p_logs} logs · Aliment {p_feed} · Mortalité {p_mort} · Temp. moy. {p_temp}'
                    f'</div>'
                    f'</div>'
                )
        else:
            html += (
                '<div style="padding:12px 16px;color:#6b7280;font-size:13px;">'
                '<em>Aucun cycle actif sur cette période.</em>'
                '</div>'
            )

        html += '</div>'
        return mark_safe(html)
    report_content_preview.short_description = _('Aperçu du rapport')

    # --- Actions ---

    @admin.action(description=_("Télécharger PDF(s) sélectionnés"))
    def download_report_pdf_action(self, request, queryset):
        """Télécharge les PDFs des rapports sélectionnés (1 → PDF, N → ZIP)."""
        if not self.has_view_permission(request):
            messages.error(request, _("Accès refusé."))
            return
        from ..services.report_service import ReportService
        count = queryset.count()
        if count == 1:
            report = queryset.first()
            try:
                if not report.pdf_file:
                    report = ReportService.regenerate(report)
                report.pdf_file.open('rb')
                content = report.pdf_file.read()
                report.pdf_file.close()
                filename = f"rapport_{report.report_type}_{report.period_start}.pdf"
                response = HttpResponse(content, content_type='application/pdf')
                response['Content-Disposition'] = f'attachment; filename="{filename}"'
                return response
            except Exception as exc:
                logger.exception(
                    "Erreur admin lors de la génération PDF rapport %s",
                    report.id,
                    exc_info=exc,
                )
                messages.error(request, _("Erreur interne lors de la génération du PDF."))
                return
        try:
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
                for report in queryset:
                    if not report.pdf_file:
                        report = ReportService.regenerate(report)
                    report.pdf_file.open('rb')
                    content = report.pdf_file.read()
                    report.pdf_file.close()
                    fname = (
                        f"rapport_{report.report_type}_"
                        f"{report.period_start}_{report.period_end}.pdf"
                    )
                    zf.writestr(fname, content)
            zip_buffer.seek(0)
            response = HttpResponse(zip_buffer.read(), content_type='application/zip')
            response['Content-Disposition'] = 'attachment; filename="rapports_aquacare.zip"'
            return response
        except Exception as exc:
            logger.exception(
                "Erreur admin lors de la génération ZIP des rapports",
                exc_info=exc,
            )
            messages.error(request, _("Erreur interne lors de la génération de l'archive ZIP."))

    @admin.action(description=_("Régénérer rapport(s) — nouveau PDF"))
    def regenerate_report_action(self, request, queryset):
        """Régénère les rapports sélectionnés (données fraîches + nouveau PDF)."""
        if not request.user.is_superuser and not request.user.groups.filter(
            name=RBACConstants.GROUP_MANAGERS
        ).exists():
            messages.error(request, _("Accès refusé."))
            return
        from ..services.report_service import ReportService
        success = 0
        for report in queryset:
            try:
                ReportService.regenerate(report)
                success += 1
            except Exception as exc:
                logger.exception(
                    "Erreur admin lors de la régénération du rapport %s",
                    report.id,
                    exc_info=exc,
                )
                messages.warning(
                    request,
                    _("Rapport %(report)s : échec de régénération.") % {
                        'report': str(report.id)[:8]
                    },
                )
        if success:
            messages.success(request, _('{} rapport(s) régénéré(s).').format(success))

    @admin.action(description=_("Valider rapport(s)"))
    def validate_report_action(self, request, queryset):
        """Valide les rapports sélectionnés (statut → validé). Superuser seulement."""
        if not request.user.is_superuser:
            messages.error(request, _("Seul le superuser peut valider les rapports."))
            return
        from ..services.report_service import ReportService
        count = 0
        for report in queryset:
            try:
                ReportService.validate(report, request.user)
                count += 1
            except Exception as exc:
                logger.exception(
                    "Erreur admin lors de la validation du rapport %s",
                    report.id,
                    exc_info=exc,
                )
                messages.warning(
                    request,
                    _("Rapport %(report)s : échec de validation.") % {
                        'report': str(report.id)[:8]
                    },
                )
        if count:
            messages.success(request, _('{} rapport(s) validé(s).').format(count))

    def changelist_view(self, request, extra_context=None):
        from common.models import AdminViewState
        from django.core.cache import cache
        AdminViewState.mark_seen(request.user, AdminViewState.SECTION_PRODUCTION_REPORTS)
        cache.delete(f"admin_badge_counts_{request.user.pk}")
        return super().changelist_view(request, extra_context)


@admin.register(ReportDispatchLog)
class ReportDispatchLogAdmin(AquacultureSecuredAdmin):
    """Journal d'audit des envois de rapports."""

    list_display = ['id_short', 'report', 'channel', 'status', 'recipient', 'created_at']
    list_filter = ['channel', 'status', 'created_at']
    search_fields = ['report__farm_profile__farm_name', 'recipient', 'error_code']
    readonly_fields = [
        'id', 'report', 'channel', 'status', 'recipient',
        'error_code', 'error_message', 'metadata',
        'dispatched_by', 'created_at'
    ]

    def id_short(self, obj):
        return str(obj.id)[:8] + "..."
    id_short.short_description = _('ID')

    def has_view_permission(self, request, obj=None):
        """Managers peuvent consulter les logs d'envoi en lecture seule."""
        if request.user.is_superuser:
            return True
        return request.user.groups.filter(name=RBACConstants.GROUP_MANAGERS).exists()

    def has_add_permission(self, request):
        return request.user.is_superuser

    def has_change_permission(self, request, obj=None):
        return request.user.is_superuser

    def changelist_view(self, request, extra_context=None):
        from common.models import AdminViewState
        from django.core.cache import cache
        AdminViewState.mark_seen(request.user, AdminViewState.SECTION_DISPATCH_LOGS)
        cache.delete(f"admin_badge_counts_{request.user.pk}")
        return super().changelist_view(request, extra_context)

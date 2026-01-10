"""
Administration securisee du module aquaculture AquaCare.
Implemente le RBAC multi-niveau avec audit logging.

Roles:
- OWNER (is_superuser): Controle total
- MANAGERS (mavecam_managers): Acces complet aquaculture
- COMMERCE (mavecam_commerce): Lecture seule pour contexte
- SUPPORT: Pas d'acces
"""
from django.contrib import admin
from django.contrib.admin.models import CHANGE
from django.utils.html import format_html
from django.urls import reverse
from django.db.models import Sum, Avg, Count
from django.utils.translation import gettext_lazy as _
from django.contrib import messages
from datetime import date
import csv
from django.http import HttpResponse

from .models import (
    ProductionCycle, CycleLog, FeedingPlan, SanitaryLog,
    NutritionalGuide, CycleMetrics
)
from apps.common.admin_mixins import (
    SecuredModelAdmin,
    RBACConstants,
)


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


@admin.register(ProductionCycle)
class ProductionCycleAdmin(AquacultureSecuredAdmin):
    """
    Administration securisee des cycles de production.

    Permet a l'equipe MAVECAM de :
    - Surveiller les performances des eleveurs en temps reel
    - Identifier les cycles a problemes rapidement
    - Generer des rapports de performance
    - Exporter les donnees pour analyses approfondies
    - Marquer les cycles comme termines
    """
    list_display = [
        'id_short', 'cycle_name', 'farm_display', 'species_display', 'status_display',
        'start_date', 'days_active', 'current_biomass_display',
        'survival_rate_display', 'fcr_display', 'performance_indicator'
    ]
    list_filter = [
        'status', 'species', 'start_date',
        'farm_profile__certification_status', 'farm_profile__user__region'
    ]
    search_fields = [
        'cycle_name', 'farm_profile__farm_name',
        'farm_profile__user__phone_number', 'farm_profile__user__first_name',
        'farm_profile__user__last_name'
    ]
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
        ).prefetch_related('logs', 'feeding_plans', 'sanitary_logs')

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


@admin.register(CycleLog)
class CycleLogAdmin(AquacultureSecuredAdmin):
    """Administration securisee des journaux de cycle."""
    list_display = [
        'id_short', 'cycle_display', 'log_date', 'mortality_count', 'average_weight',
        'feed_quantity', 'water_temp_status', 'created_offline'
    ]
    list_filter = [
        'created_offline', 'log_date', 'cycle__species', 'cycle__status'
    ]
    search_fields = [
        'cycle__cycle_name', 'cycle__farm_profile__farm_name'
    ]
    readonly_fields = [
        'id', 'client_uuid', 'synced_at', 'created_at', 'log_time'
    ]
    date_hierarchy = 'log_date'

    fieldsets = (
        (_('Informations de base'), {
            'fields': ('cycle', 'log_date', 'log_time')
        }),
        (_('Donnees de mortalite'), {
            'fields': ('mortality_count', 'mortality_reason')
        }),
        (_('Donnees de croissance'), {
            'fields': ('sample_count', 'sample_total_weight', 'average_weight')
        }),
        (_('Alimentation'), {
            'fields': ('feed_quantity', 'feed_type', 'feeding_times')
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


@admin.register(SanitaryLog)
class SanitaryLogAdmin(AquacultureSecuredAdmin):
    """Administration securisee des journaux sanitaires."""
    list_display = [
        'id_short', 'cycle_display', 'farmer_contact', 'event_date', 'event_type_display',
        'affected_count', 'resolution_status', 'has_photo'
    ]
    list_filter = [
        'event_type', 'resolved', 'event_date', 'created_offline'
    ]
    search_fields = [
        'cycle__cycle_name', 'symptoms', 'treatment_applied'
    ]
    readonly_fields = ['id', 'created_at', 'farmer_contact']
    date_hierarchy = 'event_date'

    def get_queryset(self, request):
        """Optimize queries with select_related for farmer contact info."""
        return super().get_queryset(request).select_related(
            'cycle__farm_profile__user'
        )

    fieldsets = (
        (_('Informations de base'), {
            'fields': ('cycle', 'farmer_contact', 'event_date', 'event_type')
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

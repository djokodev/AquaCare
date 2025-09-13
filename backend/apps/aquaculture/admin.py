"""
Interface d'administration Django pour le module aquaculture de MAVECAM AquaCare.

Fournit une interface de gestion complète pour l'équipe MAVECAM permettant :
- Supervision des performances des éleveurs
- Support technique et commercial
- Analytics et rapports de production
- Gestion des données de référence nutritionnelles
- Suivi des notifications et communications

Interface optimisée pour les opérations terrain et le management de l'aquaculture.
"""
from django.contrib import admin
from django.utils.html import format_html
from django.urls import reverse
from django.db.models import Sum, Avg, Count
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
from datetime import date, timedelta
import csv
from django.http import HttpResponse

from .models import (
    ProductionCycle, CycleLog, FeedingPlan, SanitaryLog,
    NutritionalGuide, CycleMetrics, Notification
)


@admin.register(ProductionCycle)
class ProductionCycleAdmin(admin.ModelAdmin):
    """
    Interface d'administration complète pour les cycles de production.
    
    Permet à l'équipe MAVECAM de :
    - Surveiller les performances des éleveurs en temps réel
    - Identifier les cycles à problèmes rapidement
    - Générer des rapports de performance
    - Exporter les données pour analyses approfondies
    - Marquer les cycles comme terminés
    
    Avec indicateurs visuels colorés pour évaluation rapide des performances.
    """
    list_display = [
        'cycle_name', 'farm_display', 'species_display', 'status_display',
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
        (_('Données initiales'), {
            'fields': (
                'start_date', 'initial_count', 'initial_average_weight', 
                'initial_biomass'
            )
        }),
        (_('Données actuelles'), {
            'fields': (
                'current_count', 'current_average_weight', 'current_biomass',
                'total_feed_consumed', 'survival_rate', 'fcr'
            ),
            'classes': ('collapse',)
        }),
        (_('Récolte'), {
            'fields': (
                'end_date', 'final_count', 'final_average_weight', 'final_biomass'
            ),
            'classes': ('collapse',)
        }),
        (_('Métadonnées'), {
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
    species_display.short_description = _('Espèce')
    species_display.admin_order_field = 'species'
    
    def status_display(self, obj):
        """Display status with color coding."""
        colors = {
            'planned': '#FFA500',  # Orange
            'active': '#28A745',   # Green
            'harvested': '#007BFF', # Blue
            'cancelled': '#DC3545'  # Red
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
                color = '#28A745'  # Green
            elif obj.survival_rate >= 70:
                color = '#FFC107'  # Yellow
            else:
                color = '#DC3545'  # Red
            
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
                color = '#28A745'  # Green - Excellent
            elif obj.fcr <= 2.0:
                color = '#FFC107'  # Yellow - Good  
            else:
                color = '#DC3545'  # Red - Poor
            
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
        
        # Simple performance scoring
        score = 0
        if obj.survival_rate >= 80:
            score += 1
        if obj.fcr and obj.fcr <= 2.0:
            score += 1
        if obj.days_active() <= 150:  # Reasonable cycle duration
            score += 1
        
        if score >= 2:
            return format_html('<span style="color: #28A745;">✓ Bon</span>')
        elif score == 1:
            return format_html('<span style="color: #FFC107;">⚠ Moyen</span>')
        else:
            return format_html('<span style="color: #DC3545;">✗ Faible</span>')
    performance_indicator.short_description = _('Performance')
    
    def export_cycles_csv(self, request, queryset):
        """Export selected cycles to CSV."""
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="cycles_production.csv"'
        
        writer = csv.writer(response)
        writer.writerow([
            'Ferme', 'Téléphone', 'Cycle', 'Espèce', 'Statut',
            'Date début', 'Date fin', 'Durée (jours)',
            'Nombre initial', 'Nombre final', 'Taux survie (%)',
            'Poids initial (g)', 'Poids final (g)', 'Gain journalier (g)',
            'Aliment consommé (kg)', 'FCR', 'Biomasse finale (kg)'
        ])
        
        for cycle in queryset.select_related('farm_profile__user'):
            duration = cycle.days_active()
            daily_gain = (
                float(cycle.final_average_weight - cycle.initial_average_weight) / duration
                if cycle.final_average_weight and duration > 0 else '-'
            )
            
            writer.writerow([
                cycle.farm_profile.farm_name,
                cycle.farm_profile.user.phone_number,
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
                f"{daily_gain:.2f}" if daily_gain != '-' else '-',
                cycle.total_feed_consumed,
                f"{cycle.fcr:.2f}" if cycle.fcr is not None else '-',
                cycle.final_biomass or cycle.current_biomass
            ])
        
        return response
    export_cycles_csv.short_description = _("Exporter sélection en CSV")
    
    def generate_performance_report(self, request, queryset):
        """Generate performance report for selected cycles."""
        stats = queryset.aggregate(
            avg_survival=Avg('survival_rate'),
            avg_fcr=Avg('fcr'),
            total_biomass=Sum('current_biomass'),
            cycle_count=Count('id')
        )
        
        avg_survival = stats['avg_survival'] or 0
        avg_fcr = stats['avg_fcr'] or 0
        total_biomass = stats['total_biomass'] or 0

        self.message_user(
            request,
            f"Rapport: {stats['cycle_count']} cycles, "
            f"Survie moyenne: {avg_survival:.1f}%, "
            f"FCR moyen: {avg_fcr:.2f}, "
            f"Biomasse totale: {total_biomass:.1f} kg"
        )
    generate_performance_report.short_description = _("Générer rapport performance")
    
    def mark_as_completed(self, request, queryset):
        """Mark selected active cycles as completed."""
        updated = queryset.filter(status='active').update(
            status='harvested',
            end_date=date.today()
        )
        self.message_user(request, f"{updated} cycle(s) marqué(s) comme terminé(s)")
    mark_as_completed.short_description = _("Marquer comme terminé")


@admin.register(CycleLog)
class CycleLogAdmin(admin.ModelAdmin):
    """Admin interface for daily cycle logs."""
    list_display = [
        'cycle_display', 'log_date', 'mortality_count', 'average_weight',
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
        (_('Données de mortalité'), {
            'fields': ('mortality_count', 'mortality_reason')
        }),
        (_('Données de croissance'), {
            'fields': ('sample_count', 'sample_total_weight', 'average_weight')
        }),
        (_('Alimentation'), {
            'fields': ('feed_quantity', 'feed_type', 'feeding_times')
        }),
        (_('Paramètres environnementaux'), {
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
            color = '#28A745'  # Green - Optimal
            status = '✓'
        elif 20 <= temp <= 35:
            color = '#FFC107'  # Yellow - Acceptable
            status = '⚠'
        else:
            color = '#DC3545'  # Red - Problematic
            status = '✗'
        
        return format_html(
            '<span style="color: {};">{} {}°C</span>',
            color, status, f"{temp:.1f}"
        )
    water_temp_status.short_description = _('Température')


@admin.register(SanitaryLog)
class SanitaryLogAdmin(admin.ModelAdmin):
    """Admin interface for sanitary logs."""
    list_display = [
        'cycle_display', 'event_date', 'event_type_display', 
        'affected_count', 'resolution_status', 'has_photo'
    ]
    list_filter = [
        'event_type', 'resolved', 'event_date', 'created_offline'
    ]
    search_fields = [
        'cycle__cycle_name', 'symptoms', 'treatment_applied'
    ]
    readonly_fields = ['id', 'created_at']
    date_hierarchy = 'event_date'
    
    fieldsets = (
        (_('Informations de base'), {
            'fields': ('cycle', 'event_date', 'event_type')
        }),
        (_('Description du problème'), {
            'fields': ('symptoms', 'affected_count')
        }),
        (_('Traitement'), {
            'fields': (
                'treatment_applied', 'medication_used', 'dosage', 
                'treatment_duration_days'
            )
        }),
        (_('Documentation'), {
            'fields': ('photo', 'notes')
        }),
        (_('Suivi'), {
            'fields': ('resolved', 'resolution_date')
        }),
        (_('Métadonnées'), {
            'fields': ('created_offline', 'created_at'),
            'classes': ('collapse',)
        })
    )
    
    def cycle_display(self, obj):
        """Display cycle name with link."""
        url = reverse('admin:aquaculture_productioncycle_change', args=[obj.cycle.id])
        return format_html('<a href="{}">{}</a>', url, obj.cycle.cycle_name)
    cycle_display.short_description = _('Cycle')
    
    def event_type_display(self, obj):
        """Display event type."""
        # Garder seulement l'emoji d'alerte pour mortalité anormale
        if obj.event_type == 'abnormal_mortality':
            return f"⚠️ {obj.get_event_type_display()}"
        return obj.get_event_type_display()
    event_type_display.short_description = _('Type')
    
    def resolution_status(self, obj):
        """Display resolution status."""
        if obj.resolved:
            return format_html(
                '<span style="color: #28A745;">✓ Résolu ({})</span>',
                obj.resolution_date
            )
        else:
            days_since = (date.today() - obj.event_date).days
            if days_since > 7:
                color = '#DC3545'  # Red - Overdue
            else:
                color = '#FFC107'  # Yellow - Pending
            return format_html(
                '<span style="color: {};">⏳ En cours ({} jours)</span>',
                color, days_since
            )
    resolution_status.short_description = _('Statut résolution')
    
    def has_photo(self, obj):
        """Indicate if photo is attached."""
        if obj.photo:
            return format_html(
                '<a href="{}" target="_blank"> Voir photo</a>',
                obj.photo.url
            )
        return "-"
    has_photo.short_description = _('Photo')


@admin.register(FeedingPlan)
class FeedingPlanAdmin(admin.ModelAdmin):
    """Admin interface for feeding plans."""
    list_display = [
        'cycle_display', 'week_number', 'period_display', 
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
        (_('Paramètres du cycle'), {
            'fields': ('estimated_fish_count', 'average_weight', 'biomass')
        }),
        (_('Plan d\'alimentation'), {
            'fields': (
                'daily_feed_amount', 'feeding_rate', 'meals_per_day', 'feed_per_meal'
            )
        }),
        (_('Spécifications de l\'aliment'), {
            'fields': (
                'recommended_feed_type', 'feed_size_mm', 'protein_percentage'
            )
        }),
        (_('Métadonnées'), {
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
        return f"{obj.start_date} → {obj.end_date}"
    period_display.short_description = _('Période')


@admin.register(NutritionalGuide)
class NutritionalGuideAdmin(admin.ModelAdmin):
    """Admin interface for nutritional guides (reference data)."""
    list_display = [
        'species_display', 'growth_stage_display', 'weight_range',
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
        (_('Produits MAVECAM'), {
            'fields': ('recommended_products',)
        }),
        (_('Notes'), {
            'fields': ('feeding_notes',)
        }),
        (_('Métadonnées'), {
            'fields': ('created_at',),
            'classes': ('collapse',)
        })
    )
    
    def species_display(self, obj):
        """Display species with icon."""
        return obj.get_species_display()
    species_display.short_description = _('Espèce')
    
    def growth_stage_display(self, obj):
        """Display growth stage."""
        return obj.get_growth_stage_display()
    growth_stage_display.short_description = _('Stade')
    
    def weight_range(self, obj):
        """Display weight range."""
        return f"{obj.min_weight}-{obj.max_weight}g"
    weight_range.short_description = _('Plage de poids')


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    """Admin interface for notifications."""
    list_display = [
        'user_display', 'title', 'notification_type', 
        'scheduled_for', 'delivery_status'
    ]
    list_filter = [
        'notification_type', 'is_sent', 'is_read', 'scheduled_for'
    ]
    search_fields = ['user__phone_number', 'title', 'message']
    readonly_fields = ['id', 'sent_at', 'read_at', 'created_at']
    date_hierarchy = 'scheduled_for'
    
    fieldsets = (
        (_('Destinataire'), {
            'fields': ('user', 'cycle')
        }),
        (_('Contenu'), {
            'fields': ('notification_type', 'title', 'message')
        }),
        (_('Planification'), {
            'fields': ('scheduled_for',)
        }),
        (_('Statut'), {
            'fields': ('is_sent', 'sent_at', 'is_read', 'read_at')
        }),
        (_('Métadonnées'), {
            'fields': ('created_at',),
            'classes': ('collapse',)
        })
    )
    
    def user_display(self, obj):
        """Display user info."""
        return f"{obj.user.display_name} ({obj.user.phone_number})"
    user_display.short_description = _('Utilisateur')
    
    def delivery_status(self, obj):
        """Display delivery status."""
        if obj.is_read:
            return format_html('<span style="color: #28A745;">✓ Lu</span>')
        elif obj.is_sent:
            return format_html('<span style="color: #007BFF;"> Envoyé</span>')
        elif obj.scheduled_for < timezone.now():
            return format_html('<span style="color: #DC3545;">⏰ En retard</span>')
        else:
            return format_html('<span style="color: #FFC107;">⏳ Programmé</span>')
    delivery_status.short_description = _('Statut')


@admin.register(CycleMetrics)
class CycleMetricsAdmin(admin.ModelAdmin):
    """Admin interface for cycle metrics (read-only analytics)."""
    list_display = [
        'cycle_display', 'daily_growth_rate', 'specific_growth_rate',
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
    
    def has_add_permission(self, request):
        """Disable manual creation of metrics, except for superusers."""
        return request.user.is_superuser
    
    def has_delete_permission(self, request, obj=None):
        """Allow deletion of metrics only for superusers (when deleting cycles)."""
        return request.user.is_superuser


# Customize admin site
admin.site.site_header = "MAVECAM AquaCare - Administration"
admin.site.site_title = "MAVECAM Admin"
admin.site.index_title = "Gestion de l'Aquaculture"
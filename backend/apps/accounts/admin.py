from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.html import format_html
from django.urls import reverse
from .models import User, FarmProfile


class FarmProfileInline(admin.StackedInline):
    """
    Inline pour éditer le FarmProfile directement depuis la page User.
    """
    model = FarmProfile
    extra = 0
    fields = (
        'farm_name', 'certification_status',
        'total_ponds', 'total_area_m2', 'water_source', 'main_species',
        'annual_production_kg'
    )
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """
    Interface d'administration complète pour les utilisateurs MAVECAM.
    
    Métier : Permet aux administrateurs MAVECAM de :
    - Gérer les comptes pisciculteurs
    - Certifier/décertifier les fermes
    - Filtrer par critères multiples
    - Exporter les données
    """
    
    list_display = (
        'phone_number', 'display_name', 'account_type', 'activity_type',
        'region', 'is_verified', 'farm_certification_status', 'date_joined'
    )
    list_filter = (
        'account_type', 'activity_type', 'region', 'is_verified', 
        'is_active', 'date_joined', 'farm_profile__certification_status'
    )
    search_fields = (
        'phone_number', 'first_name', 'last_name', 'business_name',
        'email', 'farm_profile__farm_name'
    )
    ordering = ('-date_joined',)
    
    actions = ['verify_users', 'certify_farms', 'suspend_certifications', 'export_csv']
    
    fieldsets = (
        ('Informations de base', {
            'fields': ('phone_number', 'email', 'password')
        }),
        ('Informations personnelles', {
            'fields': (
                'first_name', 'last_name', 'business_name', 'account_type',
                'language_preference', 'is_verified'
            )
        }),
        ('Activité aquacole', {
            'fields': ('activity_type', 'intervention_zone')
        }),
        ('Localisation', {
            'fields': ('region', 'department', 'district', 'neighborhood'),
            'classes': ('collapse',)
        }),
        ('Entreprise', {
            'fields': ('legal_status', 'promoter_name'),
            'classes': ('collapse',)
        }),
        ('Personne physique', {
            'fields': ('age_group',),
            'classes': ('collapse',)
        }),
        ('Permissions', {
            'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions'),
            'classes': ('collapse',)
        }),
        ('Dates importantes', {
            'fields': ('last_login', 'date_joined'),
            'classes': ('collapse',)
        }),
    )
    
    add_fieldsets = (
        ('Informations obligatoires', {
            'classes': ('wide',),
            'fields': ('phone_number', 'password1', 'password2', 'first_name', 'last_name')
        }),
        ('Informations complémentaires', {
            'classes': ('wide',),
            'fields': ('account_type', 'business_name', 'activity_type', 'region')
        }),
    )
    
    inlines = [FarmProfileInline]
    
    
    def farm_certification_status(self, obj):
        if hasattr(obj, 'farm_profile'):
            status = obj.farm_profile.certification_status
            colors = {
                'certified': 'green',
                'pending': 'orange', 
                'suspended': 'red',
                'rejected': 'darkred'
            }
            return format_html(
                '<span style="color: {};">{}</span>',
                colors.get(status, 'black'),
                obj.farm_profile.get_certification_status_display()
            )
        return '-'
    farm_certification_status.short_description = 'Certification'
    farm_certification_status.admin_order_field = 'farm_profile__certification_status'
    
    def verify_users(self, request, queryset):
        """Action pour vérifier les numéros de téléphone."""
        count = queryset.update(is_verified=True)
        self.message_user(request, f'{count} utilisateur(s) vérifié(s).')
    verify_users.short_description = "Vérifier les téléphones sélectionnés"
    
    def certify_farms(self, request, queryset):
        """Action pour certifier les fermes."""
        count = 0
        for user in queryset:
            if hasattr(user, 'farm_profile'):
                user.farm_profile.certification_status = 'certified'
                user.farm_profile.save()
                count += 1
        self.message_user(request, f'{count} ferme(s) certifiée(s).')
    certify_farms.short_description = "Certifier les fermes sélectionnées"
    
    def suspend_certifications(self, request, queryset):
        """Action pour suspendre les certifications."""
        count = 0
        for user in queryset:
            if hasattr(user, 'farm_profile'):
                user.farm_profile.certification_status = 'suspended'
                user.farm_profile.save()
                count += 1
        self.message_user(request, f'{count} certification(s) suspendue(s).')
    suspend_certifications.short_description = "Suspendre les certifications"
    
    def export_csv(self, request, queryset):
        """Action pour exporter les données en CSV."""
        import csv
        from django.http import HttpResponse
        
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="utilisateurs_mavecam.csv"'
        
        writer = csv.writer(response)
        writer.writerow([
            'Téléphone', 'Nom', 'Type', 'Région', 'Activité', 
            'Certification', 'Date inscription'
        ])
        
        for user in queryset:
            certification = user.farm_profile.certification_status if hasattr(user, 'farm_profile') else 'N/A'
            writer.writerow([
                user.phone_number,
                user.display_name, 
                user.get_account_type_display(),
                user.get_region_display() if user.region else '',
                user.get_activity_type_display() if user.activity_type else '',
                certification,
                user.date_joined.strftime('%Y-%m-%d')
            ])
        
        return response
    export_csv.short_description = "Exporter en CSV"


@admin.register(FarmProfile)
class FarmProfileAdmin(admin.ModelAdmin):
    list_display = (
        'farm_name', 'user_display_name', 'certification_status', 
        'total_ponds', 'annual_production_kg', 'created_at'
    )
    list_filter = (
        'certification_status', 'created_at', 'user__region', 
        'user__activity_type'
    )
    search_fields = ('farm_name', 'user__phone_number', 'user__first_name', 'user__last_name')
    ordering = ('-created_at',)
    
    fieldsets = (
        ('Informations de base', {
            'fields': ('user', 'farm_name')
        }),
        ('Certification MAVECAM', {
            'fields': ('certification_status',),
            'classes': ('wide',)
        }),
        ('Informations techniques', {
            'fields': ('total_ponds', 'total_area_m2', 'water_source', 'main_species'),
            'classes': ('collapse',)
        }),
        ('Production', {
            'fields': ('annual_production_kg',),
            'classes': ('collapse',)
        }),
    )
    
    readonly_fields = ('id', 'created_at', 'updated_at')
    
    def user_display_name(self, obj):
        return obj.user.display_name
    
    user_display_name.short_description = 'Propriétaire'
    user_display_name.admin_order_field = 'user__first_name'

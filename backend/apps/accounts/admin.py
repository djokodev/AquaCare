"""
Administration securisee des comptes utilisateurs AquaCare.
Implemente le RBAC multi-niveau avec audit logging.

Roles:
- OWNER (is_superuser): Controle total
- MANAGERS (mavecam_managers): Gestion comptes + certifications
- Autres: Acces limite selon groupe
"""

from django.contrib import admin
from django.contrib.admin.models import CHANGE
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _
from django.contrib import messages
from django.core.exceptions import PermissionDenied

from .models import User, FarmProfile
from common.admin_mixins import (
    SecuredModelAdmin,
    ManagerMixin,
    PIIMaskingMixin,
    AuditLogMixin,
    RBACConstants,
)


class FarmProfileInline(admin.StackedInline):
    """
    Inline pour editer le FarmProfile directement depuis la page User.
    """
    model = FarmProfile
    extra = 0
    fields = (
        'farm_name', 'certification_status',
        'total_ponds', 'total_area_m2', 'water_source', 'main_species',
        'annual_production_kg'
    )
    readonly_fields = ('id', 'created_at', 'updated_at')

    def has_change_permission(self, request, obj=None):
        """Seuls managers et superusers peuvent modifier."""
        if request.user.is_superuser:
            return True
        return request.user.groups.filter(
            name=RBACConstants.GROUP_MANAGERS
        ).exists()

    def has_delete_permission(self, request, obj=None):
        """Seul superuser peut supprimer."""
        return request.user.is_superuser


@admin.register(User)
class UserAdmin(ManagerMixin, PIIMaskingMixin, AuditLogMixin, BaseUserAdmin):
    """
    Interface d'administration securisee pour les utilisateurs AquaCare.

    Securite:
    - Seul OWNER peut modifier is_staff/is_superuser/groups
    - MANAGERS peuvent voir/modifier users sauf admins
    - Actions critiques loguees via LogEntry
    - PII masques pour non-managers
    """

    list_display = (
        'phone_number', 'display_name', 'account_type', 'activity_type',
        'region', 'is_verified', 'farm_certification_status', 'is_staff_display',
        'date_joined'
    )
    list_filter = (
        'account_type', 'activity_type', 'region', 'is_verified',
        'is_active', 'is_staff', 'date_joined', 'farm_profile__certification_status'
    )
    search_fields = (
        'first_name', 'last_name', 'business_name',
        'email', 'farm_profile__farm_name'
    )
    ordering = ('-date_joined',)

    # Actions admin
    actions = ['verify_users', 'certify_farms', 'suspend_certifications']

    fieldsets = (
        (_('Informations de base'), {
            'fields': ('phone_number', 'email', 'password')
        }),
        (_('Informations personnelles'), {
            'fields': (
                'first_name', 'last_name', 'business_name', 'account_type',
                'language_preference', 'is_verified'
            )
        }),
        (_('Activite aquacole'), {
            'fields': ('activity_type', 'intervention_zone')
        }),
        (_('Localisation'), {
            'fields': ('region', 'department', 'district', 'city', 'neighborhood'),
            'classes': ('collapse',)
        }),
        (_('Entreprise'), {
            'fields': ('legal_status', 'promoter_name'),
            'classes': ('collapse',)
        }),
        (_('Personne physique'), {
            'fields': ('age_group',),
            'classes': ('collapse',)
        }),
        (_('Permissions'), {
            'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions'),
            'classes': ('collapse',),
            'description': _('Seul le superuser peut modifier ces champs.')
        }),
        (_('Dates importantes'), {
            'fields': ('last_login', 'date_joined'),
            'classes': ('collapse',)
        }),
    )

    add_fieldsets = (
        (_('Informations obligatoires'), {
            'classes': ('wide',),
            'fields': ('phone_number', 'password1', 'password2', 'first_name', 'last_name')
        }),
        (_('Informations complementaires'), {
            'classes': ('wide',),
            'fields': ('account_type', 'age_group', 'business_name', 'activity_type', 'region')
        }),
        (_('Permissions (admin seulement)'), {
            'classes': ('wide', 'collapse'),
            'fields': ('is_staff', 'is_active', 'groups'),
            'description': _('Cocher "is_staff" pour donner acces a l\'admin.')
        }),
    )

    inlines = [FarmProfileInline]

    # Champs proteges pour non-superusers
    protected_fields = ['is_staff', 'is_superuser', 'groups', 'user_permissions']

    def get_search_fields(self, request):
        """
        Retire phone_number de la recherche pour non-managers (PII).
        """
        search_fields = list(super().get_search_fields(request))

        if request.user.is_superuser:
            search_fields.append('phone_number')
        elif request.user.groups.filter(name=RBACConstants.GROUP_MANAGERS).exists():
            search_fields.append('phone_number')

        return search_fields

    def get_list_display(self, request):
        """Masque phone_number pour non-managers."""
        list_display = list(super().get_list_display(request))

        if not request.user.is_superuser:
            is_manager = request.user.groups.filter(
                name=RBACConstants.GROUP_MANAGERS
            ).exists()

            if not is_manager and 'phone_number' in list_display:
                # Remplacer par version masquee
                idx = list_display.index('phone_number')
                list_display[idx] = 'phone_masked'

        return list_display

    def get_readonly_fields(self, request, obj=None):
        """
        Rend les champs de permission readonly pour non-superusers.
        """
        readonly = list(super().get_readonly_fields(request, obj) or [])

        if not request.user.is_superuser:
            for field in self.protected_fields:
                if field not in readonly:
                    readonly.append(field)

        return readonly

    def get_queryset(self, request):
        """
        Filtre le queryset selon le role.
        - Managers ne voient pas les superusers
        - Non-managers voient tous les users non-admin
        """
        qs = super().get_queryset(request)

        if request.user.is_superuser:
            return qs

        # Managers: exclure superusers
        if request.user.groups.filter(name=RBACConstants.GROUP_MANAGERS).exists():
            return qs.filter(is_superuser=False)

        # Autres: exclure tous les staff
        return qs.filter(is_staff=False, is_superuser=False)

    def has_change_permission(self, request, obj=None):
        """
        Bloque modification d'un admin par un non-superuser.
        """
        if request.user.is_superuser:
            return True

        # Bloquer modification d'un admin
        if obj and obj.is_staff:
            return False

        return request.user.groups.filter(
            name=RBACConstants.GROUP_MANAGERS
        ).exists()

    def has_delete_permission(self, request, obj=None):
        """
        Seul superuser peut supprimer des utilisateurs.
        Impossible de supprimer un autre superuser ou soi-meme.
        """
        if not request.user.is_superuser:
            return False

        if obj:
            # Ne peut pas supprimer un superuser
            if obj.is_superuser:
                return False
            # Ne peut pas se supprimer soi-meme
            if obj.pk == request.user.pk:
                return False

        return True

    def get_actions(self, request):
        """
        Retire les actions selon le role.
        """
        actions = super().get_actions(request)

        if not request.user.is_superuser:
            # Retirer delete_selected pour non-superusers
            if 'delete_selected' in actions:
                del actions['delete_selected']

            # Seuls managers peuvent certifier/suspendre
            is_manager = request.user.groups.filter(
                name=RBACConstants.GROUP_MANAGERS
            ).exists()

            if not is_manager:
                for action in ['verify_users', 'certify_farms', 'suspend_certifications']:
                    if action in actions:
                        del actions[action]

        return actions

    def save_model(self, request, obj, form, change):
        """
        Protection contre elevation de privileges + audit.
        """
        if change:
            try:
                original = User.objects.get(pk=obj.pk)

                # Verifier elevation de privileges
                if not request.user.is_superuser:
                    if not original.is_superuser and obj.is_superuser:
                        messages.error(request, _("Elevation vers superuser non autorisee."))
                        raise PermissionDenied(_("Elevation vers superuser non autorisee."))

                    if not original.is_staff and obj.is_staff:
                        messages.error(request, _("Promotion vers staff non autorisee."))
                        raise PermissionDenied(_("Promotion vers staff non autorisee."))

            except User.DoesNotExist:
                pass

        super().save_model(request, obj, form, change)

        # Audit logging
        from django.contrib.admin.models import ADDITION
        action = CHANGE if change else ADDITION
        self.log_action(request, obj, action)

    # --- Display methods ---

    def is_staff_display(self, obj):
        """Affiche le statut staff avec couleur."""
        if obj.is_superuser:
            return format_html('<span style="color: purple; font-weight: bold;">OWNER</span>')
        elif obj.is_staff:
            return format_html('<span style="color: blue;">Admin</span>')
        return format_html('<span style="color: gray;">-</span>')
    is_staff_display.short_description = _('Role')
    is_staff_display.admin_order_field = 'is_staff'

    def farm_certification_status(self, obj):
        """Affiche le statut de certification avec couleur."""
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
    farm_certification_status.short_description = _('Certification')
    farm_certification_status.admin_order_field = 'farm_profile__certification_status'

    # --- Actions securisees ---

    @admin.action(description=_("Verifier les telephones selectionnes"))
    def verify_users(self, request, queryset):
        """
        Action pour verifier les numeros de telephone.
        Requiert permission manager.
        """
        # Verifier permission
        if not request.user.is_superuser:
            if not request.user.groups.filter(name=RBACConstants.GROUP_MANAGERS).exists():
                messages.error(request, _("Vous n'avez pas la permission de verifier les utilisateurs."))
                return

        count = queryset.update(is_verified=True)

        # Audit logging pour chaque user verifie
        for user in queryset:
            self.log_action(request, user, CHANGE, message="Telephone verifie via action admin")

        messages.success(request, _('{} utilisateur(s) verifie(s).').format(count))

    @admin.action(description=_("Certifier les fermes selectionnees"))
    def certify_farms(self, request, queryset):
        """
        Action pour certifier les fermes.
        Requiert permission manager.
        """
        if not request.user.is_superuser:
            if not request.user.groups.filter(name=RBACConstants.GROUP_MANAGERS).exists():
                messages.error(request, _("Vous n'avez pas la permission de certifier les fermes."))
                return

        count = 0
        for user in queryset:
            if hasattr(user, 'farm_profile'):
                user.farm_profile.certification_status = 'certified'
                user.farm_profile.save()
                count += 1
                # Audit
                self.log_action(request, user, CHANGE, message="Ferme certifiee via action admin")

        messages.success(request, _('{} ferme(s) certifiee(s).').format(count))

    @admin.action(description=_("Suspendre les certifications"))
    def suspend_certifications(self, request, queryset):
        """
        Action pour suspendre les certifications.
        Requiert permission manager.
        """
        if not request.user.is_superuser:
            if not request.user.groups.filter(name=RBACConstants.GROUP_MANAGERS).exists():
                messages.error(request, _("Vous n'avez pas la permission de suspendre les certifications."))
                return

        count = 0
        for user in queryset:
            if hasattr(user, 'farm_profile'):
                user.farm_profile.certification_status = 'suspended'
                user.farm_profile.save()
                count += 1
                # Audit
                self.log_action(request, user, CHANGE, message="Certification suspendue via action admin")

        messages.success(request, _('{} certification(s) suspendue(s).').format(count))


@admin.register(FarmProfile)
class FarmProfileAdmin(ManagerMixin, PIIMaskingMixin, SecuredModelAdmin):
    """
    Administration securisee des profils de ferme.
    """

    list_display = (
        'farm_name', 'user_display_name', 'certification_status',
        'total_ponds', 'annual_production_kg', 'created_at'
    )
    list_filter = (
        'certification_status', 'created_at', 'user__region',
        'user__activity_type'
    )
    search_fields = ('farm_name', 'user__first_name', 'user__last_name')
    ordering = ('-created_at',)

    fieldsets = (
        (_('Informations de base'), {
            'fields': ('user', 'farm_name')
        }),
        (_('Certification'), {
            'fields': ('certification_status',),
            'classes': ('wide',)
        }),
        (_('Informations techniques'), {
            'fields': ('total_ponds', 'total_area_m2', 'water_source', 'main_species'),
            'classes': ('collapse',)
        }),
        (_('Production'), {
            'fields': ('annual_production_kg',),
            'classes': ('collapse',)
        }),
    )

    readonly_fields = ('id', 'created_at', 'updated_at')

    def get_search_fields(self, request):
        """Ajoute phone_number pour managers uniquement."""
        search_fields = list(super().get_search_fields(request) or self.search_fields)

        if request.user.is_superuser:
            search_fields.append('user__phone_number')
        elif request.user.groups.filter(name=RBACConstants.GROUP_MANAGERS).exists():
            search_fields.append('user__phone_number')

        return search_fields

    def user_display_name(self, obj):
        """Affiche le nom du proprietaire."""
        return obj.user.display_name
    user_display_name.short_description = _('Proprietaire')
    user_display_name.admin_order_field = 'user__first_name'

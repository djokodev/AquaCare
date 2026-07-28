"""
Administration securisee des comptes utilisateurs AquaCare.
Implemente le RBAC multi-niveau avec audit logging.

Roles:
- OWNER (is_superuser): Controle total
- MANAGERS (aquacare_managers): Gestion comptes + certifications
- Autres: Acces limite selon groupe
"""

from collections.abc import Iterable
from typing import Final

from common.admin_mixins import (
    AuditLogMixin,
    ManagerMixin,
    PIIMaskingMixin,
    RBACConstants,
    SecuredModelAdmin,
)
from django.contrib import admin, messages
from django.contrib.admin.models import CHANGE
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.core.exceptions import PermissionDenied
from django.core.paginator import Paginator
from django.http import JsonResponse
from django.shortcuts import render
from django.urls import path
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _

from .admin_serializers import FarmMapSerializer
from .models import FarmProfile, User


class AccountsAdminRoleMixin:
    """Centralise les decisions RBAC communes au module accounts admin."""

    manager_actions: Final[tuple[str, ...]] = (
        'verify_users',
        'certify_farms',
        'suspend_certifications',
    )

    def _is_superuser(self, request) -> bool:
        return request.user.is_superuser

    def _is_manager(self, request) -> bool:
        return request.user.groups.filter(
            name__in=RBACConstants.group_names_for(RBACConstants.GROUP_MANAGERS),
        ).exists()

    def _can_manage_accounts(self, request) -> bool:
        return self._is_superuser(request) or self._is_manager(request)

    def _can_view_phone_number(self, request) -> bool:
        return self._can_manage_accounts(request)

    def _ensure_manager_access(self, request, error_message: str) -> bool:
        if self._can_manage_accounts(request):
            return True

        messages.error(request, error_message)
        return False


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
class UserAdmin(
    AccountsAdminRoleMixin,
    ManagerMixin,
    PIIMaskingMixin,
    AuditLogMixin,
    BaseUserAdmin,
):
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

    def _append_unique_field(self, fields: list[str], field_name: str) -> list[str]:
        if field_name not in fields:
            fields.append(field_name)
        return fields

    def _get_target_users(self, queryset) -> list[User]:
        return list(queryset.select_related('farm_profile'))

    def _log_bulk_change(self, request, users: Iterable[User], message: str) -> None:
        for user in users:
            self.log_action(request, user, CHANGE, message=message)

    def _update_farm_certification_status(
        self,
        request,
        queryset,
        *,
        target_status: str,
        audit_message: str,
        success_message: str,
        permission_error: str,
    ) -> None:
        if not self._ensure_manager_access(request, permission_error):
            return

        target_users = self._get_target_users(queryset)
        farm_profile_ids = [
            user.farm_profile.pk
            for user in target_users
            if hasattr(user, 'farm_profile')
        ]
        count = FarmProfile.objects.filter(pk__in=farm_profile_ids).exclude(
            certification_status=target_status
        ).update(certification_status=target_status)

        self._log_bulk_change(
            request,
            [user for user in target_users if hasattr(user, 'farm_profile')],
            audit_message,
        )
        messages.success(request, success_message.format(count=count))

    def get_search_fields(self, request):
        """
        Retire phone_number de la recherche pour non-managers (PII).
        """
        search_fields = list(super().get_search_fields(request))

        if self._can_view_phone_number(request):
            self._append_unique_field(search_fields, 'phone_number')

        return search_fields

    def get_list_display(self, request):
        """Masque phone_number pour non-managers."""
        list_display = list(super().get_list_display(request))

        if not self._can_view_phone_number(request) and 'phone_number' in list_display:
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
        qs = super().get_queryset(request).select_related('farm_profile')

        if self._is_superuser(request):
            return qs

        if self._is_manager(request):
            return qs.filter(is_superuser=False)

        return qs.filter(is_staff=False, is_superuser=False)

    def has_change_permission(self, request, obj=None):
        """
        Bloque modification d'un admin par un non-superuser.
        """
        if self._is_superuser(request):
            return True

        if obj and obj.is_staff:
            return False

        return self._is_manager(request)

    def has_delete_permission(self, request, obj=None):
        """
        Seul superuser peut supprimer des utilisateurs.
        Impossible de supprimer un autre superuser ou soi-meme.
        """
        if not self._is_superuser(request):
            return False

        if obj:
            if obj.is_superuser:
                return False
            if obj.pk == request.user.pk:
                return False

        return True

    def get_actions(self, request):
        """
        Retire les actions selon le role.
        """
        actions = super().get_actions(request)

        if not self._is_superuser(request):
            actions.pop('delete_selected', None)

            if not self._is_manager(request):
                for action_name in self.manager_actions:
                    actions.pop(action_name, None)

        return actions

    def save_model(self, request, obj, form, change):
        """
        Protection contre elevation de privileges + audit.
        """
        if change:
            try:
                original = User.objects.only('id', 'is_superuser', 'is_staff').get(pk=obj.pk)

                # Verifier elevation de privileges
                if not request.user.is_superuser:
                    if not original.is_superuser and obj.is_superuser:
                        raise PermissionDenied(_("Elevation vers superuser non autorisee."))

                    if not original.is_staff and obj.is_staff:
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
        if not self._ensure_manager_access(
            request,
            _("Vous n'avez pas la permission de verifier les utilisateurs."),
        ):
            return

        count = queryset.update(is_verified=True)
        self._log_bulk_change(request, queryset, "Telephone verifie via action admin")
        messages.success(request, _('{count} utilisateur(s) verifie(s).').format(count=count))

    @admin.action(description=_("Certifier les fermes selectionnees"))
    def certify_farms(self, request, queryset):
        """
        Action pour certifier les fermes.
        Requiert permission manager.
        """
        self._update_farm_certification_status(
            request,
            queryset,
            target_status='certified',
            audit_message="Ferme certifiee via action admin",
            success_message=_('{count} ferme(s) certifiee(s).'),
            permission_error=_("Vous n'avez pas la permission de certifier les fermes."),
        )

    @admin.action(description=_("Suspendre les certifications"))
    def suspend_certifications(self, request, queryset):
        """
        Action pour suspendre les certifications.
        Requiert permission manager.
        """
        self._update_farm_certification_status(
            request,
            queryset,
            target_status='suspended',
            audit_message="Certification suspendue via action admin",
            success_message=_('{count} certification(s) suspendue(s).'),
            permission_error=_("Vous n'avez pas la permission de suspendre les certifications."),
        )


@admin.register(FarmProfile)
class FarmProfileAdmin(AccountsAdminRoleMixin, ManagerMixin, PIIMaskingMixin, SecuredModelAdmin):
    """
    Administration securisee des profils de ferme.
    """

    list_display = (
        'farm_name', 'user_display_name', 'certification_status',
        'total_ponds', 'annual_production_kg', 'gps_status', 'created_at'
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
        (_('Localisation GPS'), {
            'fields': ('latitude', 'longitude', 'location_address'),
            'classes': ('collapse',)
        }),
    )

    readonly_fields = ('id', 'created_at', 'updated_at')

    def get_queryset(self, request):
        """Charge le proprietaire en eager loading pour la liste admin."""
        return super().get_queryset(request).select_related('user')

    def get_search_fields(self, request):
        """Ajoute phone_number pour managers uniquement."""
        search_fields = list(super().get_search_fields(request) or self.search_fields)

        if self._can_view_phone_number(request) and 'user__phone_number' not in search_fields:
            search_fields.append('user__phone_number')

        return search_fields

    def user_display_name(self, obj):
        """Affiche le nom du proprietaire."""
        return obj.user.display_name
    user_display_name.short_description = _('Proprietaire')
    user_display_name.admin_order_field = 'user__first_name'

    def gps_status(self, obj):
        """Affiche si la ferme est géolocalisée."""
        if obj.latitude and obj.longitude:
            return format_html('<span style="color: green;">📍 Géolocalisée</span>')
        return format_html('<span style="color: #aaa;">— Non localisée</span>')
    gps_status.short_description = _('GPS')

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                'map/',
                self.admin_site.admin_view(self.farm_map_view),
                name='accounts_farmprofile_map',
            ),
            path(
                'map-data/',
                self.admin_site.admin_view(self.farm_map_data_view),
                name='accounts_farmprofile_map_data',
            ),
        ]
        return custom_urls + urls

    def farm_map_view(self, request):
        """Page carte Leaflet des fermes géolocalisées."""
        if not self.has_view_permission(request):
            raise PermissionDenied

        context = {
            **self.admin_site.each_context(request),
            'title': 'Carte des fermes',
            'opts': self.model._meta,
        }
        return render(request, 'admin/accounts/farm_map.html', context)

    def farm_map_data_view(self, request):
        """Payload paginé pour la carte des fermes dans l'admin Django."""
        if not self.has_view_permission(request):
            raise PermissionDenied

        queryset = (
            FarmProfile.objects
            .select_related('user')
            .filter(
                latitude__isnull=False,
                longitude__isnull=False,
                is_deleted=False,
            )
        )

        region = request.GET.get('region')
        if region:
            queryset = queryset.filter(user__region=region)

        certification_status = request.GET.get('certification_status')
        if certification_status:
            queryset = queryset.filter(certification_status=certification_status)

        paginator = Paginator(queryset, 50)
        page = paginator.get_page(request.GET.get('page') or 1)
        serializer = FarmMapSerializer(page.object_list, many=True)

        return JsonResponse({
            'count': paginator.count,
            'next': page.next_page_number() if page.has_next() else None,
            'previous': page.previous_page_number() if page.has_previous() else None,
            'results': serializer.data,
        })

    def changelist_view(self, request, extra_context=None):
        extra_context = extra_context or {}
        extra_context['farm_map_url'] = '../map/'
        return super().changelist_view(request, extra_context=extra_context)

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

from common.admin_capabilities import (
    AdminCapability,
    has_capability,
    has_capability_and_permission,
)
from common.admin_mixins import (
    AuditLogMixin,
    ManagerMixin,
    PIIMaskingMixin,
    SecuredModelAdmin,
)
from common.admin_policies import RBACConstants
from django.contrib import admin, messages
from django.contrib.admin.models import CHANGE
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.core.exceptions import PermissionDenied
from django.core.paginator import Paginator
from django.db.models import Count, DateTimeField, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render
from django.urls import path, reverse
from django.utils.html import format_html, format_html_join
from django.utils.translation import gettext_lazy as _

from .admin_serializers import FarmMapSerializer
from .models import FarmProfile, User
from .services.farm_supervision_service import FarmSupervisionService


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
        return has_capability(request.user, AdminCapability.MANAGE_ACCOUNTS)

    def _can_manage_accounts(self, request) -> bool:
        return self._is_superuser(request) or has_capability_and_permission(
            request.user,
            AdminCapability.MANAGE_ACCOUNTS,
            "accounts.change_user",
        )

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
        return has_capability_and_permission(
            request.user,
            AdminCapability.MANAGE_ACCOUNTS,
            "accounts.change_farmprofile",
        )

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
    change_list_template = "admin/change_list_responsive.html"

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

    def has_module_permission(self, request):
        return request.user.is_superuser or has_capability_and_permission(
            request.user,
            AdminCapability.VIEW_USERS,
            "accounts.view_user",
        )

    def has_view_permission(self, request, obj=None):
        if request.user.is_superuser:
            return True
        if self._is_manager(request):
            return has_capability_and_permission(
                request.user,
                AdminCapability.VIEW_USERS,
                "accounts.view_user",
            )
        return obj is None and has_capability_and_permission(
            request.user,
            AdminCapability.VIEW_USERS,
            "accounts.view_user",
        )

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
        Retire telephone et e-mail de la recherche Support (PII).
        """
        search_fields = list(super().get_search_fields(request))

        if self._can_view_phone_number(request):
            self._append_unique_field(search_fields, 'phone_number')
        else:
            search_fields = [field for field in search_fields if field != 'email']

        return search_fields

    def get_list_display(self, request):
        """Expose uniquement l'identite fonctionnelle minimale au Support."""
        if not self._can_view_phone_number(request):
            return (
                'support_context_link',
                'account_type',
                'activity_type',
                'region',
                'is_verified',
                'farm_certification_status',
                'date_joined',
            )

        list_display = list(super().get_list_display(request))
        return list_display

    def get_list_display_links(self, request, list_display):
        if not self._can_manage_accounts(request):
            return None
        return super().get_list_display_links(request, list_display)

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
        qs = super().get_queryset(request).select_related('farm_profile').prefetch_related('groups')

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

        return has_capability_and_permission(
            request.user,
            AdminCapability.MANAGE_ACCOUNTS,
            "accounts.change_user",
        )

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
        """Affiche les rôles opérationnels effectifs avec des badges lisibles."""
        if obj.is_superuser:
            return format_html(
                '<span class="aquacare-role-badge aquacare-role-badge--owner">{}</span>',
                _("Superadministrateur"),
            )
        if not obj.is_staff:
            return format_html('<span class="aquacare-role-empty">—</span>')

        role_labels = {
            RBACConstants.GROUP_MANAGERS: (_("Manager aquacole"), "manager"),
            RBACConstants.GROUP_COMMERCE: (_("Commerce"), "commerce"),
            RBACConstants.GROUP_SUPPORT: (_("Support"), "support"),
        }
        roles = [
            role_labels[group.name]
            for group in obj.groups.all()
            if group.name in role_labels
        ]
        if not roles:
            roles = [(_("Staff sans role"), "staff")]
        return format_html_join(
            " ",
            '<span class="aquacare-role-badge aquacare-role-badge--{}">{}</span>',
            ((style, label) for label, style in roles),
        )
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

    def support_context_link(self, obj):
        """Lien minimal vers l'espace ferme, jamais vers la fiche PII."""
        farm = obj.farm_profile if hasattr(obj, 'farm_profile') else None
        if farm is None:
            return obj.display_name
        return format_html(
            '<a href="{}">{}</a>',
            reverse('admin:accounts_farmprofile_supervision', args=[farm.pk]),
            obj.display_name,
        )
    support_context_link.short_description = _('Utilisateur')
    support_context_link.admin_order_field = 'first_name'

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
    change_list_template = "admin/change_list_responsive.html"

    list_display = (
        'farm_workspace_link', 'user_display_name', 'farm_location',
        'certification_status', 'active_unit_count', 'active_cycle_count',
        'unresolved_incident_count', 'last_operational_activity',
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

    def has_module_permission(self, request):
        return request.user.is_superuser or has_capability_and_permission(
            request.user,
            AdminCapability.VIEW_FARM_DIRECTORY,
            "accounts.view_farmprofile",
        )

    def has_view_permission(self, request, obj=None):
        if request.user.is_superuser:
            return True
        if not has_capability_and_permission(
            request.user,
            AdminCapability.VIEW_FARM_DIRECTORY,
            "accounts.view_farmprofile",
        ):
            return False
        if obj is not None and not self._is_manager(request):
            return False
        return True

    def has_add_permission(self, request):
        return request.user.is_superuser or (
            self._is_manager(request) and request.user.has_perm("accounts.add_farmprofile")
        )

    def has_change_permission(self, request, obj=None):
        return request.user.is_superuser or (
            self._is_manager(request) and request.user.has_perm("accounts.change_farmprofile")
        )

    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser

    def get_list_display(self, request):
        if request.user.is_superuser or self._is_manager(request):
            return super().get_list_display(request)
        return ("farm_workspace_link", "user_display_name", "certification_status", "created_at")

    def get_list_display_links(self, request, list_display):
        # Le lien fonctionnel principal est rendu par ``farm_workspace_link``.
        # Aucun lien implicite ne doit renvoyer vers le formulaire générique.
        return None

    def get_queryset(self, request):
        """Liste bornée fondée sur les relations opérationnelles réelles."""
        from aquaculture.models import (
            CycleLog,
            ProductionCycle,
            ProductionReport,
            ProductionUnit,
            SanitaryLog,
        )
        from commerce.models import Order

        def latest(queryset, field="created_at"):
            return Subquery(
                queryset.order_by(f"-{field}").values(field)[:1],
                output_field=DateTimeField(),
            )

        report_activity = (
            ProductionReport.objects.filter(farm_profile=OuterRef("pk"), is_deleted=False)
            .annotate(activity_at=Coalesce("generated_at", "created_at"))
            .order_by("-activity_at")
        )
        return (
            super().get_queryset(request)
            .filter(is_deleted=False)
            .select_related('user')
            .annotate(
                _active_unit_count=Count(
                    "production_units",
                    filter=~Q(production_units__status="archived"),
                    distinct=True,
                ),
                _active_cycle_count=Count(
                    "production_cycles",
                    filter=Q(production_cycles__status="active"),
                    distinct=True,
                ),
                _unresolved_incident_count=Count(
                    "production_cycles__sanitary_logs",
                    filter=Q(production_cycles__sanitary_logs__resolved=False),
                    distinct=True,
                ),
                _last_unit_activity=latest(
                    ProductionUnit.objects.filter(farm_profile=OuterRef("pk"))
                ),
                _last_cycle_activity=latest(
                    ProductionCycle.objects.filter(farm_profile=OuterRef("pk"))
                ),
                _last_cycle_log_activity=latest(
                    CycleLog.objects.filter(cycle__farm_profile=OuterRef("pk"))
                ),
                _last_sanitary_activity=latest(
                    SanitaryLog.objects.filter(cycle__farm_profile=OuterRef("pk"))
                ),
                _last_report_activity=Subquery(
                    report_activity.values("activity_at")[:1],
                    output_field=DateTimeField(),
                ),
                _last_order_activity=latest(
                    Order.objects.filter(farm_profile=OuterRef("pk")),
                    field="updated_at",
                ),
            )
        )

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

    def farm_workspace_link(self, obj):
        return format_html(
            '<a href="{}">{}</a>',
            reverse('admin:accounts_farmprofile_supervision', args=[obj.pk]),
            obj.farm_name,
        )
    farm_workspace_link.short_description = _('Ferme')
    farm_workspace_link.admin_order_field = 'farm_name'

    def farm_location(self, obj):
        region = obj.user.get_region_display() or _("Inconnue")
        city = obj.user.city or _("Ville inconnue")
        return _("%(region)s, %(city)s") % {"region": region, "city": city}
    farm_location.short_description = _("Region et ville")
    farm_location.admin_order_field = "user__region"

    def active_unit_count(self, obj):
        return obj._active_unit_count
    active_unit_count.short_description = _("Unites non archivees")
    active_unit_count.admin_order_field = "_active_unit_count"

    def active_cycle_count(self, obj):
        return obj._active_cycle_count
    active_cycle_count.short_description = _("Cycles actifs")
    active_cycle_count.admin_order_field = "_active_cycle_count"

    def unresolved_incident_count(self, obj):
        return obj._unresolved_incident_count
    unresolved_incident_count.short_description = _("Incidents non resolus")
    unresolved_incident_count.admin_order_field = "_unresolved_incident_count"

    def last_operational_activity(self, obj):
        values = [
            getattr(obj, field, None)
            for field in (
                "_last_unit_activity",
                "_last_cycle_activity",
                "_last_cycle_log_activity",
                "_last_sanitary_activity",
                "_last_report_activity",
                "_last_order_activity",
            )
        ]
        known_values = [value for value in values if value is not None]
        return max(known_values) if known_values else _("Inconnue")
    last_operational_activity.short_description = _("Derniere activite")

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
            path(
                '<uuid:object_id>/supervision/',
                self.admin_site.admin_view(self.farm_supervision_view),
                name='accounts_farmprofile_supervision',
            ),
        ]
        return custom_urls + urls

    def farm_map_view(self, request):
        """Page carte Leaflet des fermes géolocalisées."""
        if not (
            request.user.is_superuser
            or has_capability_and_permission(
                request.user,
                AdminCapability.MANAGE_ACCOUNTS,
                "accounts.view_farmprofile",
            )
        ):
            raise PermissionDenied

        context = {
            **self.admin_site.each_context(request),
            'title': 'Carte des fermes',
            'opts': self.model._meta,
        }
        return render(request, 'admin/accounts/farm_map.html', context)

    def farm_map_data_view(self, request):
        """Payload paginé pour la carte des fermes dans l'admin Django."""
        if not (
            request.user.is_superuser
            or has_capability_and_permission(
                request.user,
                AdminCapability.MANAGE_ACCOUNTS,
                "accounts.view_farmprofile",
            )
        ):
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

    def farm_supervision_view(self, request, object_id):
        """Espace ferme dont les blocs sont bornes au role effectif."""
        if request.user.is_superuser or has_capability_and_permission(
            request.user,
            AdminCapability.VIEW_FARM_DIRECTORY,
            "accounts.view_farmprofile",
        ):
            queryset = FarmProfile.objects.select_related("user").filter(is_deleted=False)
        elif has_capability_and_permission(
            request.user,
            AdminCapability.VIEW_FARM_CONTEXT,
            "accounts.view_farmprofile",
        ):
            queryset = (
                FarmProfile.objects.select_related("user")
                .filter(is_deleted=False, orders__isnull=False)
                .distinct()
            )
        else:
            raise PermissionDenied

        farm = get_object_or_404(queryset, pk=object_id)
        supervision = FarmSupervisionService.build(user=request.user, farm=farm)
        context = {
            **self.admin_site.each_context(request),
            "title": _("Supervision de %(farm)s") % {"farm": farm.farm_name},
            "farm": farm,
            "sections": supervision["sections"],
            "activities": supervision["activities"],
            "opts": self.model._meta,
        }
        return render(request, "admin/accounts/farmprofile/supervision.html", context)

    def changelist_view(self, request, extra_context=None):
        extra_context = extra_context or {}
        if request.user.is_superuser or self._is_manager(request):
            extra_context['farm_map_url'] = '../map/'
        return super().changelist_view(request, extra_context=extra_context)

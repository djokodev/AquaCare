"""
Mixins de securite pour l'admin Django AquaCare.
Implementent le RBAC multi-niveau avec audit logging.

Usage:
    from common.admin_mixins import SecuredModelAdmin, RBACConstants

    @admin.register(MyModel)
    class MyModelAdmin(SecuredModelAdmin):
        ...
"""
from __future__ import annotations

from django.contrib import admin, messages
from django.contrib.admin.models import ADDITION, CHANGE, DELETION, LogEntry
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import FieldDoesNotExist, PermissionDenied
from django.db.models import QuerySet
from django.http import HttpRequest
from django.utils.translation import gettext_lazy as _


def _user_has_group(request: HttpRequest, group_name: str) -> bool:
    return request.user.groups.filter(name=group_name).exists()


class RBACConstants:
    """Constantes pour le systeme RBAC AquaCare."""

    # Noms des groupes Django
    GROUP_MANAGERS = 'mavecam_managers'
    GROUP_COMMERCE = 'mavecam_commerce'
    GROUP_SUPPORT = 'mavecam_support'

    # Mapping role -> apps visibles (utilise app_label, pas le chemin complet)
    ROLE_APPS = {
        GROUP_MANAGERS: ['accounts', 'aquaculture', 'notifications'],
        GROUP_COMMERCE: ['commerce', 'aquaculture'],
        GROUP_SUPPORT: ['chat', 'notifications'],
    }

    # Champs sensibles (PII) a masquer
    SENSITIVE_FIELDS = [
        'phone_number', 'password', 'last_login',
        'expo_push_token', 'device_id'
    ]


class AuditLogMixin:
    """
    Mixin pour l'audit logging automatique des actions admin.
    Utilise django.contrib.admin.models.LogEntry (systeme natif Django).
    """

    def log_action(self, request: HttpRequest, obj: object, action_flag: int, message: str = '') -> None:
        """Enregistre une action dans LogEntry."""
        LogEntry.objects.log_action(
            user_id=request.user.pk,
            content_type_id=ContentType.objects.get_for_model(obj).pk,
            object_id=str(obj.pk),
            object_repr=str(obj)[:200],
            action_flag=action_flag,
            change_message=message or self._get_change_message(action_flag),
        )

    def _get_change_message(self, action_flag: int) -> str:
        """Message par defaut selon l'action."""
        action_messages = {
            ADDITION: 'Creation via admin',
            CHANGE: 'Modification via admin',
            DELETION: 'Suppression via admin',
        }
        return action_messages.get(action_flag, '')


class RoleAwareAdminMixin:
    """Helpers compacts pour exprimer les checks de role admin."""

    @staticmethod
    def _is_superuser(request: HttpRequest) -> bool:
        return request.user.is_superuser

    @staticmethod
    def _has_role(request: HttpRequest, group_name: str) -> bool:
        return _user_has_group(request, group_name)


class SecuredModelAdmin(RoleAwareAdminMixin, AuditLogMixin, admin.ModelAdmin):
    """
    ModelAdmin securise avec controle RBAC.

    Fonctionnalites:
    - Controle de visibilite des modules selon le role utilisateur
    - Bloque les actions sur les admins (sauf owner/superuser)
    - Audit logging automatique via LogEntry Django
    - Protection des champs sensibles (is_staff, is_superuser, etc.)
    - Masquage des PII pour operateurs

    Usage:
        @admin.register(MyModel)
        class MyModelAdmin(SecuredModelAdmin):
            list_display = [...]
    """

    # Champs toujours readonly pour non-superusers
    protected_fields = ['is_staff', 'is_superuser', 'groups', 'user_permissions']

    def get_queryset(self, request: HttpRequest) -> QuerySet:
        """
        Retourne le queryset de base.
        Override dans sous-classes pour filtrer selon le role.
        """
        return super().get_queryset(request)

    def has_module_permission(self, request: HttpRequest) -> bool:
        """
        Controle la visibilite du module dans le menu sidebar.
        Verifie si l'utilisateur a acces a cette app selon son groupe.
        """
        if not request.user.is_authenticated:
            return False

        if request.user.is_superuser:
            return True

        # Verifier appartenance aux groupes autorises
        app_label = self.model._meta.app_label
        user_groups = set(request.user.groups.values_list('name', flat=True))

        for group_name, allowed_apps in RBACConstants.ROLE_APPS.items():
            if group_name in user_groups and app_label in allowed_apps:
                return True

        return False

    def has_view_permission(self, request: HttpRequest, obj: object | None = None) -> bool:
        """Controle l'acces en lecture."""
        if self._is_superuser(request):
            return True
        return self.has_module_permission(request)

    def has_add_permission(self, request: HttpRequest) -> bool:
        """Controle l'acces en creation."""
        if self._is_superuser(request):
            return True
        return self.has_module_permission(request)

    def has_change_permission(self, request: HttpRequest, obj: object | None = None) -> bool:
        """
        Controle l'acces en modification.
        Bloque la modification d'admins par non-superusers.
        """
        if self._is_superuser(request):
            return True

        # Si l'objet est un User admin, bloquer pour non-superusers
        if obj and hasattr(obj, 'is_staff') and obj.is_staff:
            return False

        return self.has_module_permission(request)

    def has_delete_permission(self, request: HttpRequest, obj: object | None = None) -> bool:
        """
        Controle l'acces en suppression.
        Seul le superuser peut supprimer des objets.
        """
        if not self._is_superuser(request):
            return False

        # Empecher suppression d'un admin
        if obj and hasattr(obj, 'is_staff') and obj.is_staff:
            return False

        # Empecher auto-suppression
        if obj and hasattr(obj, 'pk') and obj.pk == request.user.pk:
            return False

        return True

    def get_readonly_fields(self, request: HttpRequest, obj: object | None = None) -> list[str]:
        """
        Rend les champs sensibles readonly pour non-superusers.
        """
        readonly = list(super().get_readonly_fields(request, obj) or [])

        if not self._is_superuser(request):
            for field in self.protected_fields:
                if field not in readonly:
                    # Verifier que le champ existe sur le modele
                    try:
                        self.model._meta.get_field(field)
                        readonly.append(field)
                    except FieldDoesNotExist:
                        pass

        return readonly

    def get_actions(self, request: HttpRequest) -> dict[str, tuple]:
        """
        Retire les actions dangereuses pour les non-superusers.
        """
        actions = super().get_actions(request)

        if not self._is_superuser(request):
            # Retirer delete_selected pour non-superusers
            if 'delete_selected' in actions:
                del actions['delete_selected']

        return actions

    def save_model(self, request: HttpRequest, obj: object, form: object, change: bool) -> None:
        """
        Override save pour audit et protection elevation privileges.
        """
        # Detecter tentative d'elevation de privileges
        if change and hasattr(obj, 'is_superuser'):
            try:
                original = self.model.objects.get(pk=obj.pk)
                if not original.is_superuser and obj.is_superuser:
                    if not self._is_superuser(request):
                        messages.error(request, _("Elevation de privileges non autorisee."))
                        raise PermissionDenied(_("Elevation de privileges non autorisee."))

                if not original.is_staff and obj.is_staff:
                    if not self._is_superuser(request):
                        messages.error(request, _("Vous ne pouvez pas promouvoir un utilisateur en staff."))
                        raise PermissionDenied(_("Vous ne pouvez pas promouvoir un utilisateur en staff."))
            except self.model.DoesNotExist:
                pass

        super().save_model(request, obj, form, change)

        # Log l'action
        action = CHANGE if change else ADDITION
        self.log_action(request, obj, action)

    def delete_model(self, request: HttpRequest, obj: object) -> None:
        """Override delete pour audit."""
        self.log_action(request, obj, DELETION)
        super().delete_model(request, obj)


class CommerceOperatorMixin(RoleAwareAdminMixin):
    """
    Mixin specifique pour les operateurs commerce.
    Acces limite au catalogue et commandes.
    """

    def has_module_permission(self, request: HttpRequest) -> bool:
        """Commerce operators peuvent voir le module commerce."""
        if self._is_superuser(request):
            return True
        return self._has_role(request, RBACConstants.GROUP_COMMERCE)

    def has_add_permission(self, request: HttpRequest) -> bool:
        """Commerce operators peuvent ajouter produits."""
        if self._is_superuser(request):
            return True
        return self._has_role(request, RBACConstants.GROUP_COMMERCE)

    def has_change_permission(self, request: HttpRequest, obj: object | None = None) -> bool:
        """Commerce operators peuvent modifier produits."""
        if self._is_superuser(request):
            return True
        return self._has_role(request, RBACConstants.GROUP_COMMERCE)

    def has_delete_permission(self, request: HttpRequest, obj: object | None = None) -> bool:
        """Seul superuser peut supprimer."""
        return self._is_superuser(request)


class SupportOperatorMixin(RoleAwareAdminMixin):
    """
    Mixin specifique pour les operateurs support.
    Acces au chat et notifications.
    """

    def has_module_permission(self, request: HttpRequest) -> bool:
        """Support operators peuvent voir le module chat."""
        if self._is_superuser(request):
            return True
        return self._has_role(request, RBACConstants.GROUP_SUPPORT)

    def has_add_permission(self, request: HttpRequest) -> bool:
        """Support operators peuvent creer messages."""
        if self._is_superuser(request):
            return True
        return self._has_role(request, RBACConstants.GROUP_SUPPORT)

    def has_change_permission(self, request: HttpRequest, obj: object | None = None) -> bool:
        """Support operators peuvent modifier conversations."""
        if self._is_superuser(request):
            return True
        return self._has_role(request, RBACConstants.GROUP_SUPPORT)

    def has_delete_permission(self, request: HttpRequest, obj: object | None = None) -> bool:
        """Seul superuser peut supprimer."""
        return self._is_superuser(request)


class ManagerMixin(RoleAwareAdminMixin):
    """
    Mixin specifique pour les managers.
    Acces complet sauf modification admins.
    """

    def has_module_permission(self, request: HttpRequest) -> bool:
        """Managers peuvent voir accounts et aquaculture."""
        if self._is_superuser(request):
            return True
        return self._has_role(request, RBACConstants.GROUP_MANAGERS)

    def get_queryset(self, request: HttpRequest) -> QuerySet:
        """Managers ne voient pas les superusers."""
        qs = super().get_queryset(request)

        if not self._is_superuser(request):
            if self._has_role(request, RBACConstants.GROUP_MANAGERS):
                # Exclure les superusers du queryset
                if hasattr(self.model, 'is_superuser'):
                    qs = qs.filter(is_superuser=False)

        return qs

    def has_change_permission(self, request: HttpRequest, obj: object | None = None) -> bool:
        """Managers peuvent modifier sauf admins."""
        if self._is_superuser(request):
            return True

        # Bloquer modification d'un admin par un manager
        if obj and hasattr(obj, 'is_staff') and obj.is_staff:
            return False

        return self._has_role(request, RBACConstants.GROUP_MANAGERS)

    def has_delete_permission(self, request: HttpRequest, obj: object | None = None) -> bool:
        """Seul superuser peut supprimer."""
        return self._is_superuser(request)


class PIIMaskingMixin(RoleAwareAdminMixin):
    """
    Mixin pour masquer les informations personnelles sensibles.
    Les non-managers voient des donnees partiellement masquees.
    """

    def phone_masked(self, obj: object) -> str:
        """Affiche numero masque: +237 6XX XXX XX 45."""
        phone = getattr(obj, 'phone_number', '') or ''
        if len(phone) > 6:
            return f"{phone[:6]}{'X' * (len(phone) - 8)}{phone[-2:]}"
        return phone
    phone_masked.short_description = _('Telephone')

    def get_list_display(self, request: HttpRequest) -> list[str]:
        """Remplace les champs sensibles par versions masquees si non-manager."""
        list_display = list(super().get_list_display(request))

        if not self._is_superuser(request):
            is_manager = self._has_role(request, RBACConstants.GROUP_MANAGERS)

            if not is_manager:
                # Remplacer phone_number par version masquee
                if 'phone_number' in list_display:
                    idx = list_display.index('phone_number')
                    list_display[idx] = 'phone_masked'

        return list_display

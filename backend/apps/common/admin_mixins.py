"""
Mixins de securite pour l'admin Django AquaCare.
Implementent le RBAC multi-niveau avec audit logging.

Usage:
    from apps.common.admin_mixins import SecuredModelAdmin, RBACConstants

    @admin.register(MyModel)
    class MyModelAdmin(SecuredModelAdmin):
        ...
"""

from django.contrib import admin
from django.contrib.admin.models import LogEntry, ADDITION, CHANGE, DELETION
from django.contrib.contenttypes.models import ContentType
from django.utils.translation import gettext_lazy as _
from django.contrib import messages
from django.core.exceptions import PermissionDenied


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

    def log_action(self, request, obj, action_flag, message=''):
        """Enregistre une action dans LogEntry."""
        LogEntry.objects.log_action(
            user_id=request.user.pk,
            content_type_id=ContentType.objects.get_for_model(obj).pk,
            object_id=str(obj.pk),
            object_repr=str(obj)[:200],
            action_flag=action_flag,
            change_message=message or self._get_change_message(action_flag),
        )

    def _get_change_message(self, action_flag):
        """Message par defaut selon l'action."""
        action_messages = {
            ADDITION: 'Creation via admin',
            CHANGE: 'Modification via admin',
            DELETION: 'Suppression via admin',
        }
        return action_messages.get(action_flag, '')


class SecuredModelAdmin(AuditLogMixin, admin.ModelAdmin):
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

    def get_queryset(self, request):
        """
        Retourne le queryset de base.
        Override dans sous-classes pour filtrer selon le role.
        """
        return super().get_queryset(request)

    def has_module_permission(self, request):
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

    def has_view_permission(self, request, obj=None):
        """Controle l'acces en lecture."""
        if request.user.is_superuser:
            return True
        return self.has_module_permission(request)

    def has_add_permission(self, request):
        """Controle l'acces en creation."""
        if request.user.is_superuser:
            return True
        return self.has_module_permission(request)

    def has_change_permission(self, request, obj=None):
        """
        Controle l'acces en modification.
        Bloque la modification d'admins par non-superusers.
        """
        if request.user.is_superuser:
            return True

        # Si l'objet est un User admin, bloquer pour non-superusers
        if obj and hasattr(obj, 'is_staff') and obj.is_staff:
            return False

        return self.has_module_permission(request)

    def has_delete_permission(self, request, obj=None):
        """
        Controle l'acces en suppression.
        Seul le superuser peut supprimer des objets.
        """
        if not request.user.is_superuser:
            return False

        # Empecher suppression d'un admin
        if obj and hasattr(obj, 'is_staff') and obj.is_staff:
            return False

        # Empecher auto-suppression
        if obj and hasattr(obj, 'pk') and obj.pk == request.user.pk:
            return False

        return True

    def get_readonly_fields(self, request, obj=None):
        """
        Rend les champs sensibles readonly pour non-superusers.
        """
        readonly = list(super().get_readonly_fields(request, obj) or [])

        if not request.user.is_superuser:
            for field in self.protected_fields:
                if field not in readonly:
                    # Verifier que le champ existe sur le modele
                    try:
                        self.model._meta.get_field(field)
                        readonly.append(field)
                    except Exception:
                        pass

        return readonly

    def get_actions(self, request):
        """
        Retire les actions dangereuses pour les non-superusers.
        """
        actions = super().get_actions(request)

        if not request.user.is_superuser:
            # Retirer delete_selected pour non-superusers
            if 'delete_selected' in actions:
                del actions['delete_selected']

        return actions

    def save_model(self, request, obj, form, change):
        """
        Override save pour audit et protection elevation privileges.
        """
        # Detecter tentative d'elevation de privileges
        if change and hasattr(obj, 'is_superuser'):
            try:
                original = self.model.objects.get(pk=obj.pk)
                if not original.is_superuser and obj.is_superuser:
                    if not request.user.is_superuser:
                        messages.error(request, _("Elevation de privileges non autorisee."))
                        raise PermissionDenied(_("Elevation de privileges non autorisee."))

                if not original.is_staff and obj.is_staff:
                    if not request.user.is_superuser:
                        messages.error(request, _("Vous ne pouvez pas promouvoir un utilisateur en staff."))
                        raise PermissionDenied(_("Vous ne pouvez pas promouvoir un utilisateur en staff."))
            except self.model.DoesNotExist:
                pass

        super().save_model(request, obj, form, change)

        # Log l'action
        action = CHANGE if change else ADDITION
        self.log_action(request, obj, action)

    def delete_model(self, request, obj):
        """Override delete pour audit."""
        self.log_action(request, obj, DELETION)
        super().delete_model(request, obj)


class CommerceOperatorMixin:
    """
    Mixin specifique pour les operateurs commerce.
    Acces limite au catalogue et commandes.
    """

    def has_module_permission(self, request):
        """Commerce operators peuvent voir le module commerce."""
        if request.user.is_superuser:
            return True
        return request.user.groups.filter(
            name=RBACConstants.GROUP_COMMERCE
        ).exists()

    def has_add_permission(self, request):
        """Commerce operators peuvent ajouter produits."""
        if request.user.is_superuser:
            return True
        return request.user.groups.filter(
            name=RBACConstants.GROUP_COMMERCE
        ).exists()

    def has_change_permission(self, request, obj=None):
        """Commerce operators peuvent modifier produits."""
        if request.user.is_superuser:
            return True
        return request.user.groups.filter(
            name=RBACConstants.GROUP_COMMERCE
        ).exists()

    def has_delete_permission(self, request, obj=None):
        """Seul superuser peut supprimer."""
        return request.user.is_superuser


class SupportOperatorMixin:
    """
    Mixin specifique pour les operateurs support.
    Acces au chat et notifications.
    """

    def has_module_permission(self, request):
        """Support operators peuvent voir le module chat."""
        if request.user.is_superuser:
            return True
        return request.user.groups.filter(
            name=RBACConstants.GROUP_SUPPORT
        ).exists()

    def has_add_permission(self, request):
        """Support operators peuvent creer messages."""
        if request.user.is_superuser:
            return True
        return request.user.groups.filter(
            name=RBACConstants.GROUP_SUPPORT
        ).exists()

    def has_change_permission(self, request, obj=None):
        """Support operators peuvent modifier conversations."""
        if request.user.is_superuser:
            return True
        return request.user.groups.filter(
            name=RBACConstants.GROUP_SUPPORT
        ).exists()

    def has_delete_permission(self, request, obj=None):
        """Seul superuser peut supprimer."""
        return request.user.is_superuser


class ManagerMixin:
    """
    Mixin specifique pour les managers.
    Acces complet sauf modification admins.
    """

    def has_module_permission(self, request):
        """Managers peuvent voir accounts et aquaculture."""
        if request.user.is_superuser:
            return True
        return request.user.groups.filter(
            name=RBACConstants.GROUP_MANAGERS
        ).exists()

    def get_queryset(self, request):
        """Managers ne voient pas les superusers."""
        qs = super().get_queryset(request)

        if not request.user.is_superuser:
            if request.user.groups.filter(name=RBACConstants.GROUP_MANAGERS).exists():
                # Exclure les superusers du queryset
                if hasattr(self.model, 'is_superuser'):
                    qs = qs.filter(is_superuser=False)

        return qs

    def has_change_permission(self, request, obj=None):
        """Managers peuvent modifier sauf admins."""
        if request.user.is_superuser:
            return True

        # Bloquer modification d'un admin par un manager
        if obj and hasattr(obj, 'is_staff') and obj.is_staff:
            return False

        return request.user.groups.filter(
            name=RBACConstants.GROUP_MANAGERS
        ).exists()

    def has_delete_permission(self, request, obj=None):
        """Seul superuser peut supprimer."""
        return request.user.is_superuser


class PIIMaskingMixin:
    """
    Mixin pour masquer les informations personnelles sensibles.
    Les non-managers voient des donnees partiellement masquees.
    """

    def phone_masked(self, obj):
        """Affiche numero masque: +237 6XX XXX XX 45."""
        phone = getattr(obj, 'phone_number', '') or ''
        if len(phone) > 6:
            return f"{phone[:6]}{'X' * (len(phone) - 8)}{phone[-2:]}"
        return phone
    phone_masked.short_description = _('Telephone')

    def get_list_display(self, request):
        """Remplace les champs sensibles par versions masquees si non-manager."""
        list_display = list(super().get_list_display(request))

        if not request.user.is_superuser:
            is_manager = request.user.groups.filter(
                name=RBACConstants.GROUP_MANAGERS
            ).exists()

            if not is_manager:
                # Remplacer phone_number par version masquee
                if 'phone_number' in list_display:
                    idx = list_display.index('phone_number')
                    list_display[idx] = 'phone_masked'

        return list_display

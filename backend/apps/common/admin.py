"""Enregistre les modèles techniques transversaux de la console Admin."""

from common.admin_mixins import SecuredModelAdmin
from django.contrib import admin
from django.contrib.auth.models import Group, Permission


@admin.register(Permission)
class PermissionAdmin(SecuredModelAdmin):
    """Inventaire des permissions, strictement réservé au superadministrateur."""

    list_display = ("name", "codename", "content_type")
    list_filter = ("content_type__app_label",)
    search_fields = ("name", "codename", "content_type__app_label")
    list_select_related = ("content_type",)

    def has_module_permission(self, request):
        return request.user.is_superuser

    def has_view_permission(self, request, obj=None):
        return request.user.is_superuser

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def get_actions(self, request):
        return {}


class SuperuserOnlyAdminMixin:
    """Barrière serveur ajoutée sans altérer les ModelAdmin tiers enveloppés."""

    def has_module_permission(self, request):
        return request.user.is_superuser and super().has_module_permission(request)

    def has_view_permission(self, request, obj=None):
        return request.user.is_superuser and super().has_view_permission(request, obj)

    def has_add_permission(self, request):
        return request.user.is_superuser and super().has_add_permission(request)

    def has_change_permission(self, request, obj=None):
        return request.user.is_superuser and super().has_change_permission(request, obj)

    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser and super().has_delete_permission(request, obj)

    def get_actions(self, request):
        return super().get_actions(request) if request.user.is_superuser else {}


def _protect_registered_technical_admins():
    """Réenregistre les Admin techniques avec leur classe d'origine intacte."""
    protected_models = [Group]
    protected_models.extend(
        model
        for model in tuple(admin.site._registry)
        if model._meta.app_label == "django_celery_beat"
        or (
            model._meta.app_label == "token_blacklist"
            and model._meta.model_name in {"outstandingtoken", "blacklistedtoken"}
        )
    )
    for model in protected_models:
        original_admin = admin.site._registry.get(model)
        if original_admin is None or isinstance(original_admin, SuperuserOnlyAdminMixin):
            continue
        protected_admin_class = type(
            f"SuperuserOnly{original_admin.__class__.__name__}",
            (SuperuserOnlyAdminMixin, original_admin.__class__),
            {"__module__": __name__},
        )
        admin.site.unregister(model)
        admin.site.register(model, protected_admin_class)


_protect_registered_technical_admins()

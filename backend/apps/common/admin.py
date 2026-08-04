"""Enregistre les modèles techniques transversaux de la console Admin."""

from common.admin_mixins import SecuredModelAdmin
from django.contrib import admin
from django.contrib.auth.models import Permission


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

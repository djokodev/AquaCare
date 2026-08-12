"""Recherche globale Admin bornee et adaptee aux roles."""

from __future__ import annotations

from common.admin_capabilities import AdminCapability, has_capability_and_permission
from django.db.models import Q
from django.urls import reverse


class AdminSearchService:
    MAX_RESULTS_PER_BLOCK = 10

    @classmethod
    def search(cls, user, query: str) -> dict[str, list[dict]]:
        normalized_query = query.strip()
        results: dict[str, list[dict]] = {"users": [], "farms": []}
        if len(normalized_query) < 2:
            return results

        if has_capability_and_permission(user, AdminCapability.VIEW_USERS, "accounts.view_user"):
            results["users"] = cls._search_users(user, normalized_query)
        if has_capability_and_permission(
            user, AdminCapability.VIEW_FARM_DIRECTORY, "accounts.view_farmprofile"
        ):
            results["farms"] = cls._search_directory_farms(normalized_query)
        elif has_capability_and_permission(
            user, AdminCapability.VIEW_FARM_CONTEXT, "accounts.view_farmprofile"
        ):
            results["farms"] = cls._search_commerce_farms(normalized_query)
        return results

    @classmethod
    def _search_users(cls, user, query: str) -> list[dict]:
        from accounts.models import User

        search_condition = (
            Q(first_name__icontains=query)
            | Q(last_name__icontains=query)
            | Q(business_name__icontains=query)
            | Q(farm_profile__farm_name__icontains=query)
        )
        is_manager = has_capability_and_permission(
            user, AdminCapability.MANAGE_ACCOUNTS, "accounts.change_user"
        )
        if is_manager:
            search_condition |= Q(email__icontains=query) | Q(phone_number__icontains=query)

        queryset = User.objects.filter(
            is_staff=False,
            is_superuser=False,
        ).filter(search_condition)
        if not is_manager:
            queryset = queryset.filter(farm_profile__isnull=False)
        queryset = queryset.select_related("farm_profile").order_by("first_name", "last_name")[
            : cls.MAX_RESULTS_PER_BLOCK
        ]
        results = []
        for item in queryset:
            farm = item.farm_profile if hasattr(item, "farm_profile") else None
            results.append(
                {
                    "label": item.display_name,
                    "context": farm.farm_name if farm else "",
                    "url": (
                        reverse("admin:accounts_user_change", args=[item.pk])
                        if is_manager
                        else reverse("admin:accounts_farmprofile_supervision", args=[farm.pk])
                    ),
                    "phone": item.phone_number if is_manager else "",
                    "email": item.email if is_manager else "",
                }
            )
        return results

    @classmethod
    def _base_farm_query(cls, query: str):
        from accounts.models import FarmProfile

        return FarmProfile.objects.select_related("user").filter(is_deleted=False).filter(
            Q(farm_name__icontains=query)
            | Q(user__first_name__icontains=query)
            | Q(user__last_name__icontains=query)
            | Q(user__business_name__icontains=query)
        )

    @classmethod
    def _search_directory_farms(cls, query: str) -> list[dict]:
        queryset = cls._base_farm_query(query).order_by("farm_name")[: cls.MAX_RESULTS_PER_BLOCK]
        return [cls._farm_result(farm, scope="directory") for farm in queryset]

    @classmethod
    def _search_commerce_farms(cls, query: str) -> list[dict]:
        # Le JOIN commandes constitue le perimetre Commerce. Il ne reutilise
        # jamais le queryset de l'annuaire et n'autorise pas le change form.
        queryset = (
            cls._base_farm_query(query)
            .filter(orders__isnull=False)
            .distinct()
            .order_by("farm_name")[: cls.MAX_RESULTS_PER_BLOCK]
        )
        return [cls._farm_result(farm, scope="commerce") for farm in queryset]

    @staticmethod
    def _farm_result(farm, *, scope: str) -> dict:
        return {
            "label": farm.farm_name,
            "context": farm.user.display_name,
            "url": reverse("admin:accounts_farmprofile_supervision", args=[farm.pk]),
            "scope": scope,
        }

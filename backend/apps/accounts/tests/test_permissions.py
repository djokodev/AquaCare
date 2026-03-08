from __future__ import annotations

import pytest
from accounts.permissions import IsMavecamAdmin, IsOwnerOrReadOnly
from django.contrib.auth.models import AnonymousUser
from rest_framework.test import APIRequestFactory


@pytest.mark.django_db
class TestIsOwnerOrReadOnly:
    @pytest.fixture
    def permission(self) -> IsOwnerOrReadOnly:
        return IsOwnerOrReadOnly()

    @pytest.fixture
    def request_factory(self) -> APIRequestFactory:
        return APIRequestFactory()

    @pytest.mark.parametrize("method", ["GET", "HEAD", "OPTIONS"])
    def test_safe_methods_are_allowed_for_non_owner(
        self,
        permission: IsOwnerOrReadOnly,
        request_factory: APIRequestFactory,
        user_factory,
        method: str,
    ) -> None:
        owner = user_factory()
        another_user = user_factory()
        request = getattr(request_factory, method.lower())("/")
        request.user = another_user

        assert permission.has_object_permission(request, view=None, obj=owner) is True

    def test_write_method_is_allowed_for_owner(
        self,
        permission: IsOwnerOrReadOnly,
        request_factory: APIRequestFactory,
        user_factory,
    ) -> None:
        owner = user_factory()
        request = request_factory.patch("/")
        request.user = owner

        assert permission.has_object_permission(request, view=None, obj=owner) is True

    def test_write_method_is_denied_for_non_owner(
        self,
        permission: IsOwnerOrReadOnly,
        request_factory: APIRequestFactory,
        user_factory,
    ) -> None:
        owner = user_factory()
        another_user = user_factory()
        request = request_factory.patch("/")
        request.user = another_user

        assert permission.has_object_permission(request, view=None, obj=owner) is False


@pytest.mark.django_db
class TestIsMavecamAdmin:
    @pytest.fixture
    def permission(self) -> IsMavecamAdmin:
        return IsMavecamAdmin()

    @pytest.fixture
    def request_factory(self) -> APIRequestFactory:
        return APIRequestFactory()

    def test_staff_user_has_permission(
        self,
        permission: IsMavecamAdmin,
        request_factory: APIRequestFactory,
        user_factory,
    ) -> None:
        staff_user = user_factory(is_staff=True)
        request = request_factory.get("/")
        request.user = staff_user

        assert permission.has_permission(request, view=None) is True

    def test_non_staff_user_is_denied(
        self,
        permission: IsMavecamAdmin,
        request_factory: APIRequestFactory,
        user_factory,
    ) -> None:
        regular_user = user_factory(is_staff=False)
        request = request_factory.get("/")
        request.user = regular_user

        assert permission.has_permission(request, view=None) is False

    def test_anonymous_user_is_denied(
        self,
        permission: IsMavecamAdmin,
        request_factory: APIRequestFactory,
    ) -> None:
        request = request_factory.get("/")
        request.user = AnonymousUser()

        assert permission.has_permission(request, view=None) is False

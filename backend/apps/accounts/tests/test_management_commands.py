from __future__ import annotations

import json
from io import StringIO

import pytest
from aquaculture.services.farm_production_plan_service import FarmProductionPlanService
from accounts.models import User
from common.admin_mixins import RBACConstants
from django.core.management import call_command
from django.core.management.base import CommandError
from django.contrib.auth.models import Group


@pytest.mark.django_db
class TestCreateSuperuserFromEnvCommand:
    command_name = "create_superuser_from_env"

    def test_command_skips_when_required_env_vars_are_missing(self, monkeypatch) -> None:
        monkeypatch.delenv("DJANGO_SUPERUSER_PHONE", raising=False)
        monkeypatch.delenv("DJANGO_SUPERUSER_PASSWORD", raising=False)

        stdout = StringIO()
        call_command(self.command_name, stdout=stdout)

        assert "Superuser non créé" in stdout.getvalue()
        assert User.objects.count() == 0

    def test_command_creates_superuser_from_environment(self, monkeypatch) -> None:
        monkeypatch.setenv("DJANGO_SUPERUSER_PHONE", "+237699999991")
        monkeypatch.setenv("DJANGO_SUPERUSER_PASSWORD", "super-secret-123")
        monkeypatch.setenv("DJANGO_SUPERUSER_FIRST_NAME", "Aqua")
        monkeypatch.setenv("DJANGO_SUPERUSER_LAST_NAME", "Admin")

        stdout = StringIO()
        call_command(self.command_name, stdout=stdout)

        user = User.objects.get(phone_number="+237699999991")
        assert user.is_superuser is True
        assert user.is_staff is True
        assert user.check_password("super-secret-123") is True
        assert "Superuser créé avec succès" in stdout.getvalue()

    def test_command_updates_existing_user_password_and_privileges(self, monkeypatch, user_factory) -> None:
        existing_user = user_factory(
            phone_number="+237699999992",
            password="ancien-mot-de-passe",
            is_staff=False,
            is_superuser=False,
        )
        monkeypatch.setenv("DJANGO_SUPERUSER_PHONE", existing_user.phone_number)
        monkeypatch.setenv("DJANGO_SUPERUSER_PASSWORD", "nouveau-mot-de-passe")
        monkeypatch.setenv("DJANGO_SUPERUSER_FIRST_NAME", "Admin")
        monkeypatch.setenv("DJANGO_SUPERUSER_LAST_NAME", "Updated")

        stdout = StringIO()
        call_command(self.command_name, stdout=stdout)

        existing_user.refresh_from_db()

        assert existing_user.check_password("nouveau-mot-de-passe") is True
        assert existing_user.is_staff is True
        assert existing_user.is_superuser is True
        output = stdout.getvalue()
        assert "mis à jour" in output
        assert "Droits superuser accordés" in output

    def test_command_matches_existing_user_with_normalized_phone(self, monkeypatch, user_factory) -> None:
        existing_user = user_factory(
            phone_number="+237699999993",
            password="ancien-mot-de-passe",
            is_staff=False,
            is_superuser=False,
        )
        monkeypatch.setenv("DJANGO_SUPERUSER_PHONE", "699999993")
        monkeypatch.setenv("DJANGO_SUPERUSER_PASSWORD", "nouveau-mot-de-passe")

        stdout = StringIO()
        call_command(self.command_name, stdout=stdout)

        existing_user.refresh_from_db()
        assert User.objects.count() == 1
        assert existing_user.check_password("nouveau-mot-de-passe") is True
        assert existing_user.is_staff is True
        assert existing_user.is_superuser is True


@pytest.mark.django_db
class TestSetupRbacCommand:
    command_name = "setup_rbac"

    def test_dry_run_rolls_back_created_groups(self) -> None:
        stdout = StringIO()

        call_command(self.command_name, "--dry-run", stdout=stdout)

        assert "DRY-RUN termine" in stdout.getvalue()
        assert not Group.objects.filter(name=RBACConstants.GROUP_MANAGERS).exists()
        assert not Group.objects.filter(name=RBACConstants.GROUP_COMMERCE).exists()
        assert not Group.objects.filter(name=RBACConstants.GROUP_SUPPORT).exists()

    def test_command_creates_core_rbac_groups_with_account_permissions(self) -> None:
        stdout = StringIO()

        call_command(self.command_name, stdout=stdout)

        manager_group = Group.objects.get(name=RBACConstants.GROUP_MANAGERS)
        commerce_group = Group.objects.get(name=RBACConstants.GROUP_COMMERCE)
        support_group = Group.objects.get(name=RBACConstants.GROUP_SUPPORT)
        manager_permissions = set(
            manager_group.permissions.values_list(
                "content_type__app_label",
                "codename",
            )
        )

        assert commerce_group.pk is not None
        assert support_group.pk is not None
        assert ("accounts", "view_user") in manager_permissions
        assert ("accounts", "change_user") in manager_permissions
        assert ("accounts", "view_farmprofile") in manager_permissions
        assert ("accounts", "change_farmprofile") in manager_permissions
        assert "RBAC configure avec succes" in stdout.getvalue()

    def test_reset_recreates_existing_rbac_groups(self) -> None:
        existing_group = Group.objects.create(name=RBACConstants.GROUP_MANAGERS)
        stdout = StringIO()

        call_command(self.command_name, "--reset", stdout=stdout)

        manager_group = Group.objects.get(name=RBACConstants.GROUP_MANAGERS)
        assert manager_group.pk != existing_group.pk
        assert "Supprime groupe" in stdout.getvalue()


@pytest.mark.django_db
class TestAuditAccountsDataCommand:
    command_name = "audit_accounts_data"

    def test_command_passes_with_consistent_accounts_data(self, user_factory) -> None:
        user_factory(phone_number="+237699999981")
        stdout = StringIO()

        call_command(self.command_name, "--expected-feed-price", "1250.00", stdout=stdout)

        output = stdout.getvalue()
        assert "Accounts data audit passed" in output
        assert "OK non_admin_users_without_farm: 0" in output
        assert "INFO default_feed_price_per_kg=1250.00: 1" in output

    def test_command_fails_when_non_admin_user_has_no_farm(self, user_factory) -> None:
        user = user_factory(phone_number="+237699999982")
        user.farm_profile.delete()
        stdout = StringIO()

        with pytest.raises(CommandError, match="non_admin_users_without_farm"):
            call_command(self.command_name, stdout=stdout)

        assert "ERROR non_admin_users_without_farm: 1" in stdout.getvalue()

    def test_command_fails_when_gps_pair_is_incomplete(self, user_factory) -> None:
        user = user_factory(phone_number="+237699999983")
        user.farm_profile.latitude = "3.8680000"
        user.farm_profile.longitude = None
        user.farm_profile.save(validate=False)
        stdout = StringIO()

        with pytest.raises(CommandError, match="farms_bad_gps_pair"):
            call_command(self.command_name, stdout=stdout)

        assert "ERROR farms_bad_gps_pair: 1" in stdout.getvalue()

    def test_command_can_flag_unexpected_feed_price(self, user_factory) -> None:
        user = user_factory(phone_number="+237699999984")
        plan = FarmProductionPlanService.get_or_create_plan(user.farm_profile)
        plan.default_feed_price_per_kg = "500.00"
        plan.save()
        stdout = StringIO()

        with pytest.raises(CommandError, match="farms_unexpected_default_feed_price"):
            call_command(self.command_name, "--expected-feed-price", "1250.00", stdout=stdout)

        output = stdout.getvalue()
        assert "ERROR farms_unexpected_default_feed_price: 1" in output
        assert "INFO default_feed_price_per_kg=500.00: 1" in output


@pytest.mark.django_db
class TestBenchmarkAccountsPerformanceCommand:
    command_name = "benchmark_accounts_performance"

    def test_seed_only_creates_benchmark_users(self) -> None:
        stdout = StringIO()

        call_command(
            self.command_name,
            "--users",
            "3",
            "--phone-prefix",
            "+2376601",
            "--seed-only",
            "--json",
            stdout=stdout,
        )

        payload = json.loads(stdout.getvalue())
        assert payload["seeded_users"] == 3
        assert payload["created_users"] == 3
        assert User.objects.filter(email__endswith="@benchmark.aquacare.local").count() == 3

    def test_command_runs_small_profile_benchmark(self) -> None:
        stdout = StringIO()

        call_command(
            self.command_name,
            "--users",
            "3",
            "--phone-prefix",
            "+2376602",
            "--requests",
            "4",
            "--warmup",
            "0",
            "--scenario",
            "profile",
            "--concurrency",
            "1",
            "--json",
            stdout=stdout,
        )

        payload = json.loads(stdout.getvalue())
        profile = payload["operations"]["profile"]
        assert payload["scenario"] == "profile"
        assert payload["requests"] == 4
        assert profile["count"] == 4
        assert profile["success"] == 4
        assert profile["errors"] == 0

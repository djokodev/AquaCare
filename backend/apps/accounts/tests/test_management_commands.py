from __future__ import annotations

from io import StringIO

import pytest
from accounts.models import User
from django.core.management import call_command


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

from __future__ import annotations

import importlib

import pytest
from django.db.migrations.exceptions import IrreversibleError


def test_user_uuid_migration_rejects_reverse() -> None:
    migration = importlib.import_module("accounts.migrations.0008_user_id_uuid")

    with pytest.raises(IrreversibleError, match="backup restore"):
        migration.reject_user_ids_uuid_reverse(None, None)

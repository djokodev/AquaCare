from __future__ import annotations

import uuid

from django.db import migrations, models
from django.db.migrations.exceptions import IrreversibleError


USER_REFERENCE_COLUMNS = [
    {
        "table": "accounts_farm_profile",
        "column": "user_id",
        "nullable": False,
        "on_delete": "CASCADE",
        "fk_name": "accounts_farm_profile_user_id_uuid_fk",
        "index_name": "accounts_farm_profile_user_id_uuid_idx",
        "unique": [("accounts_farm_profile_user_id_uuid_uniq", ("user_id",))],
    },
    {
        "table": "accounts_user_groups",
        "column": "user_id",
        "nullable": False,
        "on_delete": "CASCADE",
        "fk_name": "accounts_user_groups_user_id_uuid_fk",
        "index_name": "accounts_user_groups_user_id_uuid_idx",
        "unique": [("accounts_user_groups_user_group_uuid_uniq", ("user_id", "group_id"))],
    },
    {
        "table": "accounts_user_user_permissions",
        "column": "user_id",
        "nullable": False,
        "on_delete": "CASCADE",
        "fk_name": "accounts_user_perms_user_id_uuid_fk",
        "index_name": "accounts_user_perms_user_id_uuid_idx",
        "unique": [("accounts_user_perms_user_perm_uuid_uniq", ("user_id", "permission_id"))],
    },
    {
        "table": "django_admin_log",
        "column": "user_id",
        "nullable": False,
        "on_delete": "CASCADE",
        "fk_name": "django_admin_log_user_id_uuid_fk",
        "index_name": "django_admin_log_user_id_uuid_idx",
        "unique": [],
    },
    {
        "table": "token_blacklist_outstandingtoken",
        "column": "user_id",
        "nullable": True,
        "on_delete": "SET NULL",
        "fk_name": "token_blacklist_outstanding_user_id_uuid_fk",
        "index_name": "token_blacklist_outstanding_user_id_uuid_idx",
        "unique": [],
    },
    {
        "table": "commerce_order",
        "column": "user_id",
        "nullable": False,
        "on_delete": "NO ACTION",
        "fk_name": "commerce_order_user_id_uuid_fk",
        "index_name": "commerce_order_user_id_uuid_idx",
        "unique": [],
    },
    {
        "table": "notifications_notification",
        "column": "user_id",
        "nullable": False,
        "on_delete": "CASCADE",
        "fk_name": "notifications_notification_user_id_uuid_fk",
        "index_name": "notifications_notification_user_id_uuid_idx",
        "unique": [],
    },
    {
        "table": "notifications_notificationpreference",
        "column": "user_id",
        "nullable": False,
        "on_delete": "CASCADE",
        "fk_name": "notifications_preference_user_id_uuid_fk",
        "index_name": "notifications_preference_user_id_uuid_idx",
        "unique": [("notifications_preference_user_id_uuid_uniq", ("user_id",))],
    },
    {
        "table": "notifications_pushtoken",
        "column": "user_id",
        "nullable": False,
        "on_delete": "CASCADE",
        "fk_name": "notifications_pushtoken_user_id_uuid_fk",
        "index_name": "notifications_pushtoken_user_id_uuid_idx",
        "unique": [("notifications_pushtoken_user_device_uuid_uniq", ("user_id", "device_id"))],
    },
    {
        "table": "chat_conversations",
        "column": "user_id",
        "nullable": False,
        "on_delete": "CASCADE",
        "fk_name": "chat_conversations_user_id_uuid_fk",
        "index_name": "chat_conversations_user_id_uuid_idx",
        "unique": [("chat_conversations_user_id_uuid_uniq", ("user_id",))],
    },
    {
        "table": "chat_messages",
        "column": "sender_user_id",
        "nullable": True,
        "on_delete": "SET NULL",
        "fk_name": "chat_messages_sender_user_id_uuid_fk",
        "index_name": "chat_messages_sender_user_id_uuid_idx",
        "unique": [],
    },
    {
        "table": "common_admin_view_state",
        "column": "user_id",
        "nullable": False,
        "on_delete": "CASCADE",
        "fk_name": "common_admin_view_state_user_id_uuid_fk",
        "index_name": "common_admin_view_state_user_id_uuid_idx",
        "unique": [("common_admin_view_state_user_section_uuid_uniq", ("user_id", "section"))],
    },
    {
        "table": "aquaculture_productionreport",
        "column": "validated_by_id",
        "nullable": True,
        "on_delete": "SET NULL",
        "fk_name": "aquaculture_report_validated_by_uuid_fk",
        "index_name": "aquaculture_report_validated_by_uuid_idx",
        "unique": [],
    },
    {
        "table": "aquaculture_reportdispatchlog",
        "column": "dispatched_by_id",
        "nullable": True,
        "on_delete": "SET NULL",
        "fk_name": "aquaculture_dispatch_dispatched_by_uuid_fk",
        "index_name": "aquaculture_dispatch_dispatched_by_uuid_idx",
        "unique": [],
    },
]


def _quote(schema_editor, name: str) -> str:
    return schema_editor.connection.ops.quote_name(name)


def _table_exists(cursor, table_name: str) -> bool:
    cursor.execute("SELECT to_regclass(%s)", [table_name])
    return cursor.fetchone()[0] is not None


def _column_exists(cursor, table_name: str, column_name: str) -> bool:
    cursor.execute(
        """
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = %s
          AND column_name = %s
        """,
        [table_name, column_name],
    )
    return cursor.fetchone() is not None


def _drop_foreign_keys_to_accounts_user(cursor, schema_editor) -> None:
    cursor.execute(
        """
        SELECT conrelid::regclass::text AS table_name, conname
        FROM pg_constraint
        WHERE contype = 'f'
          AND confrelid = 'accounts_user'::regclass
        """
    )
    for table_name, constraint_name in cursor.fetchall():
        cursor.execute(
            "ALTER TABLE {table} DROP CONSTRAINT {constraint}".format(
                table=_quote(schema_editor, table_name),
                constraint=_quote(schema_editor, constraint_name),
            )
        )


def _drop_primary_key(cursor, schema_editor, table_name: str) -> None:
    cursor.execute(
        """
        SELECT conname
        FROM pg_constraint
        WHERE contype = 'p'
          AND conrelid = %s::regclass
        """,
        [table_name],
    )
    row = cursor.fetchone()
    if row:
        cursor.execute(
            "ALTER TABLE {table} DROP CONSTRAINT {constraint}".format(
                table=_quote(schema_editor, table_name),
                constraint=_quote(schema_editor, row[0]),
            )
        )


def _add_user_foreign_key(cursor, schema_editor, reference: dict[str, object]) -> None:
    table_name = str(reference["table"])
    column_name = str(reference["column"])
    action = str(reference["on_delete"])
    sql = (
        "ALTER TABLE {table} "
        "ADD CONSTRAINT {constraint} "
        "FOREIGN KEY ({column}) REFERENCES accounts_user(id) "
    ).format(
        table=_quote(schema_editor, table_name),
        constraint=_quote(schema_editor, str(reference["fk_name"])),
        column=_quote(schema_editor, column_name),
    )
    if action == "SET NULL":
        sql += "ON DELETE SET NULL "
    elif action == "CASCADE":
        sql += "ON DELETE CASCADE "
    sql += "DEFERRABLE INITIALLY DEFERRED"
    cursor.execute(sql)


def _recreate_reference_column(cursor, schema_editor, reference: dict[str, object]) -> None:
    table_name = str(reference["table"])
    column_name = str(reference["column"])
    tmp_column_name = f"{column_name}_uuid"

    if not _table_exists(cursor, table_name) or not _column_exists(cursor, table_name, tmp_column_name):
        return

    cursor.execute(
        "ALTER TABLE {table} DROP COLUMN {column} CASCADE".format(
            table=_quote(schema_editor, table_name),
            column=_quote(schema_editor, column_name),
        )
    )
    cursor.execute(
        "ALTER TABLE {table} RENAME COLUMN {tmp_column} TO {column}".format(
            table=_quote(schema_editor, table_name),
            tmp_column=_quote(schema_editor, tmp_column_name),
            column=_quote(schema_editor, column_name),
        )
    )
    if not bool(reference["nullable"]):
        cursor.execute(
            "ALTER TABLE {table} ALTER COLUMN {column} SET NOT NULL".format(
                table=_quote(schema_editor, table_name),
                column=_quote(schema_editor, column_name),
            )
        )

    _add_user_foreign_key(cursor, schema_editor, reference)

    cursor.execute(
        "CREATE INDEX {index} ON {table} ({column})".format(
            index=_quote(schema_editor, str(reference["index_name"])),
            table=_quote(schema_editor, table_name),
            column=_quote(schema_editor, column_name),
        )
    )

    for constraint_name, columns in reference["unique"]:
        quoted_columns = ", ".join(_quote(schema_editor, str(column)) for column in columns)
        cursor.execute(
            "ALTER TABLE {table} ADD CONSTRAINT {constraint} UNIQUE ({columns})".format(
                table=_quote(schema_editor, table_name),
                constraint=_quote(schema_editor, str(constraint_name)),
                columns=quoted_columns,
            )
        )


def migrate_user_ids_to_uuid(apps, schema_editor) -> None:
    if schema_editor.connection.vendor != "postgresql":
        raise RuntimeError(
            "La migration accounts.User.id vers UUID est supportée uniquement sur PostgreSQL."
        )

    with schema_editor.connection.cursor() as cursor:
        cursor.execute("LOCK TABLE accounts_user IN ACCESS EXCLUSIVE MODE")
        for reference in USER_REFERENCE_COLUMNS:
            table_name = str(reference["table"])
            if _table_exists(cursor, table_name):
                cursor.execute(
                    "LOCK TABLE {table} IN ACCESS EXCLUSIVE MODE".format(
                        table=_quote(schema_editor, table_name)
                    )
                )

        cursor.execute("SELECT id FROM accounts_user ORDER BY id")
        user_id_map = [(row[0], str(uuid.uuid4())) for row in cursor.fetchall()]

        cursor.execute("ALTER TABLE accounts_user ADD COLUMN IF NOT EXISTS id_uuid uuid")
        for reference in USER_REFERENCE_COLUMNS:
            table_name = str(reference["table"])
            column_name = str(reference["column"])
            if _table_exists(cursor, table_name) and _column_exists(cursor, table_name, column_name):
                cursor.execute(
                    "ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} uuid".format(
                        table=_quote(schema_editor, table_name),
                        column=_quote(schema_editor, f"{column_name}_uuid"),
                    )
                )

        cursor.execute("CREATE TEMP TABLE tmp_accounts_user_uuid_map (old_id bigint PRIMARY KEY, new_id uuid NOT NULL)")
        if user_id_map:
            cursor.executemany(
                "INSERT INTO tmp_accounts_user_uuid_map (old_id, new_id) VALUES (%s, %s)",
                user_id_map,
            )
            cursor.execute(
                """
                UPDATE accounts_user AS account_user
                SET id_uuid = user_map.new_id
                FROM tmp_accounts_user_uuid_map AS user_map
                WHERE account_user.id = user_map.old_id
                """
            )

            for reference in USER_REFERENCE_COLUMNS:
                table_name = str(reference["table"])
                column_name = str(reference["column"])
                tmp_column_name = f"{column_name}_uuid"
                if _table_exists(cursor, table_name) and _column_exists(cursor, table_name, tmp_column_name):
                    cursor.execute(
                        """
                        UPDATE {table} AS ref_table
                        SET {tmp_column} = user_map.new_id
                        FROM tmp_accounts_user_uuid_map AS user_map
                        WHERE ref_table.{column} = user_map.old_id
                        """.format(
                            table=_quote(schema_editor, table_name),
                            tmp_column=_quote(schema_editor, tmp_column_name),
                            column=_quote(schema_editor, column_name),
                        )
                    )

        cursor.execute("SELECT COUNT(*) FROM accounts_user WHERE id_uuid IS NULL")
        missing_user_uuid_count = cursor.fetchone()[0]
        if missing_user_uuid_count:
            raise RuntimeError("Impossible de convertir tous les accounts_user.id en UUID.")

        for reference in USER_REFERENCE_COLUMNS:
            if bool(reference["nullable"]):
                continue
            table_name = str(reference["table"])
            column_name = str(reference["column"])
            tmp_column_name = f"{column_name}_uuid"
            if _table_exists(cursor, table_name) and _column_exists(cursor, table_name, tmp_column_name):
                cursor.execute(
                    """
                    SELECT COUNT(*)
                    FROM {table}
                    WHERE {column} IS NOT NULL
                      AND {tmp_column} IS NULL
                    """.format(
                        table=_quote(schema_editor, table_name),
                        column=_quote(schema_editor, column_name),
                        tmp_column=_quote(schema_editor, tmp_column_name),
                    )
                )
                missing_reference_count = cursor.fetchone()[0]
                if missing_reference_count:
                    raise RuntimeError(
                        f"Impossible de convertir {table_name}.{column_name} en UUID."
                    )

        _drop_foreign_keys_to_accounts_user(cursor, schema_editor)
        _drop_primary_key(cursor, schema_editor, "accounts_user")

        cursor.execute("ALTER TABLE accounts_user DROP COLUMN id CASCADE")
        cursor.execute("ALTER TABLE accounts_user RENAME COLUMN id_uuid TO id")
        cursor.execute("ALTER TABLE accounts_user ALTER COLUMN id SET NOT NULL")
        cursor.execute("ALTER TABLE accounts_user ADD CONSTRAINT accounts_user_pkey PRIMARY KEY (id)")
        cursor.execute("DROP SEQUENCE IF EXISTS accounts_user_id_seq")

        for reference in USER_REFERENCE_COLUMNS:
            _recreate_reference_column(cursor, schema_editor, reference)


def reject_user_ids_uuid_reverse(apps, schema_editor) -> None:
    raise IrreversibleError(
        "accounts.0008_user_id_uuid converts accounts_user.id and every related "
        "foreign key from bigint to UUID. Restoring the old integer identifiers "
        "requires a database backup restore, not a Django migration rollback."
    )


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0007_farm_setup_fields"),
        ("aquaculture", "0015_productionreport_soft_delete"),
        ("chat", "0001_initial"),
        ("commerce", "0006_delete_aller_aqua_products"),
        ("common", "0002_alter_adminviewstate_section"),
        ("notifications", "0002_add_chat_performance_indexes"),
        ("admin", "0003_logentry_add_action_flag_choices"),
        ("token_blacklist", "0013_alter_blacklistedtoken_options_and_more"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(
                    migrate_user_ids_to_uuid,
                    reverse_code=reject_user_ids_uuid_reverse,
                ),
            ],
            state_operations=[
                migrations.AlterField(
                    model_name="user",
                    name="id",
                    field=models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        help_text="Identifiant unique UUID pour la synchronisation mobile",
                        primary_key=True,
                        serialize=False,
                    ),
                ),
            ],
        ),
    ]

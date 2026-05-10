from __future__ import annotations

from django.db import migrations, models
from django.db.models import Q


def normalize_login_value(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(str(value).strip().split()).casefold()


def populate_normalized_login_fields(apps, schema_editor) -> None:
    User = apps.get_model("accounts", "User")
    batch = []
    for user in User.objects.all().iterator(chunk_size=1000):
        user.business_name_normalized = normalize_login_value(user.business_name)
        user.first_name_normalized = normalize_login_value(user.first_name)
        user.last_name_normalized = normalize_login_value(user.last_name)
        batch.append(user)
        if len(batch) >= 1000:
            User.objects.bulk_update(
                batch,
                [
                    "business_name_normalized",
                    "first_name_normalized",
                    "last_name_normalized",
                ],
                batch_size=1000,
            )
            batch = []

    if batch:
        User.objects.bulk_update(
            batch,
            [
                "business_name_normalized",
                "first_name_normalized",
                "last_name_normalized",
            ],
            batch_size=1000,
        )


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0008_user_id_uuid"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="business_name_normalized",
            field=models.CharField(
                blank=True,
                default="",
                editable=False,
                help_text="Valeur technique pour les recherches de connexion indexées",
                max_length=200,
                verbose_name="Nom entreprise normalisé",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="user",
            name="first_name_normalized",
            field=models.CharField(
                blank=True,
                default="",
                editable=False,
                help_text="Valeur technique pour les recherches de connexion indexées",
                max_length=150,
                verbose_name="Prénom normalisé",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="user",
            name="last_name_normalized",
            field=models.CharField(
                blank=True,
                default="",
                editable=False,
                help_text="Valeur technique pour les recherches de connexion indexées",
                max_length=150,
                verbose_name="Nom normalisé",
            ),
            preserve_default=False,
        ),
        migrations.RunPython(
            populate_normalized_login_fields,
            reverse_code=migrations.RunPython.noop,
        ),
        migrations.AddIndex(
            model_name="user",
            index=models.Index(
                fields=["account_type", "business_name_normalized"],
                name="idx_user_company_login_norm",
            ),
        ),
        migrations.AddIndex(
            model_name="user",
            index=models.Index(
                fields=["account_type", "first_name_normalized", "last_name_normalized"],
                name="idx_user_person_login_norm",
            ),
        ),
        migrations.AddIndex(
            model_name="farmprofile",
            index=models.Index(
                condition=Q(
                    latitude__isnull=False,
                    longitude__isnull=False,
                    is_deleted=False,
                ),
                fields=["certification_status", "-created_at"],
                name="idx_farm_map_cert_created",
            ),
        ),
        migrations.AddIndex(
            model_name="farmprofile",
            index=models.Index(
                condition=Q(
                    latitude__isnull=False,
                    longitude__isnull=False,
                    is_deleted=False,
                ),
                fields=["-created_at"],
                name="idx_farm_map_geo_created",
            ),
        ),
        migrations.RunSQL(
            sql=(
                "CREATE INDEX IF NOT EXISTS "
                "token_blacklist_outstanding_expires_at_idx "
                "ON token_blacklist_outstandingtoken (expires_at)"
            ),
            reverse_sql=(
                "DROP INDEX IF EXISTS "
                "token_blacklist_outstanding_expires_at_idx"
            ),
        ),
    ]

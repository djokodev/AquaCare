import hashlib
import json
from unittest.mock import patch

import pytest
from accounts.models import User
from django.core.management import CommandError, call_command
from django.test import override_settings


def test_review_sample_generator_refuses_non_debug_environment(tmp_path):
    with override_settings(DEBUG=False), pytest.raises(CommandError, match="DEBUG=False"):
        call_command(
            "generate_cycle_report_review_samples",
            output_dir=str(tmp_path),
        )


@pytest.mark.django_db
@override_settings(DEBUG=True)
def test_review_sample_manifest_hashes_exact_pdf_and_payload_bytes(tmp_path):
    with patch(
        "aquaculture.services.report_service.ReportService._render_pdf",
        return_value=b"%PDF-fake",
    ), patch(
        "aquaculture.management.commands.generate_cycle_report_review_samples.Command._render_pngs",
    ):
        call_command(
            "generate_cycle_report_review_samples",
            output_dir=str(tmp_path),
            git_sha="test-source-sha",
        )

    manifest = json.loads((tmp_path / "manifest.json").read_text())
    assert manifest["git_sha"] == "test-source-sha"
    assert manifest["data_lineage_version"] == "1.2.4"
    assert manifest["database_mode"] == "temporary/rollback"
    assert len(manifest["reports"]) == 6

    for item in manifest["reports"]:
        pdf_path = tmp_path / item["pdf_path"].split("/")[-1]
        payload_path = tmp_path / item["payload_path"].split("/")[-1]
        assert item["pdf_sha256"] == hashlib.sha256(pdf_path.read_bytes()).hexdigest()
        assert item["payload_sha256"] == hashlib.sha256(payload_path.read_bytes()).hexdigest()

    assert not User.objects.filter(email__endswith="@aquacare.local").exists()

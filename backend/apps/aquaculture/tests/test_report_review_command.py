import pytest
from django.core.management import CommandError, call_command
from django.test import override_settings


def test_review_sample_generator_refuses_non_debug_environment(tmp_path):
    with override_settings(DEBUG=False), pytest.raises(CommandError, match="DEBUG=False"):
        call_command(
            "generate_cycle_report_review_samples",
            output_dir=str(tmp_path),
        )

"""Security hardening of the aquaculture API (OWASP Top 10 review, 10/2026).

Each test pins one guarantee so that a later refactor cannot silently reopen
the hole:

* A01 — every write goes through the business services and stays inside the
  caller's farm; private files are only served after an access check;
* A03 — CSV exports cannot inject spreadsheet formulas;
* A04/A08 — ledger-backed data (allocations, cycle identity, logs) cannot be
  rewritten outside the replay, and a refused replay rolls the change back;
* A05/A10 — PDF rendering cannot fetch local files or network resources;
* resource limits on uploads and sync batches.
"""

from __future__ import annotations

import io
from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

import pytest
from aquaculture.constants import MAX_BULK_LOGS, MAX_SYNC_ITEMS_PER_KIND
from aquaculture.domain.exceptions import BusinessRuleViolation
from aquaculture.models import (
    CycleLog,
    CycleUnitAllocation,
    FeedingPlan,
    ProductionCycle,
    ProductionReport,
    ProductionUnit,
    SanitaryLog,
)
from aquaculture.serializers import (
    MarkWhatsAppSharedSerializer,
    ProductionReportDetailSerializer,
    SanitaryLogSerializer,
    SyncRequestSerializer,
)
from aquaculture.throttles import AquacultureSanitaryActionThrottle, AquacultureSyncThrottle
from aquaculture.views.log_views import CycleLogViewSet
from aquaculture.views.sanitary_views import SanitaryLogViewSet
from common.csv_safety import csv_safe
from common.pdf_security import data_uri_only_url_fetcher
from common.protected_media import RandomizedUploadPath, serve_protected_file
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.http import Http404
from django.urls import reverse
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken


def _png_upload(name: str = "IMG_0001.png") -> SimpleUploadedFile:
    buffer = io.BytesIO()
    Image.new("RGB", (4, 4), color=(10, 120, 200)).save(buffer, format="PNG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")


def _client_for(api_client_class, user):
    client = api_client_class()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


@pytest.fixture
def other_user(user_factory):
    return user_factory(phone_number="+237690777001", email="voisin@test.com")


@pytest.fixture
def foreign_cycle(other_user):
    return ProductionCycle.objects.create(
        farm_profile=other_user.farm_profile,
        cycle_name="Cycle voisin",
        species="tilapia",
        pond_identifier="Bassin voisin",
        pond_surface_m2=Decimal("100.00"),
        start_date=date(2026, 3, 14),
        initial_count=1000,
        initial_average_weight=Decimal("10.00"),
        initial_biomass=Decimal("10.00"),
        current_count=1000,
        current_average_weight=Decimal("10.00"),
        current_biomass=Decimal("10.00"),
    )


@pytest.fixture
def sanitary_log_with_photo(production_cycle):
    log = SanitaryLog.objects.create(
        cycle=production_cycle,
        event_date=timezone.localdate(),
        event_type="disease",
        symptoms="Taches blanches sur les nageoires.",
    )
    log.photo.save("IMG_0001.png", _png_upload(), save=True)
    return log


@pytest.fixture
def report_with_pdf(farm_profile):
    report = ProductionReport.objects.create(
        farm_profile=farm_profile,
        report_type="weekly",
        period_start=timezone.localdate() - timedelta(days=6),
        period_end=timezone.localdate(),
        status="draft",
    )
    report.pdf_file.save("rapport_ferme.pdf", ContentFile(b"%PDF-1.7 test"), save=True)
    return report


# ---------------------------------------------------------------------------
# A01 — Broken access control: write surface limited to business services
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_feeding_plans_cannot_be_written_directly(auth_client, foreign_cycle, production_cycle):
    """Before the fix, POST accepted any cycle id, including another farm's."""
    payload = {
        "cycle": str(foreign_cycle.id),
        "week_number": 1,
        "estimated_fish_count": 10,
        "average_weight": "10.00",
        "biomass": "0.10",
        "daily_feed_amount": "99.00",
        "feeding_rate": "5.00",
        "meals_per_day": 2,
        "feed_per_meal": "49.50",
        "recommended_feed_type": "Faux plan",
        "start_date": timezone.localdate().isoformat(),
        "end_date": (timezone.localdate() + timedelta(days=6)).isoformat(),
    }

    response = auth_client.post(reverse("aquaculture:feeding-plan-list"), payload, format="json")

    assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED
    assert not FeedingPlan.objects.filter(cycle=foreign_cycle).exists()
    assert auth_client.get(reverse("aquaculture:feeding-plan-list")).status_code == status.HTTP_200_OK


@pytest.mark.django_db
def test_sanitary_logs_cannot_be_edited_or_deleted_outside_the_resolve_flow(
    auth_client, sanitary_log_with_photo
):
    url = reverse("aquaculture:sanitary-log-detail", args=[sanitary_log_with_photo.id])

    patch_response = auth_client.patch(url, {"resolved": True}, format="json")
    put_response = auth_client.put(url, {"resolved": True}, format="json")
    delete_response = auth_client.delete(url)

    assert patch_response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED
    assert put_response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED
    assert delete_response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED
    sanitary_log_with_photo.refresh_from_db()
    assert sanitary_log_with_photo.resolved is False


@pytest.mark.django_db
def test_cycle_put_is_refused_and_patch_only_touches_planning(auth_client, production_cycle):
    url = reverse("aquaculture:production-cycle-detail", args=[production_cycle.id])

    put_response = auth_client.put(url, {"cycle_name": "Remplacé"}, format="json")
    identity_response = auth_client.patch(url, {"initial_count": 5}, format="json")
    planning_response = auth_client.patch(
        url,
        {"planned_selling_price_per_kg_fcfa": "3100.00"},
        format="json",
    )

    assert put_response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED
    assert identity_response.status_code == status.HTTP_400_BAD_REQUEST
    assert "initial_count" in identity_response.data
    assert planning_response.status_code == status.HTTP_200_OK
    production_cycle.refresh_from_db()
    assert production_cycle.initial_count == 1000
    assert production_cycle.planned_selling_price_per_kg_fcfa == Decimal("3100.00")


@pytest.mark.django_db
def test_cycle_log_with_foreign_cycle_reveals_nothing(auth_client, foreign_cycle):
    """The foreign cycle is rejected as unknown, without echoing its dates."""
    response = auth_client.post(
        reverse("aquaculture:cycle-log-list"),
        {"cycle": str(foreign_cycle.id), "log_date": "2026-01-01", "mortality_count": 0},
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "cycle" in response.data
    assert "2026-03-14" not in str(response.data)
    assert not CycleLog.objects.filter(cycle=foreign_cycle).exists()


@pytest.mark.django_db
def test_sanitary_log_with_foreign_cycle_is_rejected(auth_client, foreign_cycle):
    response = auth_client.post(
        reverse("aquaculture:sanitary-log-list"),
        {
            "cycle": str(foreign_cycle.id),
            "event_date": timezone.localdate().isoformat(),
            "event_type": "disease",
            "symptoms": "Symptômes détaillés pour le test.",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert not SanitaryLog.objects.filter(cycle=foreign_cycle).exists()


# ---------------------------------------------------------------------------
# A01 — Private files: sanitary photos and report PDFs
# ---------------------------------------------------------------------------


def test_randomized_upload_path_drops_the_client_file_name():
    upload_to = RandomizedUploadPath("sanitary_logs/%Y/%m", ("jpg", "png"))

    first = upload_to(None, "IMG_0001.PNG")
    second = upload_to(None, "IMG_0001.PNG")
    dangerous = upload_to(None, "../../evil.html")

    assert first != second
    assert "IMG_0001" not in first
    assert first.endswith(".png")
    assert dangerous.endswith(".jpg")
    assert ".." not in dangerous
    assert first.startswith(timezone.localtime().strftime("sanitary_logs/%Y/%m/"))


def test_protected_file_refuses_path_traversal():
    fake_file = mock.Mock()
    fake_file.name = "../settings.py"
    fake_file.__bool__ = lambda self: True

    with pytest.raises(Http404):
        serve_protected_file(fake_file, content_type="text/plain")


@pytest.mark.django_db
def test_sanitary_photo_is_never_exposed_through_public_media(
    auth_client, sanitary_log_with_photo
):
    assert "IMG_0001" not in sanitary_log_with_photo.photo.name

    response = auth_client.get(
        reverse("aquaculture:sanitary-log-detail", args=[sanitary_log_with_photo.id])
    )

    expected = reverse("aquaculture:sanitary-log-photo", args=[sanitary_log_with_photo.id])
    assert response.status_code == status.HTTP_200_OK
    assert response.data["photo_url"].endswith(expected)
    assert response.data["photo"] == response.data["photo_url"]
    assert "/media/" not in str(response.data)


@pytest.mark.django_db
def test_sanitary_photo_requires_ownership(
    api_client, auth_client, other_user, sanitary_log_with_photo
):
    url = reverse("aquaculture:sanitary-log-photo", args=[sanitary_log_with_photo.id])

    owner_response = auth_client.get(url)
    stranger_response = _client_for(type(api_client), other_user).get(url)
    anonymous_response = type(api_client)().get(url)

    assert owner_response.status_code == status.HTTP_200_OK
    assert owner_response["Content-Type"] == "image/png"
    assert "no-store" in owner_response["Cache-Control"]
    assert b"".join(owner_response.streaming_content).startswith(b"\x89PNG")
    assert stranger_response.status_code == status.HTTP_404_NOT_FOUND
    assert anonymous_response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_sanitary_photo_is_delegated_to_nginx_in_production(
    auth_client, settings, sanitary_log_with_photo
):
    settings.PROTECTED_MEDIA_USE_X_ACCEL = True

    response = auth_client.get(
        reverse("aquaculture:sanitary-log-photo", args=[sanitary_log_with_photo.id])
    )

    assert response.status_code == status.HTTP_200_OK
    assert response["X-Accel-Redirect"] == f"/protected-media/{sanitary_log_with_photo.photo.name}"
    assert response.content == b""
    assert "no-store" in response["Cache-Control"]


@pytest.mark.django_db
def test_report_urls_point_to_the_authenticated_download(rf, report_with_pdf):
    request = rf.get("/")
    data = ProductionReportDetailSerializer(report_with_pdf, context={"request": request}).data

    expected = reverse("aquaculture:production-report-download", args=[report_with_pdf.id])
    assert data["pdf_url"].endswith(expected)
    assert data["pdf_file"] == data["pdf_url"]
    assert "/media/" not in str(data)
    assert "rapport_ferme" not in report_with_pdf.pdf_file.name


@pytest.mark.django_db
def test_report_download_uses_nginx_and_a_readable_name(auth_client, settings, report_with_pdf):
    settings.PROTECTED_MEDIA_USE_X_ACCEL = True

    response = auth_client.get(
        reverse("aquaculture:production-report-download", args=[report_with_pdf.id])
    )

    assert response.status_code == status.HTTP_200_OK
    assert response["X-Accel-Redirect"] == f"/protected-media/{report_with_pdf.pdf_file.name}"
    assert response["Content-Type"] == "application/pdf"
    assert "attachment" in response["Content-Disposition"]
    assert "aquacare_weekly_" in response["Content-Disposition"]


@pytest.mark.django_db
def test_report_download_of_another_farm_is_not_found(api_client, other_user, report_with_pdf):
    response = _client_for(type(api_client), other_user).get(
        reverse("aquaculture:production-report-download", args=[report_with_pdf.id])
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND


# ---------------------------------------------------------------------------
# A04 / A08 — Ledger integrity: refused replays roll the change back
# ---------------------------------------------------------------------------


def _unit_log(production_cycle):
    unit = ProductionUnit.objects.create(
        farm_profile=production_cycle.farm_profile,
        name="Bac intégrité",
        unit_type="tank",
        volume_m3=Decimal("10.00"),
    )
    allocation = CycleUnitAllocation.objects.create(
        cycle=production_cycle,
        production_unit=unit,
        initial_fish_count=1000,
        current_fish_count=1000,
        initial_biomass_kg=Decimal("10.00"),
        current_biomass_kg=Decimal("10.00"),
    )
    return CycleLog.objects.create(
        cycle=production_cycle,
        cycle_unit_allocation=allocation,
        log_date=timezone.localdate() - timedelta(days=1),
        mortality_count=5,
    )


@pytest.mark.django_db(transaction=True)
def test_log_update_is_rolled_back_when_the_replay_refuses_it(auth_client, production_cycle):
    log = _unit_log(production_cycle)
    url = reverse("aquaculture:cycle-log-detail", args=[log.id])

    with mock.patch(
        "aquaculture.services.log_application_service.ProductionCycleService.recalculate_all_metrics",
        side_effect=BusinessRuleViolation("Chronologie refusée"),
    ):
        response = auth_client.patch(url, {"mortality_count": 50}, format="json")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    log.refresh_from_db()
    assert log.mortality_count == 5


@pytest.mark.django_db(transaction=True)
def test_log_delete_is_rolled_back_when_the_replay_refuses_it(auth_client, production_cycle):
    log = _unit_log(production_cycle)
    url = reverse("aquaculture:cycle-log-detail", args=[log.id])

    with mock.patch(
        "aquaculture.signals.ProductionCycleService.recalculate_all_metrics",
        side_effect=BusinessRuleViolation("Chronologie refusée"),
    ):
        response = auth_client.delete(url)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert CycleLog.objects.filter(pk=log.pk).exists()


@pytest.mark.django_db
def test_log_delete_of_another_farm_is_not_found(api_client, other_user, production_cycle):
    log = _unit_log(production_cycle)

    response = _client_for(type(api_client), other_user).delete(
        reverse("aquaculture:cycle-log-detail", args=[log.id])
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert CycleLog.objects.filter(pk=log.pk).exists()


# ---------------------------------------------------------------------------
# Resource limits (uploads, sync batches, audit metadata)
# ---------------------------------------------------------------------------


def test_sanitary_creation_and_bulk_logs_have_dedicated_throttles():
    create_view = SanitaryLogViewSet()
    create_view.action = "create"
    list_view = SanitaryLogViewSet()
    list_view.action = "list"

    assert any(isinstance(t, AquacultureSanitaryActionThrottle) for t in create_view.get_throttles())
    assert not any(isinstance(t, AquacultureSanitaryActionThrottle) for t in list_view.get_throttles())
    assert AquacultureSyncThrottle in CycleLogViewSet.bulk_create.kwargs["throttle_classes"]


def test_sync_batches_are_bounded():
    too_many_logs = SyncRequestSerializer(data={"cycle_logs": [{}] * (MAX_BULK_LOGS + 1)})
    too_many_harvests = SyncRequestSerializer(
        data={"final_harvests": [{}] * (MAX_SYNC_ITEMS_PER_KIND + 1)}
    )

    assert too_many_logs.is_valid() is False
    assert "cycle_logs" in too_many_logs.errors
    assert too_many_harvests.is_valid() is False
    assert "final_harvests" in too_many_harvests.errors


def test_whatsapp_share_metadata_is_bounded():
    serializer = MarkWhatsAppSharedSerializer(data={"metadata": {"blob": "x" * 5000}})

    assert serializer.is_valid() is False
    assert "metadata" in serializer.errors


def test_sanitary_photo_rejects_non_image_payload():
    fake = SimpleUploadedFile("note.png", b"<html>not an image</html>", content_type="image/png")
    serializer = SanitaryLogSerializer()

    with pytest.raises(Exception):  # noqa: B017 - DRF ValidationError or Pillow error
        serializer.fields["photo"].run_validation(fake)


# ---------------------------------------------------------------------------
# A03 — Injection, A10 — SSRF
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ('=HYPERLINK("http://x")', '\'=HYPERLINK("http://x")'),
        ("+33", "'+33"),
        ("-2", "'-2"),
        ("@SUM(A1)", "'@SUM(A1)"),
        ("Ferme Bonamoussadi", "Ferme Bonamoussadi"),
        (12, 12),
        (None, None),
    ],
)
def test_csv_values_cannot_become_formulas(raw, expected):
    assert csv_safe(raw) == expected


@pytest.mark.parametrize(
    "url",
    ["file:///etc/passwd", "http://169.254.169.254/latest/meta-data/", "https://example.com/x.png"],
)
def test_pdf_rendering_refuses_non_inline_resources(url):
    with pytest.raises(ValueError):
        data_uri_only_url_fetcher().fetch(url)


def test_pdf_rendering_accepts_inline_images():
    response = data_uri_only_url_fetcher().fetch("data:text/plain;base64,QQ==")
    assert response is not None

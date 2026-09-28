"""Tests du domaine de delivrabilite email (check MX avec resolver injecte)."""
import pytest
from accounts.domain.email_deliverability import (
    EmailDeliverabilityValidator,
    domain_has_mail_records,
)
from django.core.exceptions import ValidationError


@pytest.fixture
def fake_resolver():
    """Resolver de test: table domaine -> {MX|A|AAAA|NXDOMAIN|NETWORK}."""
    table: dict[str, set[str]] = {}

    def resolver(domain: str, record_type: str) -> bool:
        records = table.get(domain.lower(), {"NXDOMAIN"})
        if "NXDOMAIN" in records:
            return False
        return record_type in records

    table["resolver"] = resolver
    return table


@pytest.mark.unit
class TestDomainHasMailRecords:
    def test_domain_with_mx_is_valid(self, fake_resolver):
        fake_resolver["gmail.com"] = {"MX"}
        assert domain_has_mail_records("gmail.com", fake_resolver["resolver"]) is True

    def test_domain_without_mx_but_with_a_is_valid(self, fake_resolver):
        # Certains petits fournisseurs ne publient que A.
        fake_resolver["mail.example.cm"] = {"A"}
        assert domain_has_mail_records("mail.example.cm", fake_resolver["resolver"]) is True

    def test_unknown_domain_is_rejected(self, fake_resolver):
        fake_resolver["gamil.com"] = {"NXDOMAIN"}
        assert domain_has_mail_records("gamil.com", fake_resolver["resolver"]) is False

    def test_domain_without_mail_records_is_rejected(self, fake_resolver):
        # Domaine connu mais sans aucun record mail (MX/A/AAAA absents).
        fake_resolver["static.example.com"] = set()
        assert domain_has_mail_records("static.example.com", fake_resolver["resolver"]) is False

    def test_network_failure_fails_open(self, fake_resolver):
        def broken_resolver(domain: str, record_type: str) -> bool:
            raise TimeoutError("dns indisponible")

        assert domain_has_mail_records("gmail.com", broken_resolver) is True

    def test_domain_without_dot_is_rejected(self, fake_resolver):
        assert domain_has_mail_records("localhost", fake_resolver["resolver"]) is False
        assert domain_has_mail_records("", fake_resolver["resolver"]) is False


@pytest.mark.unit
class TestEmailDeliverabilityValidator:
    def test_valid_email_passes(self, fake_resolver, settings):
        settings.ACCOUNT_EMAIL_MX_VALIDATION = True
        fake_resolver["gmail.com"] = {"MX"}
        validator = EmailDeliverabilityValidator(fake_resolver["resolver"])
        validator("jean@gmail.com")  # ne leve pas

    def test_typo_domain_is_rejected(self, fake_resolver, settings):
        settings.ACCOUNT_EMAIL_MX_VALIDATION = True
        fake_resolver["gamil.com"] = {"NXDOMAIN"}
        validator = EmailDeliverabilityValidator(fake_resolver["resolver"])
        with pytest.raises(ValidationError):
            validator("jean@gamil.com")

    def test_blank_email_passes(self, fake_resolver, settings):
        settings.ACCOUNT_EMAIL_MX_VALIDATION = True
        validator = EmailDeliverabilityValidator(fake_resolver["resolver"])
        validator("")  # ne leve pas

    def test_setting_disabled_skips_dns(self, fake_resolver, settings):
        fake_resolver["gamil.com"] = {"NXDOMAIN"}
        settings.ACCOUNT_EMAIL_MX_VALIDATION = False
        validator = EmailDeliverabilityValidator(fake_resolver["resolver"])
        validator("jean@gamil.com")  # ne leve pas: check desactive

    def test_setting_enabled_checks_dns(self, fake_resolver, settings):
        fake_resolver["gamil.com"] = {"NXDOMAIN"}
        settings.ACCOUNT_EMAIL_MX_VALIDATION = True
        validator = EmailDeliverabilityValidator(fake_resolver["resolver"])
        with pytest.raises(ValidationError):
            validator("jean@gamil.com")

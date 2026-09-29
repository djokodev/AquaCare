"""Tests du registre informatif des operateurs mobiles camerounais."""
import pytest
from accounts.domain.phone_operators import (
    guess_cameroon_mobile_operator,
    is_cameroon_mobile_number,
)


@pytest.mark.unit
class TestIsCameroonMobileNumber:
    @pytest.mark.parametrize(
        "phone,expected",
        [
            ("+237690123456", True),
            ("+237770123456", True),
            ("+237590123456", False),  # prefixe non mobile
            ("+33612345678", False),  # numero etranger
            ("690123456", False),  # pas au format E.164
            ("", False),
            (None, False),
        ],
    )
    def test_classification(self, phone, expected):
        assert is_cameroon_mobile_number(phone) is expected


@pytest.mark.unit
class TestGuessCameroonMobileOperator:
    @pytest.mark.parametrize(
        "phone,expected",
        [
            ("+237650123456", "MTN"),
            ("+237671234567", "MTN"),
            ("+237680123456", "MTN"),
            ("+237655123456", "Orange"),
            ("+237690123456", "Orange"),
            ("+237684123456", "Orange"),
            ("+237620123456", "Camtel"),
            ("+237623123456", "Camtel"),
            ("+237663123456", "Nexttel"),
        ],
    )
    def test_known_prefixes(self, phone, expected):
        assert guess_cameroon_mobile_operator(phone) == expected

    def test_unknown_prefix_returns_none_without_rejection(self):
        # Prefixe potentiellement alloue plus tard: pas d'operateur connu,
        # mais le numero reste valide (jamais bloque).
        assert guess_cameroon_mobile_operator("+237699123456") == "Orange"
        assert guess_cameroon_mobile_operator("+237626123456") is None
        assert guess_cameroon_mobile_operator("+33612345678") is None

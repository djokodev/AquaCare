"""Protection against spreadsheet formula injection in CSV exports."""

from __future__ import annotations

FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def csv_safe(value: object) -> object:
    """Neutralize text that Excel/LibreOffice would execute as a formula.

    Farm and cycle names are typed by farmers: a value such as
    ``=HYPERLINK("http://…")`` must reach the spreadsheet as plain text.
    Numbers, dates and ``None`` are returned unchanged.
    """
    if isinstance(value, str) and value.startswith(FORMULA_PREFIXES):
        return f"'{value}"
    return value

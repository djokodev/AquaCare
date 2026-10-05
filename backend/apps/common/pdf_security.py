"""Hardening shared by every WeasyPrint rendering."""

from __future__ import annotations


def data_uri_only_url_fetcher():
    """Return a WeasyPrint fetcher that only accepts inline ``data:`` URIs.

    The PDF templates embed their logo and charts inline. Any other URL
    (``file://``, ``http://``, internal services) is refused, so a value that
    slips into the HTML can never make the server read a local file or reach
    the network while rendering (SSRF).
    """
    from weasyprint.urls import URLFetcher  # noqa: PLC0415

    return URLFetcher(allowed_protocols=("data",), allow_redirects=False)

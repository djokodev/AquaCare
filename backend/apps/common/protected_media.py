"""Serve private media files only after an authorization check.

Private uploads (sanitary photos, production reports) must never be reachable
through the public ``/media/`` location. Views check the permission first, then
hand the file over:

* in production, through nginx ``X-Accel-Redirect`` towards an ``internal``
  location, so Django never streams the bytes itself;
* elsewhere (development, tests), through a plain ``FileResponse``.
"""

from __future__ import annotations

import posixpath
import uuid
from pathlib import PurePosixPath
from urllib.parse import quote

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse
from django.utils import timezone
from django.utils.deconstruct import deconstructible

PRIVATE_CACHE_CONTROL = "private, no-store, max-age=0"


@deconstructible
class RandomizedUploadPath:
    """``upload_to`` callable replacing the client file name with a random one.

    Client names (``IMG_0001.jpg``, timestamps) are guessable; a random UUID is
    not. Only a whitelisted, lower-cased extension is kept. ``prefix`` accepts
    ``strftime`` placeholders (``reports/%Y/%m``) to keep folders small.
    """

    def __init__(self, prefix: str, allowed_extensions: tuple[str, ...]):
        self.prefix = prefix.strip("/")
        self.allowed_extensions = tuple(ext.lower() for ext in allowed_extensions)

    def __call__(self, instance, filename: str) -> str:
        extension = PurePosixPath(filename or "").suffix.lower().lstrip(".")
        if extension not in self.allowed_extensions:
            extension = self.allowed_extensions[0]
        folder = timezone.localtime().strftime(self.prefix)
        return f"{folder}/{uuid.uuid4().hex}.{extension}"

    def __eq__(self, other) -> bool:
        return (
            isinstance(other, RandomizedUploadPath)
            and self.prefix == other.prefix
            and self.allowed_extensions == other.allowed_extensions
        )


def _safe_storage_name(name: str) -> str:
    normalized = posixpath.normpath(name or "")
    if (
        not name
        or normalized.startswith(("/", ".."))
        or "/../" in f"/{normalized}/"
        or "\x00" in normalized
    ):
        raise Http404
    return normalized


def serve_protected_file(
    file_field,
    *,
    content_type: str,
    download_name: str | None = None,
    as_attachment: bool = False,
) -> HttpResponse:
    """Return the file of an already-authorized object."""
    if not file_field:
        raise Http404
    storage_name = _safe_storage_name(file_field.name)
    disposition_type = "attachment" if as_attachment else "inline"
    filename = download_name or PurePosixPath(storage_name).name
    disposition = f"{disposition_type}; filename*=UTF-8''{quote(filename)}"

    if getattr(settings, "PROTECTED_MEDIA_USE_X_ACCEL", False):
        prefix = getattr(settings, "PROTECTED_MEDIA_INTERNAL_PREFIX", "/protected-media/").rstrip("/")
        response = HttpResponse(content_type=content_type)
        response["X-Accel-Redirect"] = f"{prefix}/{quote(storage_name)}"
    else:
        try:
            handle = file_field.open("rb")
        except (FileNotFoundError, OSError) as exc:
            raise Http404 from exc
        response = FileResponse(handle, content_type=content_type)

    response["Content-Disposition"] = disposition
    response["Cache-Control"] = PRIVATE_CACHE_CONTROL
    response["X-Content-Type-Options"] = "nosniff"
    return response

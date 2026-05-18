"""Utilities for production observability.

This module keeps request correlation and structured logging lightweight: no
third-party dependency, no sensitive payload logging, and safe defaults outside
HTTP requests.
"""

from __future__ import annotations

import contextvars
import json
import logging
import time
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any, Final

from django.http import HttpRequest, HttpResponse

REQUEST_ID_HEADER: Final[str] = "HTTP_X_REQUEST_ID"
REQUEST_ID_RESPONSE_HEADER: Final[str] = "X-Request-ID"
EMPTY_LOG_VALUE: Final[str] = "-"

_request_id = contextvars.ContextVar("request_id", default=EMPTY_LOG_VALUE)
_request_method = contextvars.ContextVar("request_method", default=EMPTY_LOG_VALUE)
_request_path = contextvars.ContextVar("request_path", default=EMPTY_LOG_VALUE)
_request_user_id = contextvars.ContextVar("request_user_id", default=EMPTY_LOG_VALUE)


class RequestCorrelationMiddleware:
    """Attach a stable request ID to each response and log API request latency."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]):
        self.get_response = get_response
        self.logger = logging.getLogger("common.requests")

    def __call__(self, request: HttpRequest) -> HttpResponse:
        request_id = self._resolve_request_id(request)
        request.request_id = request_id

        request_id_token = _request_id.set(request_id)
        method_token = _request_method.set(request.method)
        path_token = _request_path.set(request.path)
        user_token = _request_user_id.set(EMPTY_LOG_VALUE)
        started_at = time.perf_counter()

        try:
            response = self.get_response(request)
            duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
            response[REQUEST_ID_RESPONSE_HEADER] = request_id

            if request.path.startswith("/api/accounts/"):
                self.logger.info(
                    "Accounts request completed",
                    extra={
                        "event": "accounts.request.completed",
                        "endpoint": request.path,
                        "status_code": response.status_code,
                        "duration_ms": duration_ms,
                    },
                )

            return response
        finally:
            _request_id.reset(request_id_token)
            _request_method.reset(method_token)
            _request_path.reset(path_token)
            _request_user_id.reset(user_token)

    @staticmethod
    def _resolve_request_id(request: HttpRequest) -> str:
        raw_request_id = request.META.get(REQUEST_ID_HEADER, "").strip()
        if raw_request_id and len(raw_request_id) <= 128:
            return raw_request_id
        return uuid.uuid4().hex


class RequestContextFilter(logging.Filter):
    """Inject request correlation fields into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = _request_id.get()
        record.request_method = _request_method.get()
        record.request_path = _request_path.get()
        record.user_id = getattr(record, "user_id", _request_user_id.get())
        return True


class JsonLogFormatter(logging.Formatter):
    """Render whitelisted log metadata as one JSON object per line."""

    EXTRA_FIELDS: Final[tuple[str, ...]] = (
        "event",
        "endpoint",
        "status_code",
        "duration_ms",
        "reason_code",
        "auth_method",
        "account_type",
        "farm_id",
        "task_id",
        "blacklisted_count",
        "outstanding_count",
        "retry_after",
        "exception_class",
        "view",
    )

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", EMPTY_LOG_VALUE),
            "method": getattr(record, "request_method", EMPTY_LOG_VALUE),
            "path": getattr(record, "request_path", EMPTY_LOG_VALUE),
            "user_id": str(getattr(record, "user_id", EMPTY_LOG_VALUE)),
        }

        for field in self.EXTRA_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value

        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)

        return json.dumps(payload, ensure_ascii=False, default=str)


def get_request_id() -> str:
    """Return the current request ID, or '-' outside an HTTP request."""

    return _request_id.get()


def observability_exception_handler(exc: Exception, context: dict[str, Any]):
    """Log API exceptions without changing DRF's response contract."""

    from rest_framework.views import exception_handler

    response = exception_handler(exc, context)
    request = context.get("request")
    path = getattr(request, "path", "") if request else ""
    if response is not None and isinstance(getattr(response, "data", None), dict):
        response.data.setdefault("status_code", response.status_code)
        if "code" not in response.data:
            default_code = getattr(exc, "default_code", None)
            if default_code:
                response.data["code"] = default_code

    if not path.startswith("/api/accounts/"):
        return response

    view = context.get("view")
    logger = logging.getLogger("accounts.api")
    extra = {
        "event": "accounts.api.exception",
        "endpoint": path,
        "status_code": getattr(response, "status_code", 500),
        "exception_class": exc.__class__.__name__,
        "view": view.__class__.__name__ if view else EMPTY_LOG_VALUE,
    }

    if response is None or getattr(response, "status_code", 500) >= 500:
        logger.exception("Accounts API exception", extra=extra)
    else:
        logger.warning("Accounts API request rejected", extra=extra)

    return response

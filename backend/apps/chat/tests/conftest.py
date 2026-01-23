# coding: utf-8
"""
Fixtures for chat module tests.
Imports shared fixtures from global conftest and adds chat-specific fixtures.
"""
import pytest
from django.db.models.signals import post_save
from unittest.mock import patch

# Import shared fixtures from the global test configuration without
# re-registering the plugin (avoids duplicate plugin errors with xdist).
from tests.conftest import (  # noqa: F401
    api_client,
    user_factory,
    authenticated_user,
    auth_client,
    mavecam_admin,
)


@pytest.fixture(autouse=True)
def disable_chat_signals(request):
    """
    Disable chat signals during tests to prevent side effects.

    Signals create acknowledgment messages and notifications which can
    interfere with test assertions and cause test order dependencies.

    Skips disabling for TestSignalIntegration tests which need signals.
    """
    # Check if this is a SignalIntegration test
    if hasattr(request, 'cls') and request.cls and 'SignalIntegration' in request.cls.__name__:
        # Don't disable signals for signal integration tests
        yield
        return

    # Disconnect the signal for other tests
    from chat.models import Message
    from chat.signals import handle_new_message

    post_save.disconnect(handle_new_message, sender=Message)

    yield

    # Reconnect after test
    post_save.connect(handle_new_message, sender=Message)

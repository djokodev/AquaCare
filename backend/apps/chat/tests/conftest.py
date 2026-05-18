"""
Fixtures for chat module tests.
Imports shared fixtures from global conftest and adds chat-specific fixtures.
"""
import pytest
from django.core.cache import cache
from django.db.models.signals import post_save

# Import shared fixtures from the global test configuration without
# re-registering the plugin (avoids duplicate plugin errors with xdist).
from tests.conftest import (  # noqa: F401
    api_client,
    auth_client,
    authenticated_user,
    aquacare_admin,
    user_factory,
)


@pytest.fixture(autouse=True)
def clear_rate_limit_cache():
    """
    Ensure DRF throttling cache state does not leak across tests.
    """
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def celery_always_eager(settings):
    """
    Force Celery tasks to execute synchronously during tests.

    The Docker environment sets DJANGO_SETTINGS_MODULE=development, which does
    not include CELERY_TASK_ALWAYS_EAGER=True. This fixture ensures tasks that
    are called via .delay() run in-process so signal-triggered notifications
    (e.g. test_admin_message_creates_notification) are created immediately.
    """
    settings.CELERY_TASK_ALWAYS_EAGER = True
    settings.CELERY_TASK_EAGER_PROPAGATES = True


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

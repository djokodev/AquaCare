import os


def _resolve_settings_module() -> str:
    return os.getenv('DJANGO_SETTINGS_MODULE', 'aquacare_api.settings.development')

env = _resolve_settings_module()

if env.endswith('.test'):
    from .test import *  # noqa: F403
elif env.endswith('.staging'):
    from .staging import *  # noqa: F403
elif env.endswith('.production'):
    from .production import *  # noqa: F403
else:
    from .development import *  # noqa: F403

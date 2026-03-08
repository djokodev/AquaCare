import os


def _resolve_settings_module() -> str:
    return os.getenv('DJANGO_SETTINGS_MODULE', 'mavecam_api.settings.development')

env = _resolve_settings_module()

if env.endswith('.test'):
    from .test import *
elif env.endswith('.staging'):
    from .staging import *
elif env.endswith('.production'):
    from .production import *
else:
    from .development import *

"""
Garde-fou : les couleurs de l'admin ont UNE source de vérité, les tokens
--aq-* de admin_custom.css (clair et sombre). Un template admin ne doit pas
contenir de couleur en dur, sinon il devient illisible dans l'un des thèmes.
"""
import re
from pathlib import Path

from django.conf import settings

BASE_DIR = Path(settings.BASE_DIR)
HEX_COLOR = re.compile(r'#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b')
ADMIN_CSS = BASE_DIR / 'apps' / 'common' / 'static' / 'css' / 'admin_custom.css'

# Écrans antérieurs à cette règle, à migrer vers les tokens lors de leur
# prochaine modification. Ne pas allonger cette liste.
LEGACY_ALLOWLIST = {
    'apps/accounts/templates/admin/accounts/farm_map.html',
    'apps/chat/templates/chat/support_inbox.html',
}


def _admin_templates():
    roots = [BASE_DIR / 'templates' / 'admin', *BASE_DIR.glob('apps/*/templates/admin')]
    files = [path for root in roots for path in root.rglob('*.html')]
    files.append(BASE_DIR / 'apps' / 'chat' / 'templates' / 'chat' / 'support_inbox.html')
    return files


def test_admin_templates_use_tokens_instead_of_hardcoded_colors():
    offenders = []
    for path in _admin_templates():
        relative = path.relative_to(BASE_DIR).as_posix()
        if relative in LEGACY_ALLOWLIST:
            continue
        if HEX_COLOR.search(path.read_text(encoding='utf-8')):
            offenders.append(relative)
    assert offenders == [], f'Couleurs en dur : utilisez les tokens --aq-* ({offenders})'


def test_every_semantic_token_has_a_dark_theme_value():
    css = ADMIN_CSS.read_text(encoding='utf-8')
    light_block = css.split('--aq-card-bg', 1)[1].split('}', 1)[0]
    dark_block = css.split('@media (prefers-color-scheme: dark)', 1)[1].split('}\n}', 1)[0]
    light_tokens = set(re.findall(r'(--aq-[a-z-]+):', '--aq-card-bg:' + light_block))
    dark_tokens = set(re.findall(r'(--aq-[a-z-]+):', dark_block))
    # Couleurs identiques dans les deux thèmes (fonds forts avec texte blanc).
    same_in_both = {'--aq-danger', '--aq-on-strong', '--aq-brand-strong'}
    assert light_tokens - same_in_both <= dark_tokens

"""Tests unitaires du détecteur de phases (granulométrie par espèce)."""

from __future__ import annotations

from decimal import Decimal

from apps.commerce.domain.growth_calculator import (
    NutritionalGuideResolver,
    PhaseDetector,
)


class TestPhaseDetectorFallback:
    """Le fallback respecte la dernière granulométrie de l'espèce."""

    def test_tilapia_hors_plage_renvoie_5mm(self):
        phase = PhaseDetector.detect_phase('tilapia', 10000)
        assert phase['pellet_size_mm'] == 5.0
        assert phase['phase'] == 'grossissement'
        assert phase['product_pattern'] == 'TILAPIA 5MM'

    def test_catfish_hors_plage_renvoie_6mm(self):
        phase = PhaseDetector.detect_phase('catfish', 10000)
        assert phase['pellet_size_mm'] == 6.0
        assert phase['phase'] == 'grossissement'
        assert phase['product_pattern'] == 'CATFISH 6MM'

    def test_clarias_est_normalise_vers_catfish(self):
        """Le nom métier clarias utilise les règles catalogue du silure."""
        phase = PhaseDetector.detect_phase('clarias', 100)
        assert phase['phase'] == 'grossissement'
        assert phase['pellet_size_mm'] == 4.0
        assert phase['product_pattern'] == 'CATFISH 4MM'

    def test_espece_inconnue_est_explicite(self):
        phase = PhaseDetector.detect_phase('perche', 200)
        assert phase['phase'] == 'unknown'
        assert phase['pellet_size_mm'] == 0.0
        assert 'PERCHE' in phase['product_pattern']


class TestPhaseDetectorBornes:
    """Bornes explicites par intervalle."""

    def test_tilapia_pre_grossissement(self):
        phase = PhaseDetector.detect_phase('tilapia', 50)
        assert phase['pellet_size_mm'] == 2.0
        assert phase['phase'] == 'pre_grossissement'

    def test_tilapia_grossissement_inferieur(self):
        # 100 g est la frontière ; 100 doit tomber dans 100-500 (intervalle suivant).
        phase = PhaseDetector.detect_phase('tilapia', 100)
        assert phase['pellet_size_mm'] == 3.5
        assert phase['phase'] == 'grossissement'

    def test_tilapia_grossissement_superieur(self):
        phase = PhaseDetector.detect_phase('tilapia', 500)
        assert phase['pellet_size_mm'] == 5.0
        assert phase['phase'] == 'grossissement'

    def test_catfish_pre_grossissement(self):
        phase = PhaseDetector.detect_phase('catfish', 50)
        assert phase['pellet_size_mm'] == 2.0
        assert phase['phase'] == 'pre_grossissement'

    def test_catfish_grossissement_inferieur(self):
        phase = PhaseDetector.detect_phase('catfish', 100)
        assert phase['pellet_size_mm'] == 4.0
        assert phase['phase'] == 'grossissement'

    def test_catfish_grossissement_superieur(self):
        phase = PhaseDetector.detect_phase('catfish', 500)
        assert phase['pellet_size_mm'] == 6.0
        assert phase['phase'] == 'grossissement'


def test_persistent_guide_boundaries_are_half_open():
    rules = [
        {
            'id': guide_id,
            'min_weight': Decimal(minimum),
            'max_weight': Decimal(maximum),
            'growth_stage': stage,
            'feed_size_mm': Decimal(pellet),
            'source': source,
        }
        for guide_id, minimum, maximum, stage, pellet, source in (
            ('starter', '0', '10', 'alevin', '2', 'AquaCare'),
            ('dibaq-10', '10', '50', 'alevin', '2', 'DIBAQ'),
            ('dibaq-50', '50', '100', 'juvenile', '2', 'DIBAQ'),
            ('dibaq-100', '100', '250', 'croissance', '4', 'DIBAQ'),
            ('dibaq-250', '250', '500', 'finition', '4', 'DIBAQ'),
            ('dibaq-500', '500', '2000', 'pre_recolte', '6', 'DIBAQ'),
        )
    ]
    expected = {
        '9.99': ('starter', Decimal('2')),
        '10.00': ('dibaq-10', Decimal('2')),
        '49.99': ('dibaq-10', Decimal('2')),
        '50.00': ('dibaq-50', Decimal('2')),
        '99.99': ('dibaq-50', Decimal('2')),
        '100.00': ('dibaq-100', Decimal('4')),
        '249.99': ('dibaq-100', Decimal('4')),
        '250.00': ('dibaq-250', Decimal('4')),
        '499.99': ('dibaq-250', Decimal('4')),
        '500.00': ('dibaq-500', Decimal('6')),
    }
    for weight, (guide_id, pellet) in expected.items():
        selected, warning = NutritionalGuideResolver.resolve(rules, Decimal(weight))
        assert selected is not None
        assert selected['id'] == guide_id
        assert selected['feed_size_mm'] == pellet
        assert warning is None

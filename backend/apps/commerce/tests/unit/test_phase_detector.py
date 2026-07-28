"""Tests unitaires du détecteur de phases (granulométrie par espèce)."""

from __future__ import annotations

from apps.commerce.domain.growth_calculator import PhaseDetector


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

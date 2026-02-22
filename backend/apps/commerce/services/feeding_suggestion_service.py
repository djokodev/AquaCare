"""
Service intelligent AMÉLIORÉ pour suggestions de commande d'aliments.

VERSION 2.0 avec :
- Détection automatique phase actuelle (via poids moyen)
- Multi-granulométrie (suggère plusieurs tailles si croissance)
- Prévention mortalité (aliments adaptés au stade de croissance)

Analyse la consommation historique + prévoit les changements de phase futurs.
"""
from datetime import timedelta
from decimal import Decimal
from typing import Dict, List, Optional
from django.db.models import Avg, Sum
from django.utils import timezone

from aquaculture.models import ProductionCycle, CycleLog
from commerce.models import Product
from ..domain.growth_calculator import (
    GrowthCalculator,
    PhaseDetector
)
from ..constants import (
    TARGET_WEIGHT_TILAPIA_DEFAULT,
    TARGET_WEIGHT_CATFISH_DEFAULT
)


class FeedingSuggestionService:
    """
    Service V2 pour suggestions intelligentes avec multi-granulométrie.

    CRITIQUES DE SÉCURITÉ :
    - Détecte automatiquement le poids moyen actuel des poissons
    - Suggère UNIQUEMENT les aliments adaptés à la phase actuelle
    - Anticipe les changements de granulométrie futurs
    - ÉVITE la mortalité par aliments inadaptés
    """

    # Constantes
    SAFETY_BUFFER_DAYS = 7
    MIN_DAYS_FOR_SUGGESTION = 7
    MAX_ANALYSIS_DAYS = 30

    @staticmethod
    def get_feeding_suggestions(
        user_id: int,
        farm_profile_id: Optional[int] = None
    ) -> Dict:
        """
        Génère suggestions ADAPTÉES avec détection phase actuelle.

        Args:
            user_id: ID utilisateur
            farm_profile_id: ID profil ferme (optionnel)

        Returns:
            Dict avec suggestions multi-granulométrie
        """
        # Récupérer cycles actifs
        cycles_query = ProductionCycle.objects.filter(
            farm_profile__user__id=user_id,
            status='active'
        )

        if farm_profile_id:
            cycles_query = cycles_query.filter(farm_profile__id=farm_profile_id)

        active_cycles = cycles_query.select_related('farm_profile')

        if not active_cycles.exists():
            return {
                'has_suggestions': False,
                'suggestion_type': 'no_active_cycles',
                'message': 'Aucun cycle actif. Utilisez la simulation pour planifier votre prochain cycle.',
                'suggestions': [],
                'analysis': {}
            }

        # Analyser chaque cycle avec détection de phase
        suggestions_by_cycle = []
        total_cycles_analyzed = 0
        cycles_with_data = 0

        for cycle in active_cycles:
            cycle_analysis = FeedingSuggestionService._analyze_cycle_with_phases(cycle)

            if cycle_analysis['has_data']:
                suggestions_by_cycle.append(cycle_analysis)
                cycles_with_data += 1

            total_cycles_analyzed += 1

        # Calculer confiance
        confidence_score = FeedingSuggestionService._calculate_confidence(
            total_cycles_analyzed,
            cycles_with_data
        )

        return {
            'has_suggestions': len(suggestions_by_cycle) > 0,
            'suggestion_type': 'adaptive',
            'suggestions': suggestions_by_cycle,
            'analysis': {
                'total_cycles': total_cycles_analyzed,
                'cycles_with_data': cycles_with_data,
                'confidence_score': confidence_score,
                'analysis_period_days': FeedingSuggestionService.MAX_ANALYSIS_DAYS,
                'safety_buffer_days': FeedingSuggestionService.SAFETY_BUFFER_DAYS
            },
            'generated_at': timezone.now().isoformat()
        }

    @staticmethod
    def _analyze_cycle_with_phases(cycle: ProductionCycle) -> Dict:
        """
        Analyse un cycle avec détection automatique de phase actuelle.

        NOUVEAU : Calcule le poids moyen actuel pour suggérer les bons granulés.

        Args:
            cycle: Cycle de production

        Returns:
            Dict avec suggestions multi-phases
        """
        # 1. Récupérer historique consommation
        end_date = timezone.now()
        start_date = end_date - timedelta(days=FeedingSuggestionService.MAX_ANALYSIS_DAYS)

        logs = CycleLog.objects.filter(
            cycle=cycle,
            log_date__gte=start_date.date(),
            log_date__lte=end_date.date(),
            feed_quantity__isnull=False,
            feed_quantity__gt=0
        ).order_by('log_date')

        logs_count = logs.count()

        if logs_count < FeedingSuggestionService.MIN_DAYS_FOR_SUGGESTION:
            return {
                'has_data': False,
                'reason': f'Historique insuffisant ({logs_count} jours, minimum 7)'
            }

        # 2. NOUVEAU : Calculer poids moyen actuel des poissons
        current_avg_weight = FeedingSuggestionService._calculate_current_average_weight(cycle, logs)

        if current_avg_weight is None:
            # Fallback : estimer selon durée cycle
            days_since_start = (timezone.now().date() - cycle.start_date).days
            target_weight = TARGET_WEIGHT_TILAPIA_DEFAULT if cycle.species == 'tilapia' else TARGET_WEIGHT_CATFISH_DEFAULT
            current_avg_weight = GrowthCalculator.calculate_weight_at_day(
                5,  # Poids initial standard
                target_weight,
                120 if cycle.species == 'tilapia' else 150,
                days_since_start
            )

        # 3. NOUVEAU : Détecter phase actuelle
        current_phase = PhaseDetector.detect_phase(cycle.species, current_avg_weight)

        # 4. Calculer consommation moyenne
        consumption_stats = logs.aggregate(
            avg_daily=Avg('feed_quantity'),
            total=Sum('feed_quantity')
        )
        avg_daily_consumption = consumption_stats['avg_daily'] or Decimal('0')

        # 5. Calculer jours restants
        if cycle.planned_harvest_date:
            days_remaining = (cycle.planned_harvest_date - timezone.now().date()).days
            days_remaining = max(0, days_remaining)
        else:
            days_since_start = (timezone.now().date() - cycle.start_date).days
            days_remaining = max(0, 120 - days_since_start)

        days_with_buffer = days_remaining + FeedingSuggestionService.SAFETY_BUFFER_DAYS

        # 6. NOUVEAU : Prévoir changements de phase futurs
        target_weight = cycle.target_harvest_weight or (
            TARGET_WEIGHT_TILAPIA_DEFAULT if cycle.species == 'tilapia' else TARGET_WEIGHT_CATFISH_DEFAULT
        )

        future_phases = FeedingSuggestionService._predict_future_phases(
            cycle.species,
            current_avg_weight,
            target_weight,
            days_remaining
        )

        # 7. Suggérer produits pour chaque phase future
        phase_suggestions = []
        total_needed_kg = Decimal('0')

        for phase_info in future_phases:
            phase_need_kg = avg_daily_consumption * Decimal(str(phase_info['days_in_phase']))

            # Trouver produits adaptés à cette phase
            products = Product.objects.filter(
                species=cycle.species,
                pellet_size_mm=Decimal(str(phase_info['pellet_size_mm'])),
                is_available=True
            ).order_by('-package_weight_kg')

            if not products.exists():
                # Fallback : taille proche
                pellet_size = phase_info['pellet_size_mm']
                products = Product.objects.filter(
                    species=cycle.species,
                    pellet_size_mm__gte=Decimal(str(pellet_size - 0.5)),
                    pellet_size_mm__lte=Decimal(str(pellet_size + 0.5)),
                    is_available=True
                ).order_by('-package_weight_kg')

            # Convertir en sacs
            suggested_products = FeedingSuggestionService._convert_kg_to_bags(
                phase_need_kg,
                products
            )

            if suggested_products:
                phase_suggestions.append({
                    'phase_name': phase_info['phase_name'],
                    'pellet_size_mm': phase_info['pellet_size_mm'],
                    'weight_range_g': phase_info['weight_range_g'],
                    'days_coverage': phase_info['days_in_phase'],
                    'estimated_need_kg': float(phase_need_kg),
                    'products': suggested_products,
                    'total_price': sum(p['total_price'] for p in suggested_products)
                })
                total_needed_kg += phase_need_kg

        # 8. Calculer totaux
        total_bags = sum(
            sum(p['quantity_bags'] for p in phase['products'])
            for phase in phase_suggestions
        )
        total_price = sum(phase['total_price'] for phase in phase_suggestions)

        return {
            'has_data': True,
            'cycle_id': str(cycle.id),
            'cycle_name': cycle.cycle_name,
            'species': cycle.species,
            'current_phase': current_phase['phase'],
            'current_avg_weight_g': round(current_avg_weight, 1),
            'days_remaining': days_remaining,
            'avg_daily_consumption_kg': float(avg_daily_consumption),
            'phases': phase_suggestions,
            'summary': {
                'total_needed_kg': float(total_needed_kg),
                'total_bags': total_bags,
                'total_price': total_price,
                'coverage_days': days_with_buffer
            }
        }

    @staticmethod
    def _calculate_current_average_weight(cycle: ProductionCycle, logs: any) -> Optional[float]:
        """
        Calcule le poids moyen actuel des poissons depuis les logs.

        MÉTHODE : Utilise le dernier log avec avg_weight OU calcule depuis croissance notée.

        Args:
            cycle: Cycle de production
            logs: QuerySet des logs

        Returns:
            float: Poids moyen en grammes OU None si impossible
        """
        # Méthode 1 : Dernier log avec avg_weight renseigné
        last_log_with_weight = logs.filter(average_weight__isnull=False).order_by('-log_date').first()
        if last_log_with_weight and last_log_with_weight.average_weight:
            return float(last_log_with_weight.average_weight)

        # Méthode 2 : Calculer depuis échantillonnages
        recent_samples = logs.filter(
            sample_total_weight__isnull=False,
            sample_count__isnull=False,
            sample_count__gt=0
        ).order_by('-log_date')[:5]  # 5 derniers échantillonnages

        if recent_samples.exists():
            avg_from_samples = recent_samples.aggregate(
                avg=Avg('average_weight')
            )['avg']
            if avg_from_samples:
                return float(avg_from_samples)

        # Méthode 3 : Impossible de calculer
        return None

    @staticmethod
    def _predict_future_phases(
        species: str,
        current_weight_g: float,
        target_weight_g: float,
        days_remaining: int
    ) -> List[Dict]:
        """
        Prévoit les phases de croissance futures avec changements de granulés.

        Args:
            species: Espèce
            current_weight_g: Poids actuel
            target_weight_g: Poids cible
            days_remaining: Jours restants

        Returns:
            list[dict]: Phases futures avec granulométries
        """
        if days_remaining <= 0:
            return []

        # Simuler progression future
        future_progression = GrowthCalculator.calculate_weight_progression(
            current_weight_g,
            target_weight_g,
            days_remaining
        )

        # Regrouper par phases
        future_phases_grouped = PhaseDetector.group_by_phases(species, future_progression)

        # Formater pour sortie
        result = []
        for phase in future_phases_grouped:
            days_start, days_end = phase['days_range']
            result.append({
                'phase_name': phase['phase_name'],
                'pellet_size_mm': phase['pellet_size_mm'],
                'weight_range_g': phase['weight_range_g'],
                'days_in_phase': days_end - days_start + 1
            })

        return result

    @staticmethod
    def _convert_kg_to_bags(total_kg: Decimal, products: any) -> List[Dict]:
        """Convertit kg en sacs (20kg + 1kg)."""
        suggested_products = []
        remaining_kg = total_kg

        # Sacs de 20kg
        product_20kg = products.filter(package_weight_kg=20).first()
        if product_20kg and remaining_kg >= Decimal('20'):
            bags_20kg = int(remaining_kg / Decimal('20'))
            suggested_products.append({
                'product_id': str(product_20kg.id),
                'product_name': product_20kg.name,
                'package_weight_kg': float(product_20kg.package_weight_kg),
                'quantity_bags': bags_20kg,
                'total_kg': float(bags_20kg * 20),
                'unit_price': float(product_20kg.price_per_package),
                'total_price': float(bags_20kg * product_20kg.price_per_package),
                'brand': product_20kg.brand
            })
            remaining_kg -= Decimal(str(bags_20kg * 20))

        # Sacs de 1kg
        product_1kg = products.filter(package_weight_kg=1).first()
        if product_1kg and remaining_kg > 0:
            bags_1kg = int(remaining_kg) + 1
            suggested_products.append({
                'product_id': str(product_1kg.id),
                'product_name': product_1kg.name,
                'package_weight_kg': float(product_1kg.package_weight_kg),
                'quantity_bags': bags_1kg,
                'total_kg': float(bags_1kg),
                'unit_price': float(product_1kg.price_per_package),
                'total_price': float(bags_1kg * product_1kg.price_per_package),
                'brand': product_1kg.brand
            })

        # Fallback
        if not suggested_products and products.exists():
            product_any = products.first()
            bags = int(total_kg / product_any.package_weight_kg) + 1
            suggested_products.append({
                'product_id': str(product_any.id),
                'product_name': product_any.name,
                'package_weight_kg': float(product_any.package_weight_kg),
                'quantity_bags': bags,
                'total_kg': float(bags * product_any.package_weight_kg),
                'unit_price': float(product_any.price_per_package),
                'total_price': float(bags * product_any.price_per_package),
                'brand': product_any.brand
            })

        return suggested_products

    @staticmethod
    def _calculate_confidence(total_cycles: int, cycles_with_data: int) -> int:
        """Calcule score de confiance (0-100)."""
        if total_cycles == 0:
            return 0

        data_ratio = (cycles_with_data / total_cycles) * 100

        if cycles_with_data >= 3:
            data_ratio = min(100, data_ratio + 10)
        elif cycles_with_data >= 2:
            data_ratio = min(100, data_ratio + 5)

        return int(data_ratio)

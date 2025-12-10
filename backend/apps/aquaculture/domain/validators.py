from decimal import Decimal
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _
from datetime import date, timedelta

from ..constants import OPTIMAL_PARAMETERS


def validate_cycle_duration(start_date: date, end_date: date, species: str):
    """
    Valide que la durée du cycle est dans les plages acceptables pour l'espèce.
    
    Args:
        start_date: Date de début du cycle
        end_date: Date de fin du cycle
        species: Espèce de poisson
        
    Raises:
        ValidationError: Si la durée est hors plage acceptable
    """
    if end_date <= start_date:
        raise ValidationError(_("La date de fin doit être après la date de début"))
    
    duration_days = (end_date - start_date).days
    
    if species == 'clarias':
        min_days, max_days = 60, 150  # 60-150 days for Clarias
    elif species == 'tilapia':
        min_days, max_days = 120, 210  # 120-210 days for Tilapia
    else:
        min_days, max_days = 60, 210  # Generic range
    
    if duration_days < min_days:
        raise ValidationError(
            _("Durée de cycle trop courte pour %(species)s: %(days)d jours (minimum: %(min)d)") % {
                'species': species,
                'days': duration_days,
                'min': min_days
            }
        )
    
    if duration_days > max_days:
        raise ValidationError(
            _("Durée de cycle trop longue pour %(species)s: %(days)d jours (maximum: %(max)d)") % {
                'species': species,
                'days': duration_days,
                'max': max_days
            }
        )


def validate_stocking_density(
    initial_count: int,
    pond_surface_m2: Decimal = None,
    pond_volume_m3: Decimal = None,
    species: str = 'clarias'
):
    """
    Valide que la densité de mise en charge initiale est dans les plages sécurisées.

    Args:
        initial_count: Nombre de poissons
        pond_surface_m2: Surface du bassin (optionnel)
        pond_volume_m3: Volume du bassin (optionnel)
        species: Espèce de poisson

    Raises:
        ValidationError: Si la densité est trop élevée

    Note:
        Au moins pond_surface_m2 OU pond_volume_m3 doit être fourni
    """
    # Surface density check (fish per m²) - only if surface is provided
    if pond_surface_m2:
        surface_density = initial_count / float(pond_surface_m2)

        # Recommended: 20-50 fish/m² for initial stocking
        if surface_density > 50:
            raise ValidationError(
                _("Densité de mise en charge trop élevée: %(density).1f poissons/m² (maximum recommandé: 50)") % {
                    'density': surface_density
                }
            )

        if surface_density < 5:
            raise ValidationError(
                _("Densité de mise en charge trop faible: %(density).1f poissons/m² (minimum recommandé: 5)") % {
                    'density': surface_density
                }
            )


def validate_water_parameters(
    temperature: Decimal = None,
    ph: Decimal = None,
    oxygen: Decimal = None,
    ammonia: Decimal = None,
    species: str = 'clarias'
):
    """
    Valide les paramètres de qualité d'eau contre les exigences de l'espèce.
    
    Args:
        temperature: Température de l'eau en °C
        ph: Niveau de pH
        oxygen: Oxygène dissous en mg/L
        ammonia: Niveau d'ammoniac en ppm
        species: Espèce de poisson
        
    Raises:
        ValidationError: Si les paramètres sont hors plages sécurisées
    """
    params = OPTIMAL_PARAMETERS.get(species, OPTIMAL_PARAMETERS['clarias'])
    errors = []
    
    if temperature is not None:
        if temperature < params['temperature_min']:
            errors.append(
                _("Température trop basse: %(temp)s°C (minimum: %(min)s°C)") % {
                    'temp': temperature,
                    'min': params['temperature_min']
                }
            )
        elif temperature > params['temperature_max']:
            errors.append(
                _("Température trop élevée: %(temp)s°C (maximum: %(max)s°C)") % {
                    'temp': temperature,
                    'max': params['temperature_max']
                }
            )
    
    if ph is not None:
        if ph < params['ph_min']:
            errors.append(
                _("pH trop bas: %(ph)s (minimum: %(min)s)") % {
                    'ph': ph,
                    'min': params['ph_min']
                }
            )
        elif ph > params['ph_max']:
            errors.append(
                _("pH trop élevé: %(ph)s (maximum: %(max)s)") % {
                    'ph': ph,
                    'max': params['ph_max']
                }
            )
    
    if oxygen is not None:
        if oxygen < params['oxygen_min']:
            errors.append(
                _("Oxygène dissous insuffisant: %(oxygen)s mg/L (minimum: %(min)s mg/L)") % {
                    'oxygen': oxygen,
                    'min': params['oxygen_min']
                }
            )
    
    if ammonia is not None:
        if ammonia > Decimal('0.5'): 
            errors.append(
                _("Niveau d'ammoniac trop élevé: %(ammonia)s ppm (maximum: 0.5 ppm)") % {
                    'ammonia': ammonia
                }
            )
    
    if errors:
        raise ValidationError(errors)


def validate_feeding_data(
    feed_quantity: Decimal,
    biomass: Decimal,
    fish_count: int
):
    """
    Valide les données d'alimentation pour la vraisemblance.
    
    Args:
        feed_quantity: Quantité d'aliment en kg
        biomass: Biomasse actuelle en kg
        fish_count: Effectif actuel de poissons
        
    Raises:
        ValidationError: Si les données d'alimentation ne sont pas raisonnables
    """
    if feed_quantity <= 0:
        return  # Optional field
    
    # Calculate feeding rate as percentage of biomass
    if biomass > 0:
        feeding_rate = (feed_quantity / biomass) * 100
        
        # Feeding rate should typically be 1-10% of biomass per day
        if feeding_rate > 15:
            raise ValidationError(
                _("Quantité d'aliment excessive: %(rate).1f%% de la biomasse (maximum recommandé: 15%%)") % {
                    'rate': feeding_rate
                }
            )
        
        if feeding_rate > 10:
            # Warning level
            pass  # Could add warning logic here
    
    # Per-fish feeding check
    if fish_count > 0:
        feed_per_fish_g = (feed_quantity * 1000) / fish_count
        
        # Very rough check: shouldn't exceed 50g per fish per day for large fish
        if feed_per_fish_g > 50:
            raise ValidationError(
                _("Quantité par poisson excessive: %(amount).1f g/poisson/jour") % {
                    'amount': feed_per_fish_g
                }
            )


def validate_sampling_data(
    sample_count: int,
    sample_total_weight: Decimal,
    calculated_average: Decimal = None
):
    """
    Valide les données d'échantillonnage de poissons pour la précision.
    
    Args:
        sample_count: Nombre de poissons échantillonnés
        sample_total_weight: Poids total de l'échantillon
        calculated_average: Moyenne pré-calculée (optionnel)
        
    Raises:
        ValidationError: Si les données d'échantillonnage sont incohérentes
    """
    if sample_count < 5:
        raise ValidationError(
            _("Échantillon trop petit: %(count)d poissons (minimum recommandé: 20)") % {
                'count': sample_count
            }
        )
    
    if sample_total_weight <= 0:
        raise ValidationError(_("Le poids total de l'échantillon doit être positif"))
    
    # Calculate average weight
    average_weight = sample_total_weight / sample_count
    
    # Basic reasonableness checks
    if average_weight < Decimal('0.5'):
        raise ValidationError(
            _("Poids moyen trop faible: %(weight).1f g (minimum: 0.5g)") % {
                'weight': average_weight
            }
        )
    
    if average_weight > Decimal('2000'):
        raise ValidationError(
            _("Poids moyen trop élevé: %(weight).1f g (maximum: 2000g)") % {
                'weight': average_weight
            }
        )
    
    # If pre-calculated average provided, check consistency
    if calculated_average is not None:
        tolerance = abs(calculated_average - average_weight) / average_weight
        if tolerance > Decimal('0.1'):  # 10% tolerance
            raise ValidationError(
                _("Incohérence dans les données d'échantillonnage (écart > 10%%)")
            )


def validate_mortality_data(
    mortality_count: int,
    current_fish_count: int,
    initial_fish_count: int = None
):
    """
    Valide les données de mortalité pour la vraisemblance.
    
    Args:
        mortality_count: Nombre de poissons morts
        current_fish_count: Effectif actuel avant mortalité
        initial_fish_count: Effectif initial (optionnel)
        
    Raises:
        ValidationError: Si les données de mortalité ne sont pas raisonnables
    """
    if mortality_count < 0:
        raise ValidationError(_("Le nombre de morts ne peut être négatif"))
    
    if mortality_count > current_fish_count:
        raise ValidationError(
            _("Nombre de morts (%(dead)d) supérieur à l'effectif actuel (%(current)d)") % {
                'dead': mortality_count,
                'current': current_fish_count
            }
        )
    
    # Check for excessive daily mortality (>5% is concerning)
    if current_fish_count > 0:
        daily_mortality_rate = (mortality_count / current_fish_count) * 100
        
        if daily_mortality_rate > 10:
            raise ValidationError(
                _("Mortalité journalière excessive: %(rate).1f%% (>10%% nécessite investigation)") % {
                    'rate': daily_mortality_rate
                }
            )


def validate_cycle_log_date(log_date: date, cycle_start: date, cycle_end: date = None):
    """
    Valide que la date du log est dans la période du cycle.
    
    Args:
        log_date: Date de l'entrée du log
        cycle_start: Date de début du cycle
        cycle_end: Date de fin du cycle (optionnel)
        
    Raises:
        ValidationError: Si la date est hors période du cycle
    """
    if log_date < cycle_start:
        raise ValidationError(
            _("Date du log (%(log_date)s) antérieure au début du cycle (%(start_date)s)") % {
                'log_date': log_date,
                'start_date': cycle_start
            }
        )
    
    if cycle_end and log_date > cycle_end:
        raise ValidationError(
            _("Date du log (%(log_date)s) postérieure à la fin du cycle (%(end_date)s)") % {
                'log_date': log_date,
                'end_date': cycle_end
            }
        )
    
    # Don't allow future dates
    if log_date > date.today():
        raise ValidationError(
            _("La date du log ne peut être dans le futur")
        )
    
    # Don't allow very old dates (more than 2 years ago)
    two_years_ago = date.today() - timedelta(days=730)
    if log_date < two_years_ago:
        raise ValidationError(
            _("Date du log trop ancienne (plus de 2 ans)")
        )


def validate_pond_dimensions(
    surface_m2: Decimal,
    volume_m3: Decimal = None,
    depth_m: Decimal = None
):
    """
    Valide les dimensions du bassin pour la vraisemblance.
    
    Args:
        surface_m2: Surface du bassin
        volume_m3: Volume du bassin (optionnel)
        depth_m: Profondeur du bassin (optionnel)
        
    Raises:
        ValidationError: Si les dimensions ne sont pas raisonnables
    """
    if surface_m2 <= 0:
        raise ValidationError(_("La surface du bassin doit être positive"))
    
    if surface_m2 < Decimal('10'):
        raise ValidationError(
            _("Surface trop petite: %(surface)s m² (minimum recommandé: 10 m²)") % {
                'surface': surface_m2
            }
        )
    
    if surface_m2 > Decimal('10000'):  # 1 hectare
        raise ValidationError(
            _("Surface très importante: %(surface)s m² (vérifiez la saisie)") % {
                'surface': surface_m2
            }
        )
    
    if volume_m3 is not None:
        if volume_m3 <= 0:
            raise ValidationError(_("Le volume du bassin doit être positif"))
        
        # Calculate implied depth
        implied_depth = volume_m3 / surface_m2
        
        if implied_depth < Decimal('0.5'):
            raise ValidationError(
                _("Profondeur calculée trop faible: %(depth).1f m (minimum: 0.5m)") % {
                    'depth': implied_depth
                }
            )
        
        if implied_depth > Decimal('5'):
            raise ValidationError(
                _("Profondeur calculée importante: %(depth).1f m (vérifiez les dimensions)") % {
                    'depth': implied_depth
                }
            )
    
    if depth_m is not None:
        if depth_m < Decimal('0.5'):
            raise ValidationError(
                _("Profondeur trop faible: %(depth)s m (minimum recommandé: 0.5m)") % {
                    'depth': depth_m
                }
            )
        
        if depth_m > Decimal('3'):
            raise ValidationError(
                _("Profondeur importante: %(depth)s m (maximum recommandé: 3m)") % {
                    'depth': depth_m
                }
            )


def validate_weight_progression(
    previous_weight: Decimal,
    current_weight: Decimal,
    days_elapsed: int
):
    """
    Valide que la progression de poids est réaliste.
    
    Args:
        previous_weight: Poids moyen précédent
        current_weight: Poids moyen actuel
        days_elapsed: Jours écoulés entre les mesures
        
    Raises:
        ValidationError: Si la progression de poids n'est pas réaliste
    """
    if days_elapsed <= 0:
        return
    
    if current_weight < previous_weight:
        # Weight loss - could be normal in some circumstances
        weight_loss = previous_weight - current_weight
        daily_loss = weight_loss / days_elapsed
        
        if daily_loss > Decimal('2'):  # More than 2g/day loss is concerning
            raise ValidationError(
                _("Perte de poids importante: -%(loss).1f g/jour (vérifiez les données)") % {
                    'loss': daily_loss
                }
            )
    else:
        # Weight gain
        weight_gain = current_weight - previous_weight
        daily_gain = weight_gain / days_elapsed
        
        # Very high growth rates might indicate measurement errors
        if daily_gain > Decimal('5'):  # More than 5g/day is exceptional
            raise ValidationError(
                _("Gain de poids exceptionnel: +%(gain).1f g/jour (vérifiez les données)") % {
                    'gain': daily_gain
                }
            )
        
        # Very low growth might indicate problems
        if daily_gain < Decimal('0.1') and days_elapsed > 7:
            # This is a warning rather than an error
            pass  # Could add warning logic here
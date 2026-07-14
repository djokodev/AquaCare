from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP

WEIGHT_DIFFERENCE_WARNING_THRESHOLD = Decimal('0.25')
BIOMASS_QUANTUM = Decimal('0.01')
WEIGHT_QUANTUM = Decimal('0.01')


@dataclass(frozen=True)
class StockState:
    count: int
    biomass_kg: Decimal

    @property
    def average_weight_g(self) -> Decimal:
        if self.count <= 0:
            return Decimal('0.00')
        return (self.biomass_kg * Decimal('1000') / self.count).quantize(WEIGHT_QUANTUM, rounding=ROUND_HALF_UP)


def biomass_for(count: int, average_weight_g: Decimal) -> Decimal:
    return (Decimal(count) * average_weight_g / Decimal('1000')).quantize(BIOMASS_QUANTUM, rounding=ROUND_HALF_UP)


def transfer(source: StockState, destination: StockState, count: int, average_weight_g: Decimal) -> tuple[StockState, StockState, Decimal]:
    biomass = biomass_for(count, average_weight_g)
    return (
        StockState(source.count - count, source.biomass_kg - biomass),
        StockState(destination.count + count, destination.biomass_kg + biomass),
        biomass,
    )


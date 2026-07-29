"""Stable public error contracts shared by production-unit HTTP facades."""


class ProductionUnitErrorContractMixin:
    """Keep a top-level business code scalar across DRF validation paths."""

    def handle_exception(self, exc):
        response = super().handle_exception(exc)
        data = getattr(response, 'data', None)
        if isinstance(data, dict):
            code = data.get('code')
            if isinstance(code, (list, tuple)) and len(code) == 1:
                data['code'] = code[0]
        return response

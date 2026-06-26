# Commerce Domain

## Scope

The commerce domain covers feed products, catalogue browsing, cart behavior, order lifecycle, and feed-related suggestions tied to production needs.

## Main concepts

- Product catalogue, the available feed and related items.
- Order, the purchase record from the app.
- Delivery method, home delivery or pickup.
- Feeding suggestions, commerce-side guidance connected to aquaculture needs.

## Current reference points

- `backend/apps/commerce/constants.py`
- `backend/apps/commerce/domain/`
- `backend/apps/commerce/services/`
- `frontend/src/domain/commerce/`
- `frontend/src/features/commerce/`

## Rules to preserve

- Keep backend controlled values authoritative.
- Align catalogue, order statuses, and delivery choices with the backend constants.
- Preserve compatibility with existing product and fixture data.

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
- Order documents are internal operational documents. Their delivery, farm,
  catalogue, issuer, and fulfilment-partner values are snapshots and must not
  be rebuilt from live records. Mobile users do not receive a PDF endpoint.

## Order fulfilment workflow

The delivery method determines the only valid status path:

```text
home:   confirmed -> delivered -> received
pickup: confirmed -> ready_for_pickup -> received
```

An order starts at `confirmed`. A superuser or member of `aquacare_commerce`
performs the first transition from Django Admin through a POST confirmation
page. Managers are read-only, support users have no Commerce workflow access,
and mobile users cannot perform the operator transition. Status is read-only in
the admin; orders and order items cannot be deleted there.

`delivered_at` and `delivered_by` audit home delivery. `ready_for_pickup_at` and
`ready_for_pickup_by` audit pickup readiness. `received_at` records the owner's
final confirmation. Historical actor fields remain null when the operator is
unknown. The workflow migration uses the old `updated_at` only as the best
available timestamp fallback and converts legacy pickup orders from `delivered`
to `ready_for_pickup`.

Operator retries are idempotent and create no duplicate notification. A real
transition schedules an in-app and push notification after transaction commit,
subject to the user's notification preferences. A notification failure is
logged and does not roll back a valid logistics transition.

The customer confirmation endpoint requires the authenticated order owner and
accepts only the method-consistent intermediate status. A replay on an already
`received` order returns the existing order and safely retries the stock import
to repair legacy gaps.

## Cycle store import

The store belongs to a production cycle; there is no farm-wide global store.
Final customer confirmation and stock import run in the same database
transaction. One `CycleFeedStockEntry` is keyed to each `OrderItem`, making
retries safe. An import failure rolls the order status back.

Historical order snapshots are authoritative: `product_name`,
`product_package_weight_kg_snapshot`, `product_pellet_size_mm_snapshot`, and
`line_total` supply the stock label, quantity, feed size, and expense. Current
catalogue values are only fallbacks for legacy lines with missing snapshots.
Pending-order feed weight follows the same rule.

Orders without a production cycle remain confirmable for compatibility. They
become `received` without creating stock, and the admin displays an explicit
warning instead of choosing an arbitrary cycle.

## Operational admin screens

- **Orders** is the logistics view: reference, farm and cycle, contextual
  status, destination, bag count, total, operator action, and compact FR/EN
  document links.
- **Order detail** is the immutable audit view: workflow history, client,
  delivery or pickup snapshots, items, amounts, documents, and sync metadata.
- **Order items** is the analytical line view: linked order, farm, product,
  quantity, unit price, total, status/date filters, and search.

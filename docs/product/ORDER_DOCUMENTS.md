# Order documents

Order documents are internal AquaCare operational documents. Staff retrieve
them from Django Admin and pass them to MaveCameroun, the preparation and
delivery partner. The mobile API intentionally has no PDF endpoint.

Each order freezes the farm name, product characteristics, AquaCare issuer,
and MaveCameroun contact data at creation. A document therefore remains
reproducible after a catalogue, profile, or configuration change. French and
English are generated separately. The backend calculates package and total
weights from product snapshots.

Home delivery documents show recipient, phone, region, city, and full address.
Pickup documents show the pickup location. Legacy missing fields are rendered
as an explicit localized value.

Superusers and commerce operators can view, download, and generate ZIP files.
Managers can view orders but not documents; support has no commerce access.
Admin supports individual FR/EN documents and ZIP batches of at most ten.

For visual review, run `manage.py generate_order_document_review_samples` and
inspect the PDFs and rendered PNGs in `tmp/order-document-review/`. Artifacts
are temporary and must not be committed.

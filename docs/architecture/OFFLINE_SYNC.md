# Offline Sync Model

## Purpose

AquaCare is built for intermittent connectivity. Offline-created records must survive local creation, later synchronization, and duplicate retry attempts.

## Required model behavior

- Use UUID primary keys.
- Add `client_uuid` on syncable records that can be created offline.
- Keep sync metadata such as offline creation markers and sync timestamps when the model supports them.
- Make create endpoints idempotent where offline retries are expected.

## Sync flow

1. The mobile app creates a local UUID for the object.
2. The record is queued locally when the device is offline.
3. The backend receives the payload and checks `client_uuid`.
4. If a matching record exists, the backend returns the existing object.
5. If no match exists, the backend creates a new record.

## Where it matters most

- Aquaculture cycles.
- Daily logs.
- Sanitary logs.
- Support records that can be retried.

## Frontend responsibilities

- Generate UUIDs locally.
- Preserve the queued payload until sync succeeds.
- Retry safely when the network returns.
- Avoid local calculations that change the authoritative record shape.

## Backend responsibilities

- Deduplicate by `client_uuid`.
- Return stable responses for retries.
- Keep sync endpoints tolerant of repeated submissions.
- Prefer explicit service methods for sync orchestration.

## Verification points

- Create the same offline payload twice and confirm only one server row is stored.
- Confirm synced objects preserve the intended backend identifiers.
- Confirm partial failures do not corrupt successful records.

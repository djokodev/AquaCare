---
name: offline-first-models
description: Apply offline-first patterns when creating or modifying Django models. Use when designing database schemas, creating new models, or discussing data synchronization.
---

# Offline-First Models - AquaCare

## Context

Cameroonian fish farmers have intermittent connectivity. All models must support offline creation with later synchronization.

## Required Pattern for Models

### 1. UUID as Primary Key (NEVER AutoField)

```python
import uuid
from django.db import models

class MyModel(models.Model):
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
```

### 2. Synchronization Fields (for models created offline)

```python
class MyOfflineModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Sync metadata
    client_uuid = models.UUIDField(
        unique=True,
        null=True,
        blank=True,
        help_text="UUID generated on mobile for deduplication"
    )
    created_offline = models.BooleanField(default=False)
    synced_at = models.DateTimeField(null=True, blank=True)
```

### 3. Backend Deduplication

In serializer or service:

```python
def create(self, validated_data):
    client_uuid = validated_data.get('client_uuid')
    if client_uuid:
        existing = MyModel.objects.filter(client_uuid=client_uuid).first()
        if existing:
            return existing  # Already synchronized
    return super().create(validated_data)
```

## Reference Models

These models already use this pattern:
- `CycleLog` - Daily logs (apps/aquaculture/models.py)
- `SanitaryLog` - Sanitary events
- `ProductionCycle` - Production cycles

## When to Apply

- Creating any new model that users can create on mobile
- Models that store user-generated data
- Any data that must persist when offline

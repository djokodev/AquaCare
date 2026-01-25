# Create Backend Feature

Complete workflow for developing a new Django/DRF backend feature.

**Usage:** `/create-backend-feature`

---

## Role

You are a Senior Backend Engineer specialized in Python and Django REST Framework with 15+ years of experience building scalable, secure, and well-tested APIs.

You work on MAVECAM AquaCare, an aquaculture platform for Cameroonian fish farmers with offline-first architecture.

---

## Workflow Overview

```
[1] CONTEXT    → Read project docs
[2] PLAN       → Deep think + architecture proposal
[3] VALIDATE   → User approves plan
[4] IMPLEMENT  → Write code following patterns
[5] TEST       → pytest with >50% coverage
[6] VERIFY     → User tests and confirms
```

---

## Phase 1: Context Gathering

**Read these files BEFORE any implementation:**

```
CLAUDE.md           → Project rules, constraints
ARCHITECTURE.md     → Current architecture, patterns
PROJECT_CONTEXT.md  → Progress, completed features
DONT_DO.md          → Mistakes to avoid
```

**Understand:**
- Existing models in `backend/apps/`
- Current API structure
- Authentication flow (JWT)
- Offline-first patterns (UUID, client_uuid)

---

## Phase 2: Planning (Deep Think)

**DO NOT start coding. First, produce a detailed plan:**

### 2.1 Architecture Proposal

```markdown
## Feature: [Feature Name]

### Models
- Model1: fields, relationships, constraints
- Model2: fields, relationships, constraints

### API Endpoints
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /api/module/resource/ | List resources | JWT |
| POST | /api/module/resource/ | Create resource | JWT |

### Serializers
- ResourceSerializer: fields, validation rules
- ResourceDetailSerializer: nested relationships

### Services (if complex logic)
- ResourceService.create(): business logic
- ResourceService.calculate(): domain calculations

### Permissions
- IsAuthenticated for all endpoints
- IsOwner for object-level access

### Offline-First Considerations
- UUID primary keys
- client_uuid for deduplication
- synced_at timestamp
```

### 2.2 Database Schema

```
Model: ResourceName
├── id: UUIDField (PK)
├── client_uuid: UUIDField (unique, nullable)
├── user: ForeignKey(User)
├── [business fields]
├── created_offline: BooleanField
├── synced_at: DateTimeField
├── created_at: DateTimeField
└── updated_at: DateTimeField
```

### 2.3 Wait for User Approval

```
⏳ STOP HERE - Present plan to user
   User must validate before implementation
```

---

## Phase 3: Implementation

### 3.1 Model Pattern

```python
import uuid
from django.db import models
from django.conf import settings

class Resource(models.Model):
    """
    Resource description.

    Offline-first: Uses UUID PK and client_uuid for deduplication.
    """
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    client_uuid = models.UUIDField(
        unique=True,
        null=True,
        blank=True,
        help_text="Client-generated UUID for offline deduplication"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='resources'
    )

    # Business fields
    name = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=12, decimal_places=2)  # FCFA

    # Sync metadata
    created_offline = models.BooleanField(default=False)
    synced_at = models.DateTimeField(null=True, blank=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.user})"
```

### 3.2 Serializer Pattern

```python
from rest_framework import serializers
from django.utils import timezone

class ResourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Resource
        fields = [
            'id', 'client_uuid', 'name', 'amount',
            'created_offline', 'synced_at', 'created_at'
        ]
        read_only_fields = ['id', 'synced_at', 'created_at']

    def validate_amount(self, value):
        if value < 0:
            raise serializers.ValidationError("Amount must be positive")
        return value

    def create(self, validated_data):
        # Offline deduplication
        client_uuid = validated_data.get('client_uuid')
        if client_uuid:
            existing = Resource.objects.filter(client_uuid=client_uuid).first()
            if existing:
                return existing

        validated_data['synced_at'] = timezone.now()
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)
```

### 3.3 ViewSet Pattern

```python
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response

class ResourceViewSet(viewsets.ModelViewSet):
    """
    API endpoint for Resource CRUD operations.

    list: GET /api/module/resources/
    create: POST /api/module/resources/
    retrieve: GET /api/module/resources/{id}/
    update: PUT /api/module/resources/{id}/
    destroy: DELETE /api/module/resources/{id}/
    """
    serializer_class = ResourceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Resource.objects.filter(
            user=self.request.user
        ).select_related('user')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """GET /api/module/resources/summary/"""
        qs = self.get_queryset()
        return Response({
            'total': qs.count(),
            'total_amount': qs.aggregate(Sum('amount'))['amount__sum'] or 0
        })
```

### 3.4 URL Configuration

```python
# apps/module/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ResourceViewSet

router = DefaultRouter()
router.register(r'resources', ResourceViewSet, basename='resource')

urlpatterns = [
    path('', include(router.urls)),
]
```

---

## Phase 4: Testing

### 4.1 Test Structure

```
backend/apps/module/tests/
├── __init__.py
├── conftest.py      # Fixtures
├── test_models.py   # Model tests
├── test_serializers.py
└── test_views.py    # API tests
```

### 4.2 Test Pattern

```python
import pytest
from decimal import Decimal
from django.urls import reverse
from rest_framework import status

@pytest.mark.django_db
class TestResourceAPI:
    def test_create_resource(self, authenticated_client, user):
        url = reverse('resource-list')
        data = {
            'name': 'Test Resource',
            'amount': '1000.00',
            'client_uuid': 'test-uuid-123'
        }
        response = authenticated_client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'Test Resource'

    def test_deduplication(self, authenticated_client, user):
        url = reverse('resource-list')
        data = {'name': 'Test', 'amount': '100', 'client_uuid': 'same-uuid'}

        response1 = authenticated_client.post(url, data)
        response2 = authenticated_client.post(url, data)

        assert response1.data['id'] == response2.data['id']  # Same object

    def test_list_own_resources_only(self, authenticated_client, user, other_user_resource):
        url = reverse('resource-list')
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        # Should not see other user's resources
        ids = [r['id'] for r in response.data]
        assert str(other_user_resource.id) not in ids
```

### 4.3 Run Tests

```bash
cd backend
pytest apps/module/tests/ -v --cov=apps/module --cov-report=term
```

**Minimum coverage: 50%**

---

## Phase 5: Verification Checklist

Before marking complete:

```
Models:
[ ] UUID as primary key
[ ] client_uuid for offline deduplication
[ ] created_offline, synced_at fields
[ ] Proper relationships (ForeignKey, etc.)
[ ] Meta class with ordering

Serializers:
[ ] Validation rules implemented
[ ] Deduplication in create()
[ ] Read-only fields specified
[ ] User assignment from context

Views:
[ ] Permission classes set
[ ] Queryset filtered by user
[ ] select_related/prefetch_related for optimization

Tests:
[ ] Model validation tests
[ ] API endpoint tests
[ ] Deduplication tests
[ ] Permission tests
[ ] Coverage >= 50%

Migrations:
[ ] makemigrations executed
[ ] migrate executed
[ ] No migration conflicts
```

---

## Output Format

After implementation, provide:

```
FEATURE IMPLEMENTATION COMPLETE
===============================

Feature: [Name]
Module: apps/[module]/

Files Created/Modified:
- apps/module/models.py (Resource model)
- apps/module/serializers.py (ResourceSerializer)
- apps/module/views.py (ResourceViewSet)
- apps/module/urls.py (router config)
- apps/module/tests/test_views.py

API Endpoints:
- GET    /api/module/resources/
- POST   /api/module/resources/
- GET    /api/module/resources/{id}/
- PUT    /api/module/resources/{id}/
- DELETE /api/module/resources/{id}/

Test Results:
pytest: 12 passed
Coverage: 67%

Next Steps:
1. Run: docker-compose exec api python manage.py migrate
2. Test API manually with curl/Postman
3. Confirm feature works as expected
```

---

## References

- ARCHITECTURE.md: Backend patterns
- apps/aquaculture/: Reference implementation
- apps/common/admin_mixins.py: RBAC patterns

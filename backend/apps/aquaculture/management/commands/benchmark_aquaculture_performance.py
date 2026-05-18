from __future__ import annotations

import json
import random
import time
import uuid
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from typing import Any

from accounts.models import FarmProfile, User
from accounts.services.auth_application_service import AuthApplicationService
from aquaculture.models import FarmProductionPlan, ProductionCycle
from django.contrib.auth.hashers import make_password
from django.core.cache import cache
from django.core.management.base import BaseCommand, CommandError
from django.db import close_old_connections
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient


BENCHMARK_EMAIL_DOMAIN = "aquaculture-benchmark.aquacare.local"
DEFAULT_PASSWORD = "BenchmarkPass123"


@dataclass(frozen=True)
class BenchmarkUser:
    id: object
    phone_number: str
    cycle_id: str | None


@dataclass(frozen=True)
class BenchmarkResult:
    operation: str
    status_code: int
    duration_ms: float
    error: str | None = None


@dataclass(frozen=True)
class PreparedCredentials:
    access_token: str | None = None


class Command(BaseCommand):
    help = "Seed and benchmark aquaculture API endpoints with local in-process DRF requests."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--users", type=int, default=1000)
        parser.add_argument("--requests", type=int, default=2000)
        parser.add_argument("--concurrency", type=int, default=16)
        parser.add_argument("--warmup", type=int, default=50)
        parser.add_argument("--batch-size", type=int, default=1000)
        parser.add_argument("--password", default=DEFAULT_PASSWORD)
        parser.add_argument("--phone-prefix", default="+23768")
        parser.add_argument(
            "--scenario",
            choices=["dashboard", "cycles", "logs", "sanitary", "reports", "sync", "mixed"],
            default="mixed",
        )
        parser.add_argument("--seed-only", action="store_true")
        parser.add_argument("--no-seed", action="store_true")
        parser.add_argument("--no-seed-cycles", action="store_true")
        parser.add_argument("--clear-cache", action="store_true")
        parser.add_argument("--json", action="store_true", dest="as_json")
        parser.add_argument(
            "--dashboard-lightweight",
            action="store_true",
            help="Append lightweight=true on dashboard benchmark requests.",
        )

    def handle(self, *args: object, **options: Any) -> None:
        users_count = self._positive_int(options["users"], "--users")
        requests_count = self._positive_int(options["requests"], "--requests")
        concurrency = self._positive_int(options["concurrency"], "--concurrency")
        warmup = self._non_negative_int(options["warmup"], "--warmup")
        batch_size = self._positive_int(options["batch_size"], "--batch-size")
        phone_prefix = options["phone_prefix"]
        password = options["password"]
        scenario = options["scenario"]
        seed_cycles = not options["no_seed_cycles"]
        self.dashboard_lightweight = bool(options["dashboard_lightweight"])

        if len(phone_prefix) >= 13:
            raise CommandError("--phone-prefix must leave room for generated digits.")

        if options["clear_cache"]:
            cache.clear()

        created_users = 0
        created_cycles = 0
        if not options["no_seed"]:
            created_users = self._ensure_benchmark_users(
                target_count=users_count,
                batch_size=batch_size,
                phone_prefix=phone_prefix,
                password=password,
                verbose=not options["as_json"],
            )
            if seed_cycles:
                created_cycles = self._ensure_benchmark_cycles(
                    users_count=users_count,
                    phone_prefix=phone_prefix,
                    batch_size=batch_size,
                    verbose=not options["as_json"],
                )

        users = self._load_benchmark_users(limit=users_count, phone_prefix=phone_prefix)
        if len(users) < users_count:
            raise CommandError(
                f"Only {len(users)} benchmark users are available, expected {users_count}."
            )

        if options["seed_only"]:
            payload = {
                "seeded_users": len(users),
                "created_users": created_users,
                "created_cycles": created_cycles,
                "phone_prefix": phone_prefix,
                "scenario": scenario,
            }
            self._write_payload(payload, as_json=options["as_json"])
            return

        warmup_results = self._run_benchmark(
            users=users,
            password=password,
            scenario=scenario,
            requests_count=warmup,
            concurrency=1,
            include_results=False,
        )
        if warmup_results:
            self.stdout.write(f"Warmup completed: {len(warmup_results)} requests")

        started_at = time.perf_counter()
        results = self._run_benchmark(
            users=users,
            password=password,
            scenario=scenario,
            requests_count=requests_count,
            concurrency=concurrency,
            include_results=True,
        )
        elapsed_seconds = time.perf_counter() - started_at

        payload = {
            "scenario": scenario,
            "seeded_users": len(users),
            "created_users": created_users,
            "created_cycles": created_cycles,
            "requests": requests_count,
            "concurrency": concurrency,
            "elapsed_seconds": round(elapsed_seconds, 4),
            "throughput_rps": round(requests_count / elapsed_seconds, 2)
            if elapsed_seconds > 0
            else 0,
            "operations": self._summarize_results(results),
        }
        self._write_payload(payload, as_json=options["as_json"])

    @staticmethod
    def _positive_int(value: int, option_name: str) -> int:
        if value <= 0:
            raise CommandError(f"{option_name} must be greater than 0.")
        return value

    @staticmethod
    def _non_negative_int(value: int, option_name: str) -> int:
        if value < 0:
            raise CommandError(f"{option_name} must be greater than or equal to 0.")
        return value

    def _ensure_benchmark_users(
        self,
        *,
        target_count: int,
        batch_size: int,
        phone_prefix: str,
        password: str,
        verbose: bool,
    ) -> int:
        created = 0
        password_hash = make_password(password)
        now = timezone.now()

        for start in range(0, target_count, batch_size):
            end = min(start + batch_size, target_count)
            indexes = range(start, end)
            phone_numbers = [self._phone_number(phone_prefix, index) for index in indexes]
            existing = set(
                User.objects.filter(phone_number__in=phone_numbers).values_list(
                    "phone_number",
                    flat=True,
                )
            )

            users_to_create: list[User] = []
            farms_to_create: list[FarmProfile] = []
            plans_to_create: list[FarmProductionPlan] = []

            for index, phone_number in zip(indexes, phone_numbers, strict=True):
                if phone_number in existing:
                    continue

                user_id = uuid.uuid4()
                farm_id = uuid.uuid4()
                last_name = f"AquaBench{index:06d}"
                user = User(
                    id=user_id,
                    phone_number=phone_number,
                    email=f"aquaculture-benchmark-{index}@{BENCHMARK_EMAIL_DOMAIN}",
                    first_name="Aqua",
                    last_name=last_name,
                    first_name_normalized="aqua",
                    last_name_normalized=last_name.casefold(),
                    password=password_hash,
                    account_type="individual",
                    age_group="26_35",
                    language_preference="fr",
                    is_active=True,
                    is_staff=False,
                    is_superuser=False,
                    date_joined=now,
                )
                farm = FarmProfile(
                    id=farm_id,
                    user_id=user_id,
                    farm_name=f"Ferme Aqua Bench {last_name}",
                    certification_status="pending",
                    created_at=now,
                    updated_at=now,
                )
                plan = FarmProductionPlan(
                    id=uuid.uuid4(),
                    farm_profile_id=farm_id,
                    created_at=now,
                    updated_at=now,
                )
                users_to_create.append(user)
                farms_to_create.append(farm)
                plans_to_create.append(plan)

            if users_to_create:
                User.objects.bulk_create(users_to_create, batch_size=batch_size)
                FarmProfile.objects.bulk_create(farms_to_create, batch_size=batch_size)
                FarmProductionPlan.objects.bulk_create(plans_to_create, batch_size=batch_size)
                created += len(users_to_create)
                if verbose:
                    self.stdout.write(
                        f"Seeded benchmark users: {created} created, {end} scanned"
                    )

        return created

    def _ensure_benchmark_cycles(
        self,
        *,
        users_count: int,
        phone_prefix: str,
        batch_size: int,
        verbose: bool,
    ) -> int:
        users = (
            User.objects.filter(
                phone_number__startswith=phone_prefix,
                email__endswith=f"@{BENCHMARK_EMAIL_DOMAIN}",
                is_active=True,
            )
            .order_by("phone_number")
            .values_list("id", "farm_profile__id")[:users_count]
        )
        farm_ids = [farm_id for _, farm_id in users if farm_id]
        existing_farm_ids = set(
            ProductionCycle.objects.filter(farm_profile_id__in=farm_ids).values_list(
                "farm_profile_id",
                flat=True,
            )
        )
        farms_missing_cycle = [farm_id for farm_id in farm_ids if farm_id not in existing_farm_ids]
        if not farms_missing_cycle:
            return 0

        today = timezone.localdate()
        start_date = today - timedelta(days=45)
        to_create: list[ProductionCycle] = []
        for index, farm_id in enumerate(farms_missing_cycle):
            initial_count = 1000
            initial_weight = Decimal("12.00")
            initial_biomass = Decimal("12.00")
            current_count = 970
            current_weight = Decimal("35.00")
            current_biomass = Decimal("33.95")
            to_create.append(
                ProductionCycle(
                    id=uuid.uuid4(),
                    farm_profile_id=farm_id,
                    cycle_name=f"Cycle Bench {index + 1}",
                    species="tilapia",
                    pond_identifier=f"B{index % 100:02d}",
                    pond_surface_m2=Decimal("100.00"),
                    pond_volume_m3=Decimal("200.00"),
                    start_date=start_date,
                    initial_count=initial_count,
                    initial_average_weight=initial_weight,
                    initial_biomass=initial_biomass,
                    current_count=current_count,
                    current_average_weight=current_weight,
                    current_biomass=current_biomass,
                    status="active",
                )
            )

        created = 0
        for start in range(0, len(to_create), batch_size):
            chunk = to_create[start : start + batch_size]
            ProductionCycle.objects.bulk_create(chunk, batch_size=batch_size)
            created += len(chunk)
            if verbose:
                self.stdout.write(f"Seeded benchmark cycles: {created}/{len(to_create)}")
        return created

    @staticmethod
    def _phone_number(phone_prefix: str, index: int) -> str:
        digits = 13 - len(phone_prefix)
        if index >= 10**digits:
            raise CommandError("--phone-prefix is too long for the requested user count.")
        return f"{phone_prefix}{index:0{digits}d}"

    def _load_benchmark_users(self, *, limit: int, phone_prefix: str) -> list[BenchmarkUser]:
        rows = list(
            User.objects.filter(
                phone_number__startswith=phone_prefix,
                email__endswith=f"@{BENCHMARK_EMAIL_DOMAIN}",
                is_active=True,
            )
            .order_by("phone_number")
            .values_list("id", "phone_number", "farm_profile__id")[:limit]
        )
        farm_ids = [farm_id for _, _, farm_id in rows if farm_id]
        cycle_rows = (
            ProductionCycle.objects.filter(farm_profile_id__in=farm_ids, status="active")
            .order_by("farm_profile_id", "-start_date")
            .values_list("farm_profile_id", "id")
        )
        cycle_by_farm: dict[object, str] = {}
        for farm_id, cycle_id in cycle_rows:
            if farm_id not in cycle_by_farm:
                cycle_by_farm[farm_id] = str(cycle_id)

        users: list[BenchmarkUser] = []
        for user_id, phone_number, farm_id in rows:
            users.append(
                BenchmarkUser(
                    id=user_id,
                    phone_number=phone_number,
                    cycle_id=cycle_by_farm.get(farm_id),
                )
            )
        return users

    def _run_benchmark(
        self,
        *,
        users: list[BenchmarkUser],
        password: str,
        scenario: str,
        requests_count: int,
        concurrency: int,
        include_results: bool,
    ) -> list[BenchmarkResult]:
        if requests_count == 0:
            return []

        operations_for_run = (
            [scenario] if scenario != "mixed" else ["dashboard", "cycles", "logs", "sanitary", "reports", "sync", "login"]
        )
        needs_auth_tokens = any(operation != "login" for operation in operations_for_run)
        token_cache: dict[object, str] = (
            self._build_access_token_cache(users) if needs_auth_tokens else {}
        )

        randomizer = random.Random(20260518)
        tasks = [
            (
                index,
                self._choose_operation(scenario, randomizer),
                users[index % len(users)],
            )
            for index in range(requests_count)
        ]

        results: list[BenchmarkResult] = []
        if concurrency == 1:
            for index, operation, user in tasks:
                result = self._execute_operation(
                    index,
                    operation,
                    user,
                    password,
                    token_cache,
                    manage_connections=False,
                )
                if include_results:
                    results.append(result)
            return results

        with ThreadPoolExecutor(max_workers=concurrency) as executor:
            futures = [
                executor.submit(
                    self._execute_operation,
                    index,
                    operation,
                    user,
                    password,
                    token_cache,
                    True,
                )
                for index, operation, user in tasks
            ]
            for future in as_completed(futures):
                result = future.result()
                if include_results:
                    results.append(result)

        return results

    @staticmethod
    def _choose_operation(scenario: str, randomizer: random.Random) -> str:
        if scenario != "mixed":
            return scenario

        return randomizer.choices(
            ["dashboard", "cycles", "logs", "sanitary", "reports", "sync", "login"],
            weights=[30, 20, 15, 10, 10, 10, 5],
            k=1,
        )[0]

    def _execute_operation(
        self,
        index: int,
        operation: str,
        user: BenchmarkUser,
        password: str,
        token_cache: dict[object, str],
        manage_connections: bool,
    ) -> BenchmarkResult:
        if manage_connections:
            close_old_connections()
        client = APIClient()
        credentials = self._prepare_credentials(operation, user, token_cache)
        started_at = time.perf_counter()
        try:
            response = self._dispatch_operation(
                client=client,
                index=index,
                operation=operation,
                user=user,
                password=password,
                credentials=credentials,
            )
            duration_ms = (time.perf_counter() - started_at) * 1000
            return BenchmarkResult(
                operation=operation,
                status_code=response.status_code,
                duration_ms=duration_ms,
            )
        except Exception as err:
            duration_ms = (time.perf_counter() - started_at) * 1000
            return BenchmarkResult(
                operation=operation,
                status_code=0,
                duration_ms=duration_ms,
                error=err.__class__.__name__,
            )
        finally:
            if manage_connections:
                close_old_connections()

    def _dispatch_operation(
        self,
        *,
        client: APIClient,
        index: int,
        operation: str,
        user: BenchmarkUser,
        password: str,
        credentials: PreparedCredentials,
    ):
        remote_addr = f"10.200.{(index // 250) % 250}.{index % 250}"

        if operation == "login":
            return client.post(
                reverse("accounts:login"),
                {"phone_number": user.phone_number, "password": password},
                format="json",
                REMOTE_ADDR=remote_addr,
            )

        self._authenticate_client(client, credentials)

        if operation == "dashboard":
            params = {"lightweight": "true"} if self.dashboard_lightweight else None
            if params:
                return client.get(reverse("aquaculture:dashboard"), params, REMOTE_ADDR=remote_addr)
            return client.get(reverse("aquaculture:dashboard"), REMOTE_ADDR=remote_addr)

        if operation == "cycles":
            return client.get(
                reverse("aquaculture:production-cycle-list"),
                {"status": "active"},
                REMOTE_ADDR=remote_addr,
            )

        if operation == "logs":
            if user.cycle_id:
                return client.get(
                    reverse("aquaculture:cycle-log-list"),
                    {"cycle_id": user.cycle_id},
                    REMOTE_ADDR=remote_addr,
                )
            return client.get(reverse("aquaculture:cycle-log-list"), REMOTE_ADDR=remote_addr)

        if operation == "sanitary":
            return client.get(reverse("aquaculture:sanitary-log-active-issues"), REMOTE_ADDR=remote_addr)

        if operation == "reports":
            return client.get(
                reverse("aquaculture:production-report-list"),
                {"status": "draft"},
                REMOTE_ADDR=remote_addr,
            )

        if operation == "sync":
            return client.post(
                reverse("aquaculture:sync"),
                {
                    "cycle_logs": [],
                    "sanitary_logs": [],
                    "new_cycles": [],
                    "device_id": f"aquaculture-bench-device-{index % 1000}",
                },
                format="json",
                REMOTE_ADDR=remote_addr,
            )

        raise CommandError(f"Unsupported operation: {operation}")

    def _prepare_credentials(
        self,
        operation: str,
        user: BenchmarkUser,
        token_cache: dict[object, str],
    ) -> PreparedCredentials:
        if operation == "login":
            return PreparedCredentials()
        token = token_cache.get(user.id)
        if not token:
            token = self._build_access_token(self._get_user(user.id))
            token_cache[user.id] = token
        return PreparedCredentials(access_token=token)

    def _build_access_token_cache(self, users: list[BenchmarkUser]) -> dict[object, str]:
        user_ids = {user.id for user in users}
        users_by_id = {
            account.id: account
            for account in User.objects.filter(id__in=user_ids).only("id", "language_preference")
        }
        cache_map: dict[object, str] = {}
        for user in users:
            account = users_by_id.get(user.id)
            if account is None:
                continue
            cache_map[user.id] = self._build_access_token(account)
        return cache_map

    @staticmethod
    def _build_access_token(user: User) -> str:
        tokens = AuthApplicationService.build_auth_tokens(user)
        return tokens.access

    @staticmethod
    def _authenticate_client(client: APIClient, credentials: PreparedCredentials) -> None:
        if not credentials.access_token:
            raise CommandError("Missing access token for authenticated operation.")
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {credentials.access_token}")

    @staticmethod
    def _get_user(user_id: object) -> User:
        return User.objects.only("id", "language_preference").get(pk=user_id)

    def _summarize_results(self, results: list[BenchmarkResult]) -> dict[str, dict[str, Any]]:
        grouped: dict[str, list[BenchmarkResult]] = defaultdict(list)
        for result in results:
            grouped[result.operation].append(result)

        return {
            operation: self._summarize_operation(operation_results)
            for operation, operation_results in sorted(grouped.items())
        }

    @staticmethod
    def _summarize_operation(results: list[BenchmarkResult]) -> dict[str, Any]:
        durations = sorted(result.duration_ms for result in results)
        status_counts = Counter(str(result.status_code) for result in results)
        error_counts = Counter(result.error for result in results if result.error)
        success_count = sum(1 for result in results if 200 <= result.status_code < 300)

        return {
            "count": len(results),
            "success": success_count,
            "errors": len(results) - success_count,
            "status_counts": dict(sorted(status_counts.items())),
            "exception_counts": dict(sorted(error_counts.items())),
            "min_ms": round(durations[0], 2),
            "avg_ms": round(sum(durations) / len(durations), 2),
            "p50_ms": round(Command._percentile(durations, 50), 2),
            "p95_ms": round(Command._percentile(durations, 95), 2),
            "p99_ms": round(Command._percentile(durations, 99), 2),
            "max_ms": round(durations[-1], 2),
        }

    @staticmethod
    def _percentile(sorted_values: list[float], percentile: int) -> float:
        if len(sorted_values) == 1:
            return sorted_values[0]
        rank = (len(sorted_values) - 1) * (percentile / 100)
        lower = int(rank)
        upper = min(lower + 1, len(sorted_values) - 1)
        weight = rank - lower
        return sorted_values[lower] * (1 - weight) + sorted_values[upper] * weight

    def _write_payload(self, payload: dict[str, Any], *, as_json: bool) -> None:
        if as_json:
            self.stdout.write(json.dumps(payload, indent=2, sort_keys=True))
            return

        self.stdout.write("Aquaculture performance benchmark")
        for key in [
            "scenario",
            "seeded_users",
            "created_users",
            "created_cycles",
            "requests",
            "concurrency",
            "elapsed_seconds",
            "throughput_rps",
        ]:
            if key in payload:
                self.stdout.write(f"{key}: {payload[key]}")

        operations = payload.get("operations")
        if not operations:
            return

        for operation, summary in operations.items():
            self.stdout.write(
                (
                    f"{operation}: count={summary['count']} "
                    f"success={summary['success']} errors={summary['errors']} "
                    f"avg_ms={summary['avg_ms']} p95_ms={summary['p95_ms']} "
                    f"p99_ms={summary['p99_ms']} max_ms={summary['max_ms']} "
                    f"statuses={summary['status_counts']}"
                )
            )

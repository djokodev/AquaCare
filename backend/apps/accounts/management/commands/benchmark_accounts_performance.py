from __future__ import annotations

import json
import random
import time
import uuid
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Any

from aquaculture.models import FarmProductionPlan
from accounts.models import FarmProfile, User
from accounts.services.auth_application_service import AuthApplicationService
from django.contrib.auth.hashers import make_password
from django.core.cache import cache
from django.core.management.base import BaseCommand, CommandError
from django.db import close_old_connections
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient


BENCHMARK_EMAIL_DOMAIN = "benchmark.aquacare.local"
DEFAULT_PASSWORD = "BenchmarkPass123"


@dataclass(frozen=True)
class BenchmarkUser:
    id: object
    phone_number: str
    login_name: str


@dataclass(frozen=True)
class BenchmarkResult:
    operation: str
    status_code: int
    duration_ms: float
    error: str | None = None


@dataclass(frozen=True)
class PreparedCredentials:
    access_token: str | None = None
    refresh_token: str | None = None


class Command(BaseCommand):
    help = "Seed and benchmark accounts API endpoints with local in-process DRF requests."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--users", type=int, default=1000)
        parser.add_argument("--requests", type=int, default=200)
        parser.add_argument("--concurrency", type=int, default=1)
        parser.add_argument("--warmup", type=int, default=10)
        parser.add_argument("--batch-size", type=int, default=1000)
        parser.add_argument("--password", default=DEFAULT_PASSWORD)
        parser.add_argument("--phone-prefix", default="+23767")
        parser.add_argument(
            "--scenario",
            choices=["login", "profile", "farm", "refresh", "simulate", "mixed"],
            default="mixed",
        )
        parser.add_argument("--seed-only", action="store_true")
        parser.add_argument("--no-seed", action="store_true")
        parser.add_argument("--clear-cache", action="store_true")
        parser.add_argument("--json", action="store_true", dest="as_json")

    def handle(self, *args: object, **options: Any) -> None:
        users_count = self._positive_int(options["users"], "--users")
        requests_count = self._positive_int(options["requests"], "--requests")
        concurrency = self._positive_int(options["concurrency"], "--concurrency")
        warmup = self._non_negative_int(options["warmup"], "--warmup")
        batch_size = self._positive_int(options["batch_size"], "--batch-size")
        phone_prefix = options["phone_prefix"]
        password = options["password"]
        scenario = options["scenario"]

        if len(phone_prefix) >= 13:
            raise CommandError("--phone-prefix must leave room for generated digits.")

        if options["clear_cache"]:
            cache.clear()

        if not options["no_seed"]:
            created = self._ensure_benchmark_users(
                target_count=users_count,
                batch_size=batch_size,
                phone_prefix=phone_prefix,
                password=password,
                verbose=not options["as_json"],
            )
        else:
            created = 0

        users = self._load_benchmark_users(limit=users_count, phone_prefix=phone_prefix)
        if len(users) < users_count:
            raise CommandError(
                f"Only {len(users)} benchmark users are available, expected {users_count}."
            )

        if options["seed_only"]:
            payload = {
                "seeded_users": len(users),
                "created_users": created,
                "phone_prefix": phone_prefix,
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
            "created_users": created,
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
                last_name = f"User{index:06d}"
                user = User(
                    id=user_id,
                    phone_number=phone_number,
                    email=f"accounts-benchmark-{index}@{BENCHMARK_EMAIL_DOMAIN}",
                    first_name="Bench",
                    last_name=last_name,
                    first_name_normalized="bench",
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
                    farm_name=f"Ferme Bench {last_name}",
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

    @staticmethod
    def _phone_number(phone_prefix: str, index: int) -> str:
        digits = 13 - len(phone_prefix)
        if index >= 10**digits:
            raise CommandError("--phone-prefix is too long for the requested user count.")
        return f"{phone_prefix}{index:0{digits}d}"

    def _load_benchmark_users(self, *, limit: int, phone_prefix: str) -> list[BenchmarkUser]:
        rows = (
            User.objects.filter(
                phone_number__startswith=phone_prefix,
                email__endswith=f"@{BENCHMARK_EMAIL_DOMAIN}",
                is_active=True,
            )
            .order_by("phone_number")
            .values_list("id", "phone_number", "first_name", "last_name")[:limit]
        )
        return [
            BenchmarkUser(
                id=user_id,
                phone_number=phone_number,
                login_name=f"{first_name} {last_name}",
            )
            for user_id, phone_number, first_name, last_name in rows
        ]

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

        randomizer = random.Random(20260510)
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
            ["profile", "farm", "login", "refresh", "simulate"],
            weights=[30, 25, 20, 15, 10],
            k=1,
        )[0]

    def _execute_operation(
        self,
        index: int,
        operation: str,
        user: BenchmarkUser,
        password: str,
        manage_connections: bool,
    ) -> BenchmarkResult:
        if manage_connections:
            close_old_connections()
        client = APIClient()
        credentials = self._prepare_credentials(operation, user)
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
        remote_addr = f"10.250.{(index // 250) % 250}.{index % 250}"

        if operation == "login":
            return client.post(
                reverse("accounts:login"),
                {"phone_number": user.phone_number, "password": password},
                format="json",
                REMOTE_ADDR=remote_addr,
            )

        if operation == "profile":
            self._authenticate_client(client, credentials)
            return client.get(reverse("accounts:profile"), REMOTE_ADDR=remote_addr)

        if operation == "farm":
            self._authenticate_client(client, credentials)
            return client.get(reverse("accounts:farm_profile"), REMOTE_ADDR=remote_addr)

        if operation == "refresh":
            return client.post(
                reverse("accounts:token_refresh"),
                {"refresh": credentials.refresh_token},
                format="json",
                REMOTE_ADDR=remote_addr,
            )

        if operation == "simulate":
            self._authenticate_client(client, credentials)
            return client.post(
                reverse("accounts:annual_simulation"),
                {
                    "species": "tilapia",
                    "annual_production_target_kg": "1000",
                    "num_cycles": 2,
                },
                format="json",
                REMOTE_ADDR=remote_addr,
            )

        raise CommandError(f"Unsupported operation: {operation}")

    def _prepare_credentials(self, operation: str, user: BenchmarkUser) -> PreparedCredentials:
        if operation == "login":
            return PreparedCredentials()

        tokens = AuthApplicationService.build_auth_tokens(self._get_user(user.id))
        if operation == "refresh":
            return PreparedCredentials(refresh_token=tokens.refresh)
        return PreparedCredentials(access_token=tokens.access)

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

        self.stdout.write("Accounts performance benchmark")
        for key in [
            "scenario",
            "seeded_users",
            "created_users",
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

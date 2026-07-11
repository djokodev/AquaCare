"""Pure helpers used to build deterministic cycle-report visualisations."""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from html import escape
from math import cos, pi, sin


def _safe(value: object) -> float:
    try:
        number = float(value or 0)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, number)


def aggregate_growth_points(logs: list[dict], report_type: str, period_start: date, period_end: date) -> list[dict]:
    """Aggregate weighted average weights by ISO week without inventing points."""
    buckets: dict[tuple[int, int], list[tuple[float, float]]] = defaultdict(list)
    for log in logs:
        try:
            log_date = date.fromisoformat(str(log.get("log_date")))
        except (TypeError, ValueError):
            continue
        weight = _safe(log.get("average_weight"))
        count = _safe(log.get("sample_count"))
        total_weight = _safe(log.get("sample_total_weight"))
        if not weight and total_weight and count:
            weight = total_weight / count
        if not weight:
            continue
        buckets[log_date.isocalendar()[:2]].append((weight, count))

    points = []
    for (year, week), values in sorted(buckets.items()):
        weighted = sum(weight * count for weight, count in values if count > 0)
        counts = sum(count for _, count in values if count > 0)
        if counts:
            average = weighted / counts
        else:
            # Legacy logs may have no sample size. A deterministic mean is the
            # only available fallback; it is never mixed with weighted values.
            average = sum(weight for weight, _ in values) / len(values)
        week_start = date.fromisocalendar(year, week, 1)
        if report_type == "weekly" and week_start < period_start:
            label = "Semaine précédente"
        elif report_type == "weekly":
            label = "Semaine couverte"
        else:
            label = f"Semaine {len(points) + 1}"
        points.append({"label": label, "value_g": round(average, 2), "year": year, "week": week})

    if report_type == "weekly":
        points = points[-2:]
    return points


def build_growth_svg(points: list[dict], width: int = 520, height: int = 220) -> str:
    if len(points) < 1:
        return ""
    left, bottom, chart_width, chart_height = 52, 35, width - 72, height - 60
    maximum = max(max(_safe(point["value_g"]) for point in points), 1)
    bar_width = min(72, chart_width / max(len(points), 1) * 0.58)
    bars = []
    labels = []
    for index, point in enumerate(points):
        x = left + (index + 0.5) * chart_width / len(points) - bar_width / 2
        bar_height = _safe(point["value_g"]) / maximum * chart_height
        y = height - bottom - bar_height
        bars.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{bar_width:.1f}" height="{bar_height:.1f}" fill="#059669"/>')
        label_x = x + bar_width / 2
        labels.append(
            f'<text x="{label_x:.1f}" y="{height - 14}" text-anchor="middle">{escape(str(point["label"]))}</text>'
        )
        labels.append(
            f'<text x="{label_x:.1f}" y="{max(y - 4, 12):.1f}" text-anchor="middle">{point["value_g"]:.1f}</text>'
        )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img">'
        f'<line x1="{left}" y1="{height - bottom}" x2="{width - 20}" y2="{height - bottom}" stroke="#64748b"/>'
        f'<line x1="{left}" y1="20" x2="{left}" y2="{height - bottom}" stroke="#64748b"/>'
        f'<text x="12" y="24" font-size="10">g</text>{"".join(bars)}{"".join(labels)}</svg>'
    )


def build_cost_breakdown(categories: dict[str, float]) -> dict:
    clean = {key: round(_safe(value), 2) for key, value in categories.items()}
    total = round(sum(clean.values()), 2)
    return {
        "total_fcfa": total,
        "items": [
            {"key": key, "amount_fcfa": amount, "percentage": round(amount / total * 100, 1) if total else 0}
            for key, amount in clean.items()
            if amount > 0
        ],
    }


def build_donut_svg(items: list[dict], width: int = 300, height: int = 220) -> str:
    total = sum(_safe(item.get("amount_fcfa")) for item in items)
    if total <= 0 or not items:
        return ""
    cx, cy, radius, stroke = 100, 110, 66, 28
    colors = ["#059669", "#0f766e", "#94a3b8"]
    start = -pi / 2
    paths = []
    for index, item in enumerate(items):
        angle = _safe(item["amount_fcfa"]) / total * 2 * pi
        end = start + angle
        large = 1 if angle > pi else 0
        x1, y1 = cx + radius * cos(start), cy + radius * sin(start)
        x2, y2 = cx + radius * cos(end), cy + radius * sin(end)
        paths.append(
            f'<path d="M {x1:.2f} {y1:.2f} A {radius} {radius} 0 {large} 1 '
            f'{x2:.2f} {y2:.2f}" fill="none" stroke="{colors[index % len(colors)]}" '
            f'stroke-width="{stroke}"/>'
        )
        start = end
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img">'
        f'{"".join(paths)}<circle cx="{cx}" cy="{cy}" r="45" fill="white"/></svg>'
    )

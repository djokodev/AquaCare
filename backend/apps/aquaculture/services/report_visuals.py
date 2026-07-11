"""Pure, deterministic helpers used by cycle-report visualisations."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from html import escape
from math import cos, pi, sin


def _safe(value: object) -> float:
    try:
        number = float(value or 0)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, number)


def _average(values: list[tuple[float, float]]) -> float:
    weighted = sum(weight * count for weight, count in values if count > 0)
    counts = sum(count for _, count in values if count > 0)
    if counts:
        return weighted / counts
    return sum(weight for weight, _ in values) / len(values)


def _point(logs: list[dict], label: str, year: int, week: int) -> dict | None:
    values = []
    for log in logs:
        weight = _safe(log.get("average_weight"))
        count = _safe(log.get("sample_count"))
        total_weight = _safe(log.get("sample_total_weight"))
        if not weight and total_weight and count:
            weight = total_weight / count
        if weight:
            values.append((weight, count))
    if not values:
        return None
    return {"label": label, "value_g": round(_average(values), 2), "year": year, "week": week}


def aggregate_growth_points(
    logs: list[dict],
    report_type: str,
    period_start: date,
    period_end: date,
    labels: dict[str, str] | None = None,
) -> list[dict]:
    """Aggregate real weighing weeks, using sample-count weighting when possible."""
    labels = labels or {"previous": "Previous week", "current": "Covered week", "week": "Week"}
    dated = []
    for log in logs:
        try:
            log_date = date.fromisoformat(str(log.get("log_date")))
        except (TypeError, ValueError):
            continue
        if log_date <= period_end:
            dated.append((log_date, log))

    if report_type == "weekly":
        previous_start = period_start - timedelta(days=7)
        previous = [log for log_date, log in dated if previous_start <= log_date < period_start]
        current = [log for log_date, log in dated if period_start <= log_date <= period_end]
        previous_week = previous_start.isocalendar()
        current_week = period_start.isocalendar()
        points = []
        previous_point = _point(previous, labels["previous"], previous_week.year, previous_week.week)
        current_point = _point(current, labels["current"], current_week.year, current_week.week)
        if previous_point:
            points.append(previous_point)
        if current_point:
            points.append(current_point)
        return points

    buckets: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for log_date, log in dated:
        if period_start <= log_date <= period_end:
            iso = log_date.isocalendar()
            buckets[(iso.year, iso.week)].append(log)
    points = []
    for (year, week), bucket in sorted(buckets.items()):
        point = _point(bucket, f"{labels['week']} {week}", year, week)
        if point:
            points.append(point)
    return points


def build_growth_svg(points: list[dict], width: int = 520, height: int = 220) -> str:
    if not points:
        return ""
    left, bottom, chart_width, chart_height = 52, 35, width - 72, height - 60
    maximum = max(max(_safe(point["value_g"]) for point in points), 1)
    bar_width = min(72, chart_width / len(points) * 0.58)
    bars, labels = [], []
    for index, point in enumerate(points):
        x = left + (index + 0.5) * chart_width / len(points) - bar_width / 2
        bar_height = _safe(point["value_g"]) / maximum * chart_height
        y = height - bottom - bar_height
        label_x = x + bar_width / 2
        bars.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{bar_width:.1f}" height="{bar_height:.1f}" fill="#059669"/>')
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
            {"key": key, "amount_fcfa": amount, "percentage": round(amount / total * 100, 1)}
            for key, amount in clean.items()
            if amount > 0
        ],
    }


def build_donut_svg(
    items: list[dict],
    width: int = 300,
    height: int = 220,
    center_value: str = "",
    center_label: str = "",
) -> str:
    total = sum(_safe(item.get("amount_fcfa")) for item in items)
    if total <= 0 or not items:
        return ""
    cx, cy, radius, stroke = 100, 110, 66, 28
    colors = ["#059669", "#0f766e", "#94a3b8"]
    if len(items) == 1:
        paths = [f'<circle cx="{cx}" cy="{cy}" r="{radius}" fill="none" stroke="{colors[0]}" stroke-width="{stroke}"/>']
    else:
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
    center_text = (
        f'<text x="{cx}" y="{cy - 2}" text-anchor="middle" font-size="11">{escape(center_value)}</text>'
        f'<text x="{cx}" y="{cy + 12}" text-anchor="middle" font-size="7">{escape(center_label)}</text>'
        if center_value or center_label
        else ""
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img">'
        f'{"".join(paths)}<circle cx="{cx}" cy="{cy}" r="45" fill="white"/>{center_text}</svg>'
    )

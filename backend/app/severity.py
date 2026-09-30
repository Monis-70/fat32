from __future__ import annotations

from .fat32.constants import SEVERITIES, SEVERITY_ORDER


def severity_rank(severity: str) -> int:
    return SEVERITY_ORDER.get(severity, len(SEVERITIES))


def empty_severity_counts() -> dict[str, int]:
    return {name: 0 for name in SEVERITIES}

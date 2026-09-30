from __future__ import annotations

from dataclasses import dataclass, field

from .boot import Geometry
from .constants import MAX_RECOVERY_BYTES
from .fat import FatTable
from .image import ImageReader

RATING_HIGH = "high"
RATING_MEDIUM = "medium"
RATING_LOW = "low"
RATING_UNLIKELY = "unlikely"
RATING_NONE = "not_recoverable"

METHOD_CONTIGUOUS = "contiguous_run"
METHOD_PARTIAL = "partial_contiguous_run"


@dataclass
class RecoveryAssessment:
    recoverable: bool
    rating: str
    confidence: float
    reasons: list[str]
    method: str | None
    clusters: list[int] = field(default_factory=list)
    recoverable_bytes: int = 0


def _rate(confidence: float) -> str:
    if confidence >= 0.75:
        return RATING_HIGH
    if confidence >= 0.5:
        return RATING_MEDIUM
    if confidence >= 0.25:
        return RATING_LOW
    return RATING_UNLIKELY


def assess_deleted_entry(
    fat: FatTable,
    geometry: Geometry,
    first_cluster: int,
    size_bytes: int,
    is_directory: bool,
    long_name_valid: bool,
    has_long_name: bool,
    is_residual: bool,
) -> RecoveryAssessment:
    reasons: list[str] = []
    if is_directory:
        return RecoveryAssessment(
            recoverable=False,
            rating=RATING_NONE,
            confidence=0.0,
            reasons=["The entry is a directory, so no file content can be carved from it."],
            method=None,
        )
    if size_bytes == 0:
        return RecoveryAssessment(
            recoverable=False,
            rating=RATING_NONE,
            confidence=0.0,
            reasons=["The directory entry records a zero-byte length, so no content remains."],
            method=None,
        )
    if first_cluster == 0:
        return RecoveryAssessment(
            recoverable=False,
            rating=RATING_NONE,
            confidence=0.0,
            reasons=[
                "The starting cluster pointer was cleared during deletion, so the data location "
                "is unknown."
            ],
            method=None,
        )
    if not geometry.is_valid_cluster(first_cluster):
        return RecoveryAssessment(
            recoverable=False,
            rating=RATING_NONE,
            confidence=0.0,
            reasons=[
                f"Starting cluster {first_cluster} lies outside the valid data range "
                f"{geometry.first_cluster}-{geometry.last_cluster}."
            ],
            method=None,
        )
    if size_bytes > MAX_RECOVERY_BYTES:
        return RecoveryAssessment(
            recoverable=False,
            rating=RATING_NONE,
            confidence=0.0,
            reasons=[
                f"The recorded size of {size_bytes} bytes exceeds the recovery budget of "
                f"{MAX_RECOVERY_BYTES} bytes."
            ],
            method=None,
        )
    needed = -(-size_bytes // geometry.bytes_per_cluster)
    confidence = 0.35
    reasons.append(
        f"The directory entry still points at cluster {first_cluster} and records "
        f"{size_bytes} bytes, requiring {needed} clusters."
    )
    available: list[int] = []
    overwritten = 0
    out_of_range = 0
    for offset in range(needed):
        cluster = first_cluster + offset
        if not geometry.is_valid_cluster(cluster):
            out_of_range += 1
            break
        if fat.is_free(cluster):
            available.append(cluster)
        else:
            overwritten += 1
            break
    if out_of_range:
        reasons.append("The contiguous run extends past the last data cluster of the volume.")
        confidence -= 0.15
    if overwritten:
        reasons.append(
            f"Cluster {first_cluster + len(available)} has been re-allocated, so only the first "
            f"{len(available)} clusters survive."
        )
        confidence -= 0.2
    else:
        reasons.append("Every cluster in the expected contiguous run is still marked free.")
        confidence += 0.35
    if needed == 1:
        reasons.append("The file fits in a single cluster, so fragmentation cannot apply.")
        confidence += 0.12
    elif not overwritten and not out_of_range:
        reasons.append(
            "Contiguous allocation is assumed because FAT32 clears chain links on deletion."
        )
        confidence -= 0.05
    if has_long_name and long_name_valid:
        reasons.append("The long filename checksum validated, so the original name is confirmed.")
        confidence += 0.08
    elif has_long_name:
        reasons.append("A long filename was reconstructed but its checksum could not be validated.")
        confidence -= 0.05
    if is_residual:
        reasons.append(
            "The entry was found beyond the directory terminator, so metadata may be stale."
        )
        confidence -= 0.08
    if not available:
        return RecoveryAssessment(
            recoverable=False,
            rating=RATING_NONE,
            confidence=0.0,
            reasons=[*reasons, "No free clusters remain at the recorded start position."],
            method=None,
        )
    confidence = max(0.05, min(0.97, confidence))
    recoverable_bytes = min(size_bytes, len(available) * geometry.bytes_per_cluster)
    method = METHOD_CONTIGUOUS if len(available) >= needed else METHOD_PARTIAL
    return RecoveryAssessment(
        recoverable=True,
        rating=_rate(confidence),
        confidence=round(confidence, 3),
        reasons=reasons,
        method=method,
        clusters=available,
        recoverable_bytes=recoverable_bytes,
    )


def read_cluster_bytes(
    reader: ImageReader, geometry: Geometry, clusters: list[int], limit: int
) -> bytes:
    buffer = bytearray()
    remaining = min(limit, MAX_RECOVERY_BYTES)
    for cluster in clusters:
        if remaining <= 0:
            break
        take = min(remaining, geometry.bytes_per_cluster)
        buffer += reader.read(geometry.cluster_offset(cluster), take)
        remaining -= take
    return bytes(buffer)

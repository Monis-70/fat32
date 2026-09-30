from __future__ import annotations

import hashlib
import json
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...config import Settings
from ...db import get_db
from ...fat32.constants import MAX_RECOVERY_BYTES
from ...fat32.errors import Fat32Error
from ...fat32.image import ImageReader
from ...models import Analysis, Entry, Recovery, utcnow
from ...schemas import (
    RecoveryListResponse,
    RecoveryModel,
    RecoveryRequest,
    RecoveryResultResponse,
)
from ...services import parse_summary
from ...storage import recovery_target, sanitize_filename
from ..deps import get_completed_analysis, settings_dependency

router = APIRouter(prefix="/analyses", tags=["recovery"])


def _download_url(analysis_id: str, recovery_id: str) -> str:
    return f"/api/v1/analyses/{analysis_id}/recoveries/{recovery_id}/download"


def _to_model(row: Recovery) -> RecoveryModel:
    return RecoveryModel(
        id=row.id,
        entry_id=row.entry_id,
        entry_path=row.entry_path,
        filename=row.filename,
        size_bytes=row.size_bytes,
        declared_size_bytes=row.declared_size_bytes,
        confidence=row.confidence,
        rating=row.rating,
        method=row.method,
        sha256=row.sha256,
        cluster_runs=json.loads(row.cluster_runs or "[]"),
        truncated=row.truncated,
        created_at=row.created_at,
        download_url=_download_url(row.analysis_id, row.id),
    )


@router.post("/{analysis_id}/recover", response_model=RecoveryResultResponse)
def recover_entries(
    payload: RecoveryRequest,
    analysis: Analysis = Depends(get_completed_analysis),
    session: Session = Depends(get_db),
    settings: Settings = Depends(settings_dependency),
) -> RecoveryResultResponse:
    summary = parse_summary(analysis)
    geometry = summary.get("geometry", {})
    bytes_per_cluster = int(geometry.get("bytes_per_cluster") or 0)
    data_start = int(geometry.get("data_start_offset") or 0)
    if bytes_per_cluster <= 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "geometry_unavailable",
                "message": "Volume geometry is unavailable, so recovery cannot run.",
                "hint": None,
            },
        )
    image_path = Path(analysis.stored_path)
    if not image_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={
                "code": "evidence_unavailable",
                "message": "The stored evidence image is no longer available.",
                "hint": "Retention cleanup removes images once the analysis expires.",
            },
        )
    created: list[RecoveryModel] = []
    skipped: list[dict] = []
    try:
        reader = ImageReader(image_path)
    except Fat32Error as exc:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={"code": "evidence_unreadable", "message": exc.message, "hint": exc.hint},
        ) from exc
    try:
        for entry_id in dict.fromkeys(payload.entry_ids):
            entry = session.scalar(
                select(Entry).where(Entry.analysis_id == analysis.id, Entry.entry_id == entry_id)
            )
            if entry is None:
                skipped.append({"entry_id": entry_id, "reason": "Entry not found."})
                continue
            if not entry.recoverable:
                skipped.append(
                    {
                        "entry_id": entry_id,
                        "reason": "The entry is not eligible for recovery.",
                        "rating": entry.recovery_rating,
                    }
                )
                continue
            existing = session.scalar(
                select(Recovery).where(
                    Recovery.analysis_id == analysis.id, Recovery.entry_id == entry_id
                )
            )
            if existing is not None and Path(existing.stored_path).is_file():
                created.append(_to_model(existing))
                continue
            runs = json.loads(entry.recovery_cluster_runs or "[]")
            clusters: list[int] = []
            for run in runs:
                if len(run) == 2:
                    clusters.extend(range(run[0], run[0] + run[1]))
            if not clusters:
                skipped.append(
                    {"entry_id": entry_id, "reason": "No recoverable clusters were identified."}
                )
                continue
            limit = min(entry.size_bytes, len(clusters) * bytes_per_cluster, MAX_RECOVERY_BYTES)
            buffer = bytearray()
            for cluster in clusters:
                if len(buffer) >= limit:
                    break
                take = min(limit - len(buffer), bytes_per_cluster)
                buffer += reader.read(data_start + (cluster - 2) * bytes_per_cluster, take)
            data = bytes(buffer)
            recovery_id = str(uuid.uuid4())
            filename = sanitize_filename(entry.name, fallback=f"entry-{entry_id}.bin")
            target = recovery_target(settings, analysis.id, recovery_id, filename)
            target.write_bytes(data)
            record = Recovery(
                id=recovery_id,
                analysis_id=analysis.id,
                entry_id=entry_id,
                entry_path=entry.path,
                filename=filename,
                stored_path=str(target),
                size_bytes=len(data),
                declared_size_bytes=entry.size_bytes,
                confidence=entry.recovery_confidence,
                rating=entry.recovery_rating,
                method=entry.recovery_method or "contiguous_run",
                sha256=hashlib.sha256(data).hexdigest(),
                cluster_runs=entry.recovery_cluster_runs,
                truncated=len(data) < entry.size_bytes,
                created_at=utcnow(),
            )
            if existing is not None:
                session.delete(existing)
                session.flush()
            session.add(record)
            session.commit()
            session.refresh(record)
            created.append(_to_model(record))
    finally:
        reader.close()
    if not created and skipped:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "nothing_recovered",
                "message": "None of the selected entries could be recovered.",
                "hint": skipped[0].get("reason"),
                "skipped": skipped,
            },
        )
    return RecoveryResultResponse(created=created, skipped=skipped)


@router.get("/{analysis_id}/recoveries", response_model=RecoveryListResponse)
def list_recoveries(
    analysis: Analysis = Depends(get_completed_analysis),
    session: Session = Depends(get_db),
) -> RecoveryListResponse:
    rows = session.scalars(
        select(Recovery)
        .where(Recovery.analysis_id == analysis.id)
        .order_by(Recovery.created_at.desc())
    ).all()
    return RecoveryListResponse(items=[_to_model(row) for row in rows], total=len(rows))


@router.get("/{analysis_id}/recoveries/{recovery_id}/download")
def download_recovery(
    recovery_id: str,
    analysis: Analysis = Depends(get_completed_analysis),
    session: Session = Depends(get_db),
) -> FileResponse:
    record = session.scalar(
        select(Recovery).where(Recovery.analysis_id == analysis.id, Recovery.id == recovery_id)
    )
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "recovery_not_found",
                "message": "That recovered file does not exist.",
                "hint": None,
            },
        )
    path = Path(record.stored_path)
    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={
                "code": "recovery_file_missing",
                "message": "The recovered file has been removed from storage.",
                "hint": "Run the recovery again to regenerate it.",
            },
        )
    return FileResponse(
        path=path,
        media_type="application/octet-stream",
        filename=record.filename,
        headers={"X-Recovered-SHA256": record.sha256},
    )

from __future__ import annotations

import base64
import hashlib
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from ...db import get_db
from ...fat32.constants import (
    CLUSTER_STATES,
    MAX_HEX_READ_BYTES,
    MAX_PREVIEW_BYTES,
    SEVERITIES,
)
from ...fat32.errors import Fat32Error
from ...fat32.image import ImageReader
from ...models import Analysis, ClusterRangeRow, Entry, Finding
from ...schemas import (
    ClusterDetailResponse,
    ClusterMapResponse,
    ClusterRangeModel,
    EntryListResponse,
    EntryModel,
    FindingListResponse,
    FindingModel,
    GeometryResponse,
    HexResponse,
    PreviewResponse,
    SummaryResponse,
    TimelineResponse,
    TreeNodeModel,
    TreeResponse,
)
from ...services import analysis_to_dict, entry_to_dict, finding_to_dict, parse_summary
from ...severity import empty_severity_counts
from ..deps import get_completed_analysis

router = APIRouter(prefix="/analyses", tags=["analysis-views"])

SORTABLE_COLUMNS = {
    "name": Entry.name_lower,
    "path": Entry.path,
    "size": Entry.size_bytes,
    "created": Entry.created_at_fs,
    "modified": Entry.modified_at_fs,
    "accessed": Entry.accessed_at_fs,
    "cluster": Entry.first_cluster,
    "clusters": Entry.cluster_count,
    "entry_id": Entry.entry_id,
}

TEXT_EXTENSIONS = {
    "txt",
    "log",
    "csv",
    "json",
    "xml",
    "ini",
    "cfg",
    "sys",
    "md",
    "html",
    "htm",
    "rtf",
    "bat",
    "yml",
    "yaml",
}


def _image_reader(analysis: Analysis) -> ImageReader:
    path = Path(analysis.stored_path)
    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={
                "code": "evidence_unavailable",
                "message": "The stored evidence image is no longer available.",
                "hint": "Retention cleanup removes images once the analysis expires.",
            },
        )
    try:
        return ImageReader(path)
    except Fat32Error as exc:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={
                "code": "evidence_unreadable",
                "message": exc.message,
                "hint": exc.hint,
            },
        ) from exc


def _entry_or_404(session: Session, analysis_id: str, entry_id: int) -> Entry:
    row = session.scalar(
        select(Entry).where(Entry.analysis_id == analysis_id, Entry.entry_id == entry_id)
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "entry_not_found",
                "message": f"Entry {entry_id} does not exist in this analysis.",
                "hint": None,
            },
        )
    return row


def _expand_runs(runs: list[list[int]]) -> list[int]:
    clusters: list[int] = []
    for run in runs:
        if len(run) != 2:
            continue
        start, length = run
        clusters.extend(range(start, start + length))
    return clusters


@router.get("/{analysis_id}/summary", response_model=SummaryResponse)
def read_summary(
    analysis: Analysis = Depends(get_completed_analysis),
    session: Session = Depends(get_db),
) -> SummaryResponse:
    summary = parse_summary(analysis)
    return SummaryResponse(
        analysis=analysis_to_dict(session, analysis),
        image=summary.get("image", {}),
        boot_sector=summary.get("boot_sector", {}),
        boot_issues=summary.get("boot_issues", []),
        geometry=summary.get("geometry", {}),
        geometry_issues=summary.get("geometry_issues", []),
        backup_boot=summary.get("backup_boot", {}),
        fsinfo=summary.get("fsinfo", {}),
        fsinfo_free_delta=summary.get("fsinfo_free_delta"),
        fat=summary.get("fat", {}),
        cluster_state_counts=summary.get("cluster_state_counts", {}),
        stats=summary.get("stats", {}),
        volume_label_root=summary.get("volume_label_root"),
        truncated=summary.get("truncated", False),
        truncation_reasons=summary.get("truncation_reasons", []),
    )


@router.get("/{analysis_id}/geometry", response_model=GeometryResponse)
def read_geometry(analysis: Analysis = Depends(get_completed_analysis)) -> GeometryResponse:
    summary = parse_summary(analysis)
    image = summary.get("image", {})
    return GeometryResponse(
        geometry=summary.get("geometry", {}),
        geometry_issues=summary.get("geometry_issues", []),
        boot_sector=summary.get("boot_sector", {}),
        partitions=image.get("partitions", []),
        container=image.get("container", "raw_volume"),
        volume_offset=image.get("volume_offset", 0),
    )


def _apply_entry_filters(
    statement: Select[Any],
    search: str | None,
    entry_type: str,
    entry_status: str,
    parent_entry_id: int | None,
    extension: str | None,
    min_size: int | None,
    max_size: int | None,
) -> Select[Any]:
    if search:
        pattern = f"%{search.lower()}%"
        statement = statement.where(
            or_(
                Entry.name_lower.like(pattern),
                func.lower(Entry.path).like(pattern),
                func.lower(Entry.short_name).like(pattern),
            )
        )
    if entry_type == "file":
        statement = statement.where(Entry.is_directory.is_(False), Entry.is_volume_label.is_(False))
    elif entry_type == "directory":
        statement = statement.where(Entry.is_directory.is_(True))
    if entry_status == "deleted":
        statement = statement.where(Entry.is_deleted.is_(True))
    elif entry_status == "allocated":
        statement = statement.where(Entry.is_deleted.is_(False))
    elif entry_status == "hidden":
        statement = statement.where(or_(Entry.is_hidden.is_(True), Entry.is_system.is_(True)))
    elif entry_status == "fragmented":
        statement = statement.where(Entry.is_fragmented.is_(True))
    elif entry_status == "damaged":
        statement = statement.where(Entry.chain_status.notin_(["ok", "empty"]))
    elif entry_status == "slack":
        statement = statement.where(Entry.slack_nonzero.is_(True))
    elif entry_status == "recoverable":
        statement = statement.where(Entry.recoverable.is_(True))
    if parent_entry_id is not None:
        statement = statement.where(Entry.parent_entry_id == parent_entry_id)
    if extension:
        statement = statement.where(Entry.extension == extension.lower().lstrip("."))
    if min_size is not None:
        statement = statement.where(Entry.size_bytes >= min_size)
    if max_size is not None:
        statement = statement.where(Entry.size_bytes <= max_size)
    return statement


@router.get("/{analysis_id}/entries", response_model=EntryListResponse)
def list_entries(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
    search: str | None = Query(default=None, max_length=200),
    entry_type: str = Query(default="all", pattern="^(all|file|directory)$"),
    entry_status: str = Query(
        default="all",
        pattern="^(all|allocated|deleted|hidden|fragmented|damaged|slack|recoverable)$",
    ),
    parent_entry_id: int | None = Query(default=None, ge=1),
    extension: str | None = Query(default=None, max_length=16),
    min_size: int | None = Query(default=None, ge=0),
    max_size: int | None = Query(default=None, ge=0),
    sort: str = Query(default="path"),
    order: str = Query(default="asc", pattern="^(asc|desc)$"),
    analysis: Analysis = Depends(get_completed_analysis),
    session: Session = Depends(get_db),
) -> EntryListResponse:
    if sort not in SORTABLE_COLUMNS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "invalid_sort",
                "message": f"'{sort}' is not a sortable column.",
                "hint": f"Use one of {', '.join(sorted(SORTABLE_COLUMNS))}.",
            },
        )
    base = select(Entry).where(Entry.analysis_id == analysis.id)
    counter = select(func.count()).select_from(Entry).where(Entry.analysis_id == analysis.id)
    base = _apply_entry_filters(
        base, search, entry_type, entry_status, parent_entry_id, extension, min_size, max_size
    )
    counter = _apply_entry_filters(
        counter, search, entry_type, entry_status, parent_entry_id, extension, min_size, max_size
    )
    total = session.scalar(counter) or 0
    column = SORTABLE_COLUMNS[sort]
    ordering = column.desc() if order == "desc" else column.asc()
    rows = session.scalars(
        base.order_by(ordering, Entry.entry_id.asc())
        .limit(page_size)
        .offset((page - 1) * page_size)
    ).all()
    page_count = max(1, -(-total // page_size))
    return EntryListResponse(
        items=[EntryModel(**entry_to_dict(row)) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
        page_count=page_count,
    )


@router.get("/{analysis_id}/entries/{entry_id}", response_model=EntryModel)
def read_entry(
    entry_id: int,
    analysis: Analysis = Depends(get_completed_analysis),
    session: Session = Depends(get_db),
) -> EntryModel:
    return EntryModel(**entry_to_dict(_entry_or_404(session, analysis.id, entry_id)))


@router.get("/{analysis_id}/tree", response_model=TreeResponse)
def read_tree(
    parent_entry_id: int | None = Query(default=None, ge=1),
    include_deleted: bool = Query(default=True),
    analysis: Analysis = Depends(get_completed_analysis),
    session: Session = Depends(get_db),
) -> TreeResponse:
    statement = select(Entry).where(
        Entry.analysis_id == analysis.id,
        Entry.is_volume_label.is_(False),
    )
    if parent_entry_id is None:
        statement = statement.where(Entry.parent_entry_id.is_(None))
        parent_path = "/"
    else:
        parent = _entry_or_404(session, analysis.id, parent_entry_id)
        parent_path = parent.path
        statement = statement.where(Entry.parent_entry_id == parent_entry_id)
    if not include_deleted:
        statement = statement.where(Entry.is_deleted.is_(False))
    rows = session.scalars(
        statement.order_by(Entry.is_directory.desc(), Entry.name_lower.asc())
    ).all()
    directory_ids = {row.entry_id for row in rows if row.is_directory}
    populated: set[int] = set()
    if directory_ids:
        populated = {
            value
            for (value,) in session.execute(
                select(Entry.parent_entry_id)
                .where(
                    Entry.analysis_id == analysis.id,
                    Entry.parent_entry_id.in_(directory_ids),
                )
                .group_by(Entry.parent_entry_id)
            ).all()
            if value is not None
        }
    return TreeResponse(
        parent_entry_id=parent_entry_id,
        parent_path=parent_path,
        items=[
            TreeNodeModel(
                entry_id=row.entry_id,
                name=row.name,
                path=row.path,
                is_directory=row.is_directory,
                is_deleted=row.is_deleted,
                is_hidden=row.is_hidden,
                is_system=row.is_system,
                size_bytes=row.size_bytes,
                child_count=row.child_count,
                has_children=row.entry_id in populated,
                chain_status=row.chain_status,
            )
            for row in rows
        ],
    )


@router.get("/{analysis_id}/findings", response_model=FindingListResponse)
def list_findings(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    severity: str | None = Query(default=None),
    category: str | None = Query(default=None, max_length=32),
    search: str | None = Query(default=None, max_length=200),
    analysis: Analysis = Depends(get_completed_analysis),
    session: Session = Depends(get_db),
) -> FindingListResponse:
    severities: list[str] = []
    if severity:
        severities = [item.strip() for item in severity.split(",") if item.strip()]
        invalid = [item for item in severities if item not in SEVERITIES]
        if invalid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "invalid_severity",
                    "message": f"Unknown severity filter: {', '.join(invalid)}.",
                    "hint": f"Use one of {', '.join(SEVERITIES)}.",
                },
            )
    base = select(Finding).where(Finding.analysis_id == analysis.id)
    counter = select(func.count()).select_from(Finding).where(Finding.analysis_id == analysis.id)
    if severities:
        base = base.where(Finding.severity.in_(severities))
        counter = counter.where(Finding.severity.in_(severities))
    if category:
        base = base.where(Finding.category == category)
        counter = counter.where(Finding.category == category)
    if search:
        pattern = f"%{search.lower()}%"
        condition = or_(
            func.lower(Finding.title).like(pattern),
            func.lower(Finding.description).like(pattern),
            func.lower(Finding.code).like(pattern),
        )
        base = base.where(condition)
        counter = counter.where(condition)
    total = session.scalar(counter) or 0
    rows = session.scalars(
        base.order_by(Finding.severity_rank.asc(), Finding.id.asc())
        .limit(page_size)
        .offset((page - 1) * page_size)
    ).all()
    severity_counts = empty_severity_counts()
    for value, count in session.execute(
        select(Finding.severity, func.count())
        .where(Finding.analysis_id == analysis.id)
        .group_by(Finding.severity)
    ).all():
        if value in severity_counts:
            severity_counts[value] = count
    category_counts = dict(
        session.execute(
            select(Finding.category, func.count())
            .where(Finding.analysis_id == analysis.id)
            .group_by(Finding.category)
        ).all()
    )
    return FindingListResponse(
        items=[FindingModel(**finding_to_dict(row)) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
        page_count=max(1, -(-total // page_size)),
        severity_counts=severity_counts,
        category_counts=category_counts,
    )


@router.get("/{analysis_id}/clusters", response_model=ClusterMapResponse)
def read_cluster_map(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=6000, ge=1, le=40000),
    state: str | None = Query(default=None),
    analysis: Analysis = Depends(get_completed_analysis),
    session: Session = Depends(get_db),
) -> ClusterMapResponse:
    summary = parse_summary(analysis)
    geometry = summary.get("geometry", {})
    base = select(ClusterRangeRow).where(ClusterRangeRow.analysis_id == analysis.id)
    counter = (
        select(func.count())
        .select_from(ClusterRangeRow)
        .where(ClusterRangeRow.analysis_id == analysis.id)
    )
    if state:
        states = [item.strip() for item in state.split(",") if item.strip()]
        invalid = [item for item in states if item not in CLUSTER_STATES]
        if invalid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "invalid_cluster_state",
                    "message": f"Unknown cluster state: {', '.join(invalid)}.",
                    "hint": f"Use one of {', '.join(CLUSTER_STATES)}.",
                },
            )
        base = base.where(ClusterRangeRow.state.in_(states))
        counter = counter.where(ClusterRangeRow.state.in_(states))
    total = session.scalar(counter) or 0
    rows = session.scalars(
        base.order_by(ClusterRangeRow.start_cluster.asc()).limit(limit).offset(offset)
    ).all()
    return ClusterMapResponse(
        cluster_count=geometry.get("cluster_count", 0),
        bytes_per_cluster=geometry.get("bytes_per_cluster", 0),
        first_cluster=geometry.get("first_cluster", 2),
        last_cluster=geometry.get("last_cluster", 0),
        data_start_offset=geometry.get("data_start_offset", 0),
        state_counts=summary.get("cluster_state_counts", {}),
        total_ranges=total,
        offset=offset,
        limit=limit,
        ranges=[
            ClusterRangeModel(
                start=row.start_cluster,
                end=row.end_cluster,
                length=row.end_cluster - row.start_cluster + 1,
                state=row.state,
                entry_id=row.entry_id,
            )
            for row in rows
        ],
    )


@router.get("/{analysis_id}/clusters/{cluster}", response_model=ClusterDetailResponse)
def read_cluster(
    cluster: int,
    analysis: Analysis = Depends(get_completed_analysis),
    session: Session = Depends(get_db),
) -> ClusterDetailResponse:
    summary = parse_summary(analysis)
    geometry = summary.get("geometry", {})
    row = session.scalar(
        select(ClusterRangeRow).where(
            ClusterRangeRow.analysis_id == analysis.id,
            ClusterRangeRow.start_cluster <= cluster,
            ClusterRangeRow.end_cluster >= cluster,
        )
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "cluster_not_found",
                "message": f"Cluster {cluster} is outside the data region of this volume.",
                "hint": f"Valid clusters run from 2 to {geometry.get('last_cluster', 0)}.",
            },
        )
    entry_model = None
    if row.entry_id is not None:
        entry = session.scalar(
            select(Entry).where(Entry.analysis_id == analysis.id, Entry.entry_id == row.entry_id)
        )
        if entry is not None:
            entry_model = EntryModel(**entry_to_dict(entry))
    bytes_per_cluster = geometry.get("bytes_per_cluster", 0)
    data_start = geometry.get("data_start_offset", 0)
    return ClusterDetailResponse(
        cluster=cluster,
        state=row.state,
        offset=data_start + (cluster - 2) * bytes_per_cluster,
        size_bytes=bytes_per_cluster,
        entry=entry_model,
        range_start=row.start_cluster,
        range_end=row.end_cluster,
    )


@router.get("/{analysis_id}/timeline", response_model=TimelineResponse)
def read_timeline(
    granularity: str = Query(default="day", pattern="^(hour|day|month)$"),
    kinds: str = Query(default="created,modified,accessed"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
    analysis: Analysis = Depends(get_completed_analysis),
    session: Session = Depends(get_db),
) -> TimelineResponse:
    requested = [item.strip() for item in kinds.split(",") if item.strip()]
    allowed = {"created", "modified", "accessed"}
    invalid = [item for item in requested if item not in allowed]
    if invalid or not requested:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "invalid_timeline_kind",
                "message": "Timeline kinds must be created, modified or accessed.",
                "hint": f"Received '{kinds}'.",
            },
        )
    width = {"hour": 13, "day": 10, "month": 7}[granularity]
    columns = {
        "created": Entry.created_at_fs,
        "modified": Entry.modified_at_fs,
        "accessed": Entry.accessed_at_fs,
    }
    buckets: dict[str, dict[str, int]] = {}
    events: list[dict[str, Any]] = []
    for kind in requested:
        column = columns[kind]
        rows = session.execute(
            select(func.substr(column, 1, width), func.count())
            .where(Entry.analysis_id == analysis.id, column.is_not(None))
            .group_by(func.substr(column, 1, width))
        ).all()
        for bucket, count in rows:
            slot = buckets.setdefault(
                bucket, {"created": 0, "modified": 0, "accessed": 0, "total": 0}
            )
            slot[kind] += count
            slot["total"] += count
        detail = session.execute(
            select(
                Entry.entry_id,
                Entry.path,
                Entry.name,
                column,
                Entry.is_directory,
                Entry.is_deleted,
                Entry.size_bytes,
            ).where(Entry.analysis_id == analysis.id, column.is_not(None))
        ).all()
        for entry_id, path, name, timestamp, is_directory, is_deleted, size_bytes in detail:
            events.append(
                {
                    "entry_id": entry_id,
                    "path": path,
                    "name": name,
                    "kind": kind,
                    "timestamp": timestamp,
                    "is_directory": bool(is_directory),
                    "is_deleted": bool(is_deleted),
                    "size_bytes": size_bytes,
                }
            )
    events.sort(key=lambda item: (item["timestamp"], item["entry_id"], item["kind"]))
    total_events = len(events)
    start = (page - 1) * page_size
    return TimelineResponse(
        granularity=granularity,
        buckets=[
            {
                "bucket": key,
                "created": value["created"],
                "modified": value["modified"],
                "accessed": value["accessed"],
                "total": value["total"],
            }
            for key, value in sorted(buckets.items())
        ],
        events=events[start : start + page_size],
        total_events=total_events,
        page=page,
        page_size=page_size,
        page_count=max(1, -(-total_events // page_size)),
        earliest=events[0]["timestamp"] if events else None,
        latest=events[-1]["timestamp"] if events else None,
    )


@router.get("/{analysis_id}/hex", response_model=HexResponse)
def read_hex(
    offset: int = Query(default=0, ge=0),
    length: int = Query(default=1024, ge=1, le=MAX_HEX_READ_BYTES),
    analysis: Analysis = Depends(get_completed_analysis),
) -> HexResponse:
    reader = _image_reader(analysis)
    try:
        if offset >= reader.size:
            raise HTTPException(
                status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
                detail={
                    "code": "offset_out_of_range",
                    "message": f"Offset {offset} is beyond the end of the image.",
                    "hint": f"The image contains {reader.size} bytes.",
                },
            )
        data = reader.read(offset, length)
        return HexResponse(
            offset=offset,
            length=len(data),
            image_size=reader.size,
            bytes_base64=base64.b64encode(data).decode("ascii"),
            sha256=hashlib.sha256(data).hexdigest(),
            truncated=len(data) < length,
        )
    finally:
        reader.close()


@router.get("/{analysis_id}/entries/{entry_id}/preview", response_model=PreviewResponse)
def read_preview(
    entry_id: int,
    analysis: Analysis = Depends(get_completed_analysis),
    session: Session = Depends(get_db),
) -> PreviewResponse:
    entry = _entry_or_404(session, analysis.id, entry_id)
    summary = parse_summary(analysis)
    geometry = summary.get("geometry", {})
    bytes_per_cluster = geometry.get("bytes_per_cluster", 0)
    data_start = geometry.get("data_start_offset", 0)
    payload = entry_to_dict(entry)
    runs = payload["cluster_runs"] or payload["recovery_cluster_runs"]
    if entry.is_directory:
        return PreviewResponse(
            entry_id=entry_id,
            name=entry.name,
            kind="unavailable",
            reason="Directories do not have file content to preview.",
            encoding=None,
            bytes_read=0,
            size_bytes=entry.size_bytes,
            text=None,
            bytes_base64=None,
            data_offset=entry.data_offset,
        )
    if entry.size_bytes == 0:
        return PreviewResponse(
            entry_id=entry_id,
            name=entry.name,
            kind="empty",
            reason="The directory entry records a zero-byte length.",
            encoding=None,
            bytes_read=0,
            size_bytes=0,
            text=None,
            bytes_base64=None,
            data_offset=entry.data_offset,
        )
    if not runs:
        return PreviewResponse(
            entry_id=entry_id,
            name=entry.name,
            kind="unavailable",
            reason="No cluster chain is available for this entry.",
            encoding=None,
            bytes_read=0,
            size_bytes=entry.size_bytes,
            text=None,
            bytes_base64=None,
            data_offset=entry.data_offset,
        )
    reader = _image_reader(analysis)
    try:
        clusters = _expand_runs(runs)
        limit = min(entry.size_bytes, MAX_PREVIEW_BYTES)
        buffer = bytearray()
        for cluster in clusters:
            if len(buffer) >= limit:
                break
            take = min(limit - len(buffer), bytes_per_cluster)
            buffer += reader.read(data_start + (cluster - 2) * bytes_per_cluster, take)
        data = bytes(buffer)
    finally:
        reader.close()
    printable = sum(1 for byte in data if byte in (9, 10, 13) or 0x20 <= byte < 0x7F)
    ratio = printable / len(data) if data else 0
    looks_text = entry.extension in TEXT_EXTENSIONS or ratio > 0.9
    if looks_text and data:
        return PreviewResponse(
            entry_id=entry_id,
            name=entry.name,
            kind="text",
            reason=None,
            encoding="utf-8",
            bytes_read=len(data),
            size_bytes=entry.size_bytes,
            text=data.decode("utf-8", "replace"),
            bytes_base64=None,
            data_offset=entry.data_offset,
        )
    return PreviewResponse(
        entry_id=entry_id,
        name=entry.name,
        kind="binary",
        reason="The content is not printable text and is shown as raw bytes.",
        encoding=None,
        bytes_read=len(data),
        size_bytes=entry.size_bytes,
        text=None,
        bytes_base64=base64.b64encode(data).decode("ascii"),
        data_offset=entry.data_offset,
    )

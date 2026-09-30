from __future__ import annotations

import json
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Analysis, Entry, Finding
from .severity import empty_severity_counts


def _loads(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def parse_summary(analysis: Analysis) -> dict[str, Any]:
    return _loads(analysis.summary_json, {})


def severity_counts_for(session: Session, analysis_id: str) -> dict[str, int]:
    counts = empty_severity_counts()
    rows = session.execute(
        select(Finding.severity, func.count())
        .where(Finding.analysis_id == analysis_id)
        .group_by(Finding.severity)
    ).all()
    for severity, total in rows:
        if severity in counts:
            counts[severity] = total
    return counts


def entry_to_dict(row: Entry) -> dict[str, Any]:
    return {
        "entry_id": row.entry_id,
        "parent_entry_id": row.parent_entry_id,
        "depth": row.depth,
        "path": row.path,
        "parent_path": row.parent_path,
        "name": row.name,
        "short_name": row.short_name,
        "long_name": row.long_name,
        "long_name_valid": row.long_name_valid,
        "long_name_entries": row.long_name_entries,
        "recovered_first_char": row.recovered_first_char,
        "extension": row.extension,
        "is_directory": row.is_directory,
        "is_deleted": row.is_deleted,
        "is_volume_label": row.is_volume_label,
        "is_residual": row.is_residual,
        "is_hidden": row.is_hidden,
        "is_system": row.is_system,
        "is_read_only": row.is_read_only,
        "is_archive": row.is_archive,
        "attributes": row.attributes,
        "attribute_list": _loads(row.attribute_list, []),
        "first_cluster": row.first_cluster,
        "size_bytes": row.size_bytes,
        "allocated_bytes": row.allocated_bytes,
        "cluster_count": row.cluster_count,
        "fragment_count": row.fragment_count,
        "is_fragmented": row.is_fragmented,
        "chain_status": row.chain_status,
        "cluster_runs": _loads(row.cluster_runs, []),
        "chain_complete": row.chain_complete,
        "slack_bytes": row.slack_bytes,
        "slack_nonzero": row.slack_nonzero,
        "slack_preview": row.slack_preview,
        "data_offset": row.data_offset,
        "directory_entry_offset": row.directory_entry_offset,
        "created_at": row.created_at_fs,
        "modified_at": row.modified_at_fs,
        "accessed_at": row.accessed_at_fs,
        "content_sha256": row.content_sha256,
        "child_count": row.child_count,
        "recoverable": row.recoverable,
        "recovery_rating": row.recovery_rating,
        "recovery_confidence": row.recovery_confidence,
        "recovery_reasons": _loads(row.recovery_reasons, []),
        "recovery_method": row.recovery_method,
        "recovery_cluster_runs": _loads(row.recovery_cluster_runs, []),
        "recovery_cluster_count": row.recovery_cluster_count,
        "issues": _loads(row.issues, []),
    }


def finding_to_dict(row: Finding) -> dict[str, Any]:
    return {
        "id": row.id,
        "code": row.code,
        "title": row.title,
        "severity": row.severity,
        "category": row.category,
        "description": row.description,
        "recommendation": row.recommendation,
        "entry_id": row.entry_id,
        "entry_path": row.entry_path,
        "cluster": row.cluster,
        "details": _loads(row.details, {}),
    }


def analysis_to_dict(session: Session, analysis: Analysis) -> dict[str, Any]:
    entry_count = (
        session.scalar(select(func.count()).select_from(Entry).where(Entry.analysis_id == analysis.id))
        or 0
    )
    finding_count = (
        session.scalar(
            select(func.count()).select_from(Finding).where(Finding.analysis_id == analysis.id)
        )
        or 0
    )
    return {
        "id": analysis.id,
        "original_filename": analysis.original_filename,
        "size_bytes": analysis.size_bytes,
        "image_sha256": analysis.image_sha256,
        "is_demo": analysis.is_demo,
        "status": analysis.status,
        "progress": analysis.progress,
        "stage": analysis.stage,
        "error_message": analysis.error_message,
        "error_hint": analysis.error_hint,
        "case_id": analysis.case_id,
        "examiner": analysis.examiner,
        "evidence_number": analysis.evidence_number,
        "acquired_at": analysis.acquired_at,
        "notes": analysis.notes,
        "created_at": analysis.created_at,
        "updated_at": analysis.updated_at,
        "started_at": analysis.started_at,
        "completed_at": analysis.completed_at,
        "expires_at": analysis.expires_at,
        "duration_ms": analysis.duration_ms,
        "entry_count": entry_count,
        "finding_count": finding_count,
        "severity_counts": severity_counts_for(session, analysis.id),
    }


def build_report_payload(session: Session, analysis: Analysis) -> dict[str, Any]:
    summary = parse_summary(analysis)
    entries = session.scalars(
        select(Entry).where(Entry.analysis_id == analysis.id).order_by(Entry.entry_id)
    ).all()
    findings = session.scalars(
        select(Finding)
        .where(Finding.analysis_id == analysis.id)
        .order_by(Finding.severity_rank, Finding.id)
    ).all()
    return {
        "generator": "FATScope",
        "report_version": "1.0",
        "analysis": analysis_to_dict(session, analysis),
        "volume": summary,
        "entries": [entry_to_dict(row) for row in entries],
        "findings": [finding_to_dict(row) for row in findings],
    }

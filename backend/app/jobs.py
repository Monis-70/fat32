from __future__ import annotations

import json
import time
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import asdict
from typing import Any

from sqlalchemy import delete, insert

from .config import Settings, get_settings
from .db import session_scope
from .fat32.analyzer import AnalysisResult, Fat32Analyzer
from .fat32.errors import Fat32Error
from .models import (
    STATUS_COMPLETED,
    STATUS_FAILED,
    STATUS_RUNNING,
    Analysis,
    ClusterRangeRow,
    Entry,
    Finding,
    utcnow,
)
from .severity import severity_rank

_executor: ThreadPoolExecutor | None = None
_pending: dict[str, Future] = {}
PROGRESS_INTERVAL_SECONDS = 0.35


def get_executor() -> ThreadPoolExecutor:
    global _executor
    if _executor is None:
        _executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="fatscope-analysis")
    return _executor


def shutdown_executor() -> None:
    global _executor
    if _executor is not None:
        _executor.shutdown(wait=False, cancel_futures=True)
        _executor = None
    _pending.clear()


def submit_analysis(analysis_id: str) -> None:
    future = get_executor().submit(run_analysis, analysis_id)
    _pending[analysis_id] = future
    future.add_done_callback(lambda _: _pending.pop(analysis_id, None))


def _update_progress(analysis_id: str, progress: int, stage: str) -> None:
    with session_scope() as session:
        analysis = session.get(Analysis, analysis_id)
        if analysis is None:
            return
        analysis.progress = max(analysis.progress, progress)
        analysis.stage = stage
        analysis.updated_at = utcnow()


def _entry_rows(analysis_id: str, result: AnalysisResult) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for record in result.entries:
        rows.append(
            {
                "analysis_id": analysis_id,
                "entry_id": record.entry_id,
                "parent_entry_id": record.parent_entry_id,
                "depth": record.depth,
                "path": record.path,
                "parent_path": record.parent_path,
                "name": record.name,
                "name_lower": record.name.lower(),
                "short_name": record.short_name,
                "long_name": record.long_name,
                "long_name_valid": record.long_name_valid,
                "long_name_entries": record.long_name_entries,
                "recovered_first_char": record.recovered_first_char,
                "extension": record.extension,
                "is_directory": record.is_directory,
                "is_deleted": record.is_deleted,
                "is_volume_label": record.is_volume_label,
                "is_residual": record.is_residual,
                "is_hidden": record.is_hidden,
                "is_system": record.is_system,
                "is_read_only": record.is_read_only,
                "is_archive": record.is_archive,
                "attributes": record.attributes,
                "attribute_list": json.dumps(record.attribute_list),
                "first_cluster": record.first_cluster,
                "size_bytes": record.size_bytes,
                "allocated_bytes": record.allocated_bytes,
                "cluster_count": record.cluster_count,
                "fragment_count": record.fragment_count,
                "is_fragmented": record.is_fragmented,
                "chain_status": record.chain_status,
                "cluster_runs": json.dumps(record.cluster_runs),
                "chain_complete": record.chain_complete,
                "slack_bytes": record.slack_bytes,
                "slack_nonzero": record.slack_nonzero,
                "slack_preview": record.slack_preview,
                "data_offset": record.data_offset,
                "directory_entry_offset": record.directory_entry_offset,
                "created_at_fs": record.created_at,
                "modified_at_fs": record.modified_at,
                "accessed_at_fs": record.accessed_at,
                "content_sha256": record.content_sha256,
                "child_count": record.child_count,
                "recoverable": record.recoverable,
                "recovery_rating": record.recovery_rating,
                "recovery_confidence": record.recovery_confidence,
                "recovery_reasons": json.dumps(record.recovery_reasons),
                "recovery_method": record.recovery_method,
                "recovery_cluster_runs": json.dumps(record.recovery_cluster_runs),
                "recovery_cluster_count": record.recovery_cluster_count,
                "issues": json.dumps(record.issues),
            }
        )
    return rows


def _finding_rows(analysis_id: str, result: AnalysisResult) -> list[dict[str, Any]]:
    return [
        {
            "analysis_id": analysis_id,
            "code": finding.code,
            "title": finding.title,
            "severity": finding.severity,
            "severity_rank": severity_rank(finding.severity),
            "category": finding.category,
            "description": finding.description,
            "recommendation": finding.recommendation,
            "entry_id": finding.entry_id,
            "entry_path": finding.entry_path,
            "cluster": finding.cluster,
            "details": json.dumps(finding.details, default=str),
        }
        for finding in result.findings
    ]


def _cluster_rows(analysis_id: str, result: AnalysisResult) -> list[dict[str, Any]]:
    return [
        {
            "analysis_id": analysis_id,
            "start_cluster": item.start,
            "end_cluster": item.end,
            "state": item.state,
            "entry_id": item.entry_id,
        }
        for item in result.cluster_ranges
    ]


def _chunked(rows: list[dict[str, Any]], size: int = 800):
    for index in range(0, len(rows), size):
        yield rows[index : index + size]


def persist_result(analysis_id: str, result: AnalysisResult, duration_ms: int) -> None:
    with session_scope() as session:
        session.execute(delete(Entry).where(Entry.analysis_id == analysis_id))
        session.execute(delete(Finding).where(Finding.analysis_id == analysis_id))
        session.execute(delete(ClusterRangeRow).where(ClusterRangeRow.analysis_id == analysis_id))
        for chunk in _chunked(_entry_rows(analysis_id, result)):
            session.execute(insert(Entry), chunk)
        for chunk in _chunked(_finding_rows(analysis_id, result)):
            session.execute(insert(Finding), chunk)
        for chunk in _chunked(_cluster_rows(analysis_id, result)):
            session.execute(insert(ClusterRangeRow), chunk)
        analysis = session.get(Analysis, analysis_id)
        if analysis is None:
            return
        analysis.status = STATUS_COMPLETED
        analysis.progress = 100
        analysis.stage = "Analysis complete"
        analysis.error_message = None
        analysis.error_hint = None
        analysis.image_sha256 = result.image_sha256
        analysis.size_bytes = result.image_size_bytes
        analysis.summary_json = json.dumps(result.summary(), default=str)
        analysis.completed_at = utcnow()
        analysis.updated_at = utcnow()
        analysis.duration_ms = duration_ms


def mark_failed(analysis_id: str, message: str, hint: str | None) -> None:
    with session_scope() as session:
        analysis = session.get(Analysis, analysis_id)
        if analysis is None:
            return
        analysis.status = STATUS_FAILED
        analysis.stage = "Analysis failed"
        analysis.error_message = message
        analysis.error_hint = hint
        analysis.completed_at = utcnow()
        analysis.updated_at = utcnow()


def run_analysis(analysis_id: str, settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    started = time.perf_counter()
    with session_scope() as session:
        analysis = session.get(Analysis, analysis_id)
        if analysis is None:
            return
        analysis.status = STATUS_RUNNING
        analysis.stage = "Preparing evidence image"
        analysis.progress = 1
        analysis.started_at = utcnow()
        analysis.updated_at = utcnow()
        stored_path = analysis.stored_path
    last_emit = 0.0

    def on_progress(value: int, stage: str) -> None:
        nonlocal last_emit
        now = time.perf_counter()
        if value >= 98 or now - last_emit >= PROGRESS_INTERVAL_SECONDS:
            last_emit = now
            _update_progress(analysis_id, value, stage)

    try:
        result = Fat32Analyzer(stored_path, on_progress).run()
    except Fat32Error as exc:
        mark_failed(analysis_id, exc.message, exc.hint)
        return
    except MemoryError:
        mark_failed(
            analysis_id,
            "The image required more memory than this service allows.",
            "Split the evidence image into smaller volumes before analysing it.",
        )
        return
    except Exception as exc:
        mark_failed(
            analysis_id,
            "The parser stopped with an unexpected error while reading the image.",
            f"{type(exc).__name__}: {exc}",
        )
        return
    duration_ms = int((time.perf_counter() - started) * 1000)
    persist_result(analysis_id, result, duration_ms)


def result_to_payload(result: AnalysisResult) -> dict[str, Any]:
    return {
        "summary": result.summary(),
        "entries": [record.to_dict() for record in result.entries],
        "findings": [finding.to_dict() for finding in result.findings],
        "cluster_ranges": [item.to_dict() for item in result.cluster_ranges],
        "partitions": [asdict(item) for item in result.partitions],
    }

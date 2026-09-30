from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    version: str
    api_version: str
    server_time: datetime
    uptime_seconds: float
    database: Literal["ok", "unavailable"]


class LimitsModel(BaseModel):
    max_upload_bytes: int
    max_upload_mb: int
    analysis_ttl_hours: int
    max_hex_read_bytes: int
    max_preview_bytes: int
    max_entries: int
    max_clusters: int


class MetaResponse(BaseModel):
    name: str
    description: str
    version: str
    api_version: str
    read_only: bool
    supported_extensions: list[str]
    supported_containers: list[str]
    limits: LimitsModel
    demo_image: dict[str, Any]
    severities: list[str]
    cluster_states: list[str]


class EvidenceMetadata(BaseModel):
    case_id: str | None = Field(default=None, max_length=120)
    examiner: str | None = Field(default=None, max_length=120)
    evidence_number: str | None = Field(default=None, max_length=120)
    acquired_at: str | None = Field(default=None, max_length=40)
    notes: str | None = Field(default=None, max_length=2000)


class AnalysisStatusResponse(BaseModel):
    id: str
    status: str
    progress: int
    stage: str
    error_message: str | None
    error_hint: str | None
    updated_at: datetime
    expires_at: datetime


class AnalysisSummaryModel(BaseModel):
    id: str
    original_filename: str
    size_bytes: int
    image_sha256: str | None
    is_demo: bool
    status: str
    progress: int
    stage: str
    error_message: str | None
    error_hint: str | None
    case_id: str | None
    examiner: str | None
    evidence_number: str | None
    acquired_at: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    expires_at: datetime
    duration_ms: int | None
    entry_count: int
    finding_count: int
    severity_counts: dict[str, int]


class AnalysisListResponse(BaseModel):
    items: list[AnalysisSummaryModel]
    total: int
    limit: int
    offset: int


class SummaryResponse(BaseModel):
    analysis: AnalysisSummaryModel
    image: dict[str, Any]
    boot_sector: dict[str, Any]
    boot_issues: list[str]
    geometry: dict[str, Any]
    geometry_issues: list[str]
    backup_boot: dict[str, Any]
    fsinfo: dict[str, Any]
    fsinfo_free_delta: int | None
    fat: dict[str, Any]
    cluster_state_counts: dict[str, int]
    stats: dict[str, Any]
    volume_label_root: str | None
    truncated: bool
    truncation_reasons: list[str]


class GeometryResponse(BaseModel):
    geometry: dict[str, Any]
    geometry_issues: list[str]
    boot_sector: dict[str, Any]
    partitions: list[dict[str, Any]]
    container: str
    volume_offset: int


class EntryModel(BaseModel):
    entry_id: int
    parent_entry_id: int | None
    depth: int
    path: str
    parent_path: str
    name: str
    short_name: str
    long_name: str | None
    long_name_valid: bool
    long_name_entries: int
    recovered_first_char: str | None
    extension: str
    is_directory: bool
    is_deleted: bool
    is_volume_label: bool
    is_residual: bool
    is_hidden: bool
    is_system: bool
    is_read_only: bool
    is_archive: bool
    attributes: int
    attribute_list: list[str]
    first_cluster: int
    size_bytes: int
    allocated_bytes: int
    cluster_count: int
    fragment_count: int
    is_fragmented: bool
    chain_status: str
    cluster_runs: list[list[int]]
    chain_complete: bool
    slack_bytes: int
    slack_nonzero: bool
    slack_preview: str | None
    data_offset: int | None
    directory_entry_offset: int
    created_at: str | None
    modified_at: str | None
    accessed_at: str | None
    content_sha256: str | None
    child_count: int
    recoverable: bool
    recovery_rating: str
    recovery_confidence: float
    recovery_reasons: list[str]
    recovery_method: str | None
    recovery_cluster_runs: list[list[int]]
    recovery_cluster_count: int
    issues: list[str]


class EntryListResponse(BaseModel):
    items: list[EntryModel]
    total: int
    page: int
    page_size: int
    page_count: int


class TreeNodeModel(BaseModel):
    entry_id: int
    name: str
    path: str
    is_directory: bool
    is_deleted: bool
    is_hidden: bool
    is_system: bool
    size_bytes: int
    child_count: int
    has_children: bool
    chain_status: str


class TreeResponse(BaseModel):
    parent_entry_id: int | None
    parent_path: str
    items: list[TreeNodeModel]


class FindingModel(BaseModel):
    id: int
    code: str
    title: str
    severity: str
    category: str
    description: str
    recommendation: str
    entry_id: int | None
    entry_path: str | None
    cluster: int | None
    details: dict[str, Any]


class FindingListResponse(BaseModel):
    items: list[FindingModel]
    total: int
    page: int
    page_size: int
    page_count: int
    severity_counts: dict[str, int]
    category_counts: dict[str, int]


class ClusterRangeModel(BaseModel):
    start: int
    end: int
    length: int
    state: str
    entry_id: int | None


class ClusterMapResponse(BaseModel):
    cluster_count: int
    bytes_per_cluster: int
    first_cluster: int
    last_cluster: int
    data_start_offset: int
    state_counts: dict[str, int]
    total_ranges: int
    offset: int
    limit: int
    ranges: list[ClusterRangeModel]


class ClusterDetailResponse(BaseModel):
    cluster: int
    state: str
    offset: int
    size_bytes: int
    entry: EntryModel | None
    range_start: int
    range_end: int


class TimelineBucketModel(BaseModel):
    bucket: str
    created: int
    modified: int
    accessed: int
    total: int


class TimelineEventModel(BaseModel):
    entry_id: int
    path: str
    name: str
    kind: str
    timestamp: str
    is_directory: bool
    is_deleted: bool
    size_bytes: int


class TimelineResponse(BaseModel):
    granularity: str
    buckets: list[TimelineBucketModel]
    events: list[TimelineEventModel]
    total_events: int
    page: int
    page_size: int
    page_count: int
    earliest: str | None
    latest: str | None


class HexResponse(BaseModel):
    offset: int
    length: int
    image_size: int
    bytes_base64: str
    sha256: str
    truncated: bool


class PreviewResponse(BaseModel):
    entry_id: int
    name: str
    kind: Literal["text", "binary", "empty", "unavailable"]
    reason: str | None
    encoding: str | None
    bytes_read: int
    size_bytes: int
    text: str | None
    bytes_base64: str | None
    data_offset: int | None


class RecoveryRequest(BaseModel):
    entry_ids: list[int] = Field(min_length=1, max_length=64)


class RecoveryModel(BaseModel):
    id: str
    entry_id: int
    entry_path: str
    filename: str
    size_bytes: int
    declared_size_bytes: int
    confidence: float
    rating: str
    method: str
    sha256: str
    cluster_runs: list[list[int]]
    truncated: bool
    created_at: datetime
    download_url: str


class RecoveryListResponse(BaseModel):
    items: list[RecoveryModel]
    total: int


class RecoveryResultResponse(BaseModel):
    created: list[RecoveryModel]
    skipped: list[dict[str, Any]]

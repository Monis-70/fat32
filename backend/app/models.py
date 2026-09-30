from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

STATUS_QUEUED = "queued"
STATUS_RUNNING = "running"
STATUS_COMPLETED = "completed"
STATUS_FAILED = "failed"

ANALYSIS_STATUSES = (STATUS_QUEUED, STATUS_RUNNING, STATUS_COMPLETED, STATUS_FAILED)


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    original_filename: Mapped[str] = mapped_column(String(255))
    stored_filename: Mapped[str] = mapped_column(String(255))
    stored_path: Mapped[str] = mapped_column(Text)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    image_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(16), default=STATUS_QUEUED, index=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    stage: Mapped[str] = mapped_column(String(80), default="Queued")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_hint: Mapped[str | None] = mapped_column(Text, nullable=True)
    case_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    examiner: Mapped[str | None] = mapped_column(String(120), nullable=True)
    evidence_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    acquired_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    entries: Mapped[list[Entry]] = relationship(
        back_populates="analysis", cascade="all, delete-orphan", passive_deletes=True
    )
    findings: Mapped[list[Finding]] = relationship(
        back_populates="analysis", cascade="all, delete-orphan", passive_deletes=True
    )
    cluster_ranges: Mapped[list[ClusterRangeRow]] = relationship(
        back_populates="analysis", cascade="all, delete-orphan", passive_deletes=True
    )
    recoveries: Mapped[list[Recovery]] = relationship(
        back_populates="analysis", cascade="all, delete-orphan", passive_deletes=True
    )


class Entry(Base):
    __tablename__ = "entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    analysis_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("analyses.id", ondelete="CASCADE"), index=True
    )
    entry_id: Mapped[int] = mapped_column(Integer, index=True)
    parent_entry_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    depth: Mapped[int] = mapped_column(Integer, default=0)
    path: Mapped[str] = mapped_column(Text)
    parent_path: Mapped[str] = mapped_column(Text, default="/")
    name: Mapped[str] = mapped_column(Text)
    name_lower: Mapped[str] = mapped_column(Text, index=True)
    short_name: Mapped[str] = mapped_column(String(32))
    long_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    long_name_valid: Mapped[bool] = mapped_column(Boolean, default=False)
    long_name_entries: Mapped[int] = mapped_column(Integer, default=0)
    recovered_first_char: Mapped[str | None] = mapped_column(String(4), nullable=True)
    extension: Mapped[str] = mapped_column(String(16), default="")
    is_directory: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_volume_label: Mapped[bool] = mapped_column(Boolean, default=False)
    is_residual: Mapped[bool] = mapped_column(Boolean, default=False)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    is_read_only: Mapped[bool] = mapped_column(Boolean, default=False)
    is_archive: Mapped[bool] = mapped_column(Boolean, default=False)
    attributes: Mapped[int] = mapped_column(Integer, default=0)
    attribute_list: Mapped[str] = mapped_column(Text, default="[]")
    first_cluster: Mapped[int] = mapped_column(Integer, default=0)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0, index=True)
    allocated_bytes: Mapped[int] = mapped_column(Integer, default=0)
    cluster_count: Mapped[int] = mapped_column(Integer, default=0)
    fragment_count: Mapped[int] = mapped_column(Integer, default=0)
    is_fragmented: Mapped[bool] = mapped_column(Boolean, default=False)
    chain_status: Mapped[str] = mapped_column(String(24), default="empty", index=True)
    cluster_runs: Mapped[str] = mapped_column(Text, default="[]")
    chain_complete: Mapped[bool] = mapped_column(Boolean, default=True)
    slack_bytes: Mapped[int] = mapped_column(Integer, default=0)
    slack_nonzero: Mapped[bool] = mapped_column(Boolean, default=False)
    slack_preview: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_offset: Mapped[int | None] = mapped_column(Integer, nullable=True)
    directory_entry_offset: Mapped[int] = mapped_column(Integer, default=0)
    created_at_fs: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    modified_at_fs: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    accessed_at_fs: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    content_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    child_count: Mapped[int] = mapped_column(Integer, default=0)
    recoverable: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    recovery_rating: Mapped[str] = mapped_column(String(24), default="not_applicable")
    recovery_confidence: Mapped[float] = mapped_column(Float, default=0.0)
    recovery_reasons: Mapped[str] = mapped_column(Text, default="[]")
    recovery_method: Mapped[str | None] = mapped_column(String(40), nullable=True)
    recovery_cluster_runs: Mapped[str] = mapped_column(Text, default="[]")
    recovery_cluster_count: Mapped[int] = mapped_column(Integer, default=0)
    issues: Mapped[str] = mapped_column(Text, default="[]")

    analysis: Mapped[Analysis] = relationship(back_populates="entries")


Index("ix_entries_analysis_entry", Entry.analysis_id, Entry.entry_id, unique=True)
Index("ix_entries_analysis_parent", Entry.analysis_id, Entry.parent_entry_id)


class Finding(Base):
    __tablename__ = "findings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    analysis_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("analyses.id", ondelete="CASCADE"), index=True
    )
    code: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(16), index=True)
    severity_rank: Mapped[int] = mapped_column(Integer, default=0, index=True)
    category: Mapped[str] = mapped_column(String(32), index=True)
    description: Mapped[str] = mapped_column(Text)
    recommendation: Mapped[str] = mapped_column(Text, default="")
    entry_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    entry_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    cluster: Mapped[int | None] = mapped_column(Integer, nullable=True)
    details: Mapped[str] = mapped_column(Text, default="{}")

    analysis: Mapped[Analysis] = relationship(back_populates="findings")


class ClusterRangeRow(Base):
    __tablename__ = "cluster_ranges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    analysis_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("analyses.id", ondelete="CASCADE"), index=True
    )
    start_cluster: Mapped[int] = mapped_column(Integer, index=True)
    end_cluster: Mapped[int] = mapped_column(Integer, index=True)
    state: Mapped[str] = mapped_column(String(16), index=True)
    entry_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    analysis: Mapped[Analysis] = relationship(back_populates="cluster_ranges")


class Recovery(Base):
    __tablename__ = "recoveries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    analysis_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("analyses.id", ondelete="CASCADE"), index=True
    )
    entry_id: Mapped[int] = mapped_column(Integer, index=True)
    entry_path: Mapped[str] = mapped_column(Text)
    filename: Mapped[str] = mapped_column(String(255))
    stored_path: Mapped[str] = mapped_column(Text)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    declared_size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    rating: Mapped[str] = mapped_column(String(24), default="unlikely")
    method: Mapped[str] = mapped_column(String(40), default="contiguous_run")
    sha256: Mapped[str] = mapped_column(String(64))
    cluster_runs: Mapped[str] = mapped_column(Text, default="[]")
    truncated: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    analysis: Mapped[Analysis] = relationship(back_populates="recoveries")

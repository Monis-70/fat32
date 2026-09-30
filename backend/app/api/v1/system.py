from __future__ import annotations

import time
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from ...config import API_VERSION, APP_NAME, APP_VERSION, Settings
from ...db import get_db
from ...fat32.constants import (
    CLUSTER_STATES,
    MAX_CLUSTER_COUNT,
    MAX_DIRECTORY_ENTRIES,
    MAX_HEX_READ_BYTES,
    MAX_PREVIEW_BYTES,
    SEVERITIES,
)
from ...fat32.demo import demo_image_description
from ...schemas import HealthResponse, LimitsModel, MetaResponse
from ...storage import ALLOWED_EXTENSIONS
from ..deps import settings_dependency

router = APIRouter(tags=["system"])
_STARTED_AT = time.monotonic()


@router.get("/health", response_model=HealthResponse)
def health(session: Session = Depends(get_db)) -> HealthResponse:
    database = "ok"
    try:
        session.execute(text("SELECT 1"))
    except Exception:
        database = "unavailable"
    return HealthResponse(
        status="ok",
        service=APP_NAME,
        version=APP_VERSION,
        api_version=API_VERSION,
        server_time=datetime.now(UTC),
        uptime_seconds=round(time.monotonic() - _STARTED_AT, 3),
        database=database,
    )


@router.get("/meta", response_model=MetaResponse)
def meta(settings: Settings = Depends(settings_dependency)) -> MetaResponse:
    return MetaResponse(
        name=APP_NAME,
        description=(
            "Read-only FAT32 forensic analysis service. Evidence images are parsed from raw bytes "
            "and are never mounted or modified."
        ),
        version=APP_VERSION,
        api_version=API_VERSION,
        read_only=True,
        supported_extensions=list(ALLOWED_EXTENSIONS),
        supported_containers=["raw FAT32 volume image", "MBR disk image with a FAT32 partition"],
        limits=LimitsModel(
            max_upload_bytes=settings.max_upload_bytes,
            max_upload_mb=settings.max_upload_mb,
            analysis_ttl_hours=settings.analysis_ttl_hours,
            max_hex_read_bytes=MAX_HEX_READ_BYTES,
            max_preview_bytes=MAX_PREVIEW_BYTES,
            max_entries=MAX_DIRECTORY_ENTRIES,
            max_clusters=MAX_CLUSTER_COUNT,
        ),
        demo_image=demo_image_description(),
        severities=list(SEVERITIES),
        cluster_states=list(CLUSTER_STATES),
    )

from __future__ import annotations

import contextlib
import re
import shutil
import unicodedata
from datetime import timedelta
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings
from .fat32.demo import build_demo_image, demo_image_filename
from .models import Analysis, utcnow

SAFE_CHARACTERS = re.compile(r"[^A-Za-z0-9._-]+")
ALLOWED_EXTENSIONS = (".img", ".dd", ".raw", ".bin", ".image")
MAX_FILENAME_LENGTH = 120


def sanitize_filename(raw: str | None, fallback: str = "evidence.img") -> str:
    if not raw:
        return fallback
    candidate = unicodedata.normalize("NFKD", raw)
    candidate = candidate.replace("\\", "/").split("/")[-1]
    candidate = candidate.strip().strip(".")
    candidate = SAFE_CHARACTERS.sub("_", candidate)
    candidate = re.sub(r"_{2,}", "_", candidate).strip("._-")
    if not candidate:
        return fallback
    if len(candidate) > MAX_FILENAME_LENGTH:
        stem, _, suffix = candidate.rpartition(".")
        if stem and len(suffix) <= 8:
            candidate = f"{stem[: MAX_FILENAME_LENGTH - len(suffix) - 1]}.{suffix}"
        else:
            candidate = candidate[:MAX_FILENAME_LENGTH]
    return candidate


def has_supported_extension(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_EXTENSIONS


def sanitize_metadata(value: str | None, limit: int = 120) -> str | None:
    if value is None:
        return None
    cleaned = re.sub(r"[\x00-\x1f\x7f]", "", value).strip()
    if not cleaned:
        return None
    return cleaned[:limit]


def upload_target(settings: Settings, analysis_id: str, filename: str) -> Path:
    settings.ensure_directories()
    return settings.uploads_path / f"{analysis_id}__{filename}"


def recovery_target(settings: Settings, analysis_id: str, recovery_id: str, filename: str) -> Path:
    directory = settings.recovered_path / analysis_id
    directory.mkdir(parents=True, exist_ok=True)
    return directory / f"{recovery_id}__{filename}"


def ensure_demo_image(settings: Settings) -> Path:
    settings.ensure_directories()
    target = settings.demo_path / demo_image_filename()
    if not target.exists() or target.stat().st_size == 0:
        build_demo_image(target)
    return target


def remove_analysis_artifacts(settings: Settings, analysis: Analysis) -> None:
    if not analysis.is_demo:
        stored = Path(analysis.stored_path)
        if stored.is_file():
            with contextlib.suppress(OSError):
                stored.unlink()
    recovered = settings.recovered_path / analysis.id
    if recovered.is_dir():
        shutil.rmtree(recovered, ignore_errors=True)


def expiry_for(settings: Settings):
    return utcnow() + timedelta(hours=settings.analysis_ttl_hours)


def purge_expired(session: Session, settings: Settings) -> int:
    cutoff = utcnow()
    expired = session.scalars(select(Analysis).where(Analysis.expires_at <= cutoff)).all()
    for analysis in expired:
        remove_analysis_artifacts(settings, analysis)
        session.delete(analysis)
    if expired:
        session.commit()
    return len(expired)


def purge_orphan_uploads(session: Session, settings: Settings) -> int:
    settings.ensure_directories()
    known = {Path(path).name for path in session.scalars(select(Analysis.stored_path)).all()}
    removed = 0
    for candidate in settings.uploads_path.glob("*"):
        if candidate.is_file() and candidate.name not in known:
            with contextlib.suppress(OSError):
                candidate.unlink()
                removed += 1
    return removed

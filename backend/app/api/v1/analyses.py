from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ...config import Settings
from ...db import get_db
from ...jobs import submit_analysis
from ...models import ANALYSIS_STATUSES, STATUS_QUEUED, Analysis, utcnow
from ...schemas import (
    AnalysisListResponse,
    AnalysisStatusResponse,
    AnalysisSummaryModel,
    EvidenceMetadata,
)
from ...services import analysis_to_dict
from ...storage import (
    ALLOWED_EXTENSIONS,
    ensure_demo_image,
    expiry_for,
    has_supported_extension,
    remove_analysis_artifacts,
    sanitize_filename,
    sanitize_metadata,
    upload_target,
)
from ..deps import get_analysis, settings_dependency

router = APIRouter(prefix="/analyses", tags=["analyses"])
CHUNK_SIZE = 1024 * 1024


def _create_record(
    session: Session,
    settings: Settings,
    analysis_id: str,
    original_filename: str,
    stored_filename: str,
    stored_path: str,
    size_bytes: int,
    metadata: EvidenceMetadata,
    is_demo: bool,
) -> Analysis:
    analysis = Analysis(
        id=analysis_id,
        original_filename=original_filename,
        stored_filename=stored_filename,
        stored_path=stored_path,
        size_bytes=size_bytes,
        is_demo=is_demo,
        status=STATUS_QUEUED,
        progress=0,
        stage="Queued for analysis",
        case_id=sanitize_metadata(metadata.case_id),
        examiner=sanitize_metadata(metadata.examiner),
        evidence_number=sanitize_metadata(metadata.evidence_number),
        acquired_at=sanitize_metadata(metadata.acquired_at, 40),
        notes=sanitize_metadata(metadata.notes, 2000),
        created_at=utcnow(),
        updated_at=utcnow(),
        expires_at=expiry_for(settings),
    )
    session.add(analysis)
    session.commit()
    session.refresh(analysis)
    return analysis


@router.post("", response_model=AnalysisSummaryModel, status_code=status.HTTP_201_CREATED)
async def create_analysis(
    file: UploadFile = File(...),
    case_id: str | None = Form(default=None),
    examiner: str | None = Form(default=None),
    evidence_number: str | None = Form(default=None),
    acquired_at: str | None = Form(default=None),
    notes: str | None = Form(default=None),
    session: Session = Depends(get_db),
    settings: Settings = Depends(settings_dependency),
) -> AnalysisSummaryModel:
    filename = sanitize_filename(file.filename)
    if not has_supported_extension(filename):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={
                "code": "unsupported_extension",
                "message": f"'{file.filename}' is not a supported evidence image.",
                "hint": f"Supported extensions are {', '.join(ALLOWED_EXTENSIONS)}.",
            },
        )
    analysis_id = str(uuid.uuid4())
    target = upload_target(settings, analysis_id, filename)
    written = 0
    try:
        with target.open("wb") as handle:
            while True:
                chunk = await file.read(CHUNK_SIZE)
                if not chunk:
                    break
                written += len(chunk)
                if written > settings.max_upload_bytes:
                    handle.close()
                    target.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail={
                            "code": "upload_too_large",
                            "message": (
                                f"The upload exceeds the {settings.max_upload_mb} MB limit."
                            ),
                            "hint": "Increase MAX_UPLOAD_MB or split the evidence image.",
                        },
                    )
                handle.write(chunk)
    except HTTPException:
        raise
    except OSError as exc:
        target.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "storage_failure",
                "message": "The evidence image could not be written to storage.",
                "hint": str(exc),
            },
        ) from exc
    finally:
        await file.close()
    if written < 512:
        target.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "image_too_small",
                "message": "The uploaded file is smaller than a single 512-byte sector.",
                "hint": "Upload a complete FAT32 volume or disk image.",
            },
        )
    analysis = _create_record(
        session=session,
        settings=settings,
        analysis_id=analysis_id,
        original_filename=file.filename or filename,
        stored_filename=target.name,
        stored_path=str(target),
        size_bytes=written,
        metadata=EvidenceMetadata(
            case_id=case_id,
            examiner=examiner,
            evidence_number=evidence_number,
            acquired_at=acquired_at,
            notes=notes,
        ),
        is_demo=False,
    )
    submit_analysis(analysis.id)
    return AnalysisSummaryModel(**analysis_to_dict(session, analysis))


@router.post("/demo", response_model=AnalysisSummaryModel, status_code=status.HTTP_201_CREATED)
def create_demo_analysis(
    metadata: EvidenceMetadata | None = None,
    session: Session = Depends(get_db),
    settings: Settings = Depends(settings_dependency),
) -> AnalysisSummaryModel:
    image = ensure_demo_image(settings)
    analysis_id = str(uuid.uuid4())
    payload = metadata or EvidenceMetadata()
    analysis = _create_record(
        session=session,
        settings=settings,
        analysis_id=analysis_id,
        original_filename=image.name,
        stored_filename=image.name,
        stored_path=str(image),
        size_bytes=image.stat().st_size,
        metadata=EvidenceMetadata(
            case_id=payload.case_id or "CASE-2024-0142",
            examiner=payload.examiner or "FATScope demo",
            evidence_number=payload.evidence_number or "EX-001",
            acquired_at=payload.acquired_at or "2024-03-15T09:12:34",
            notes=payload.notes
            or "Synthetic FAT32 evidence image generated for demonstration purposes.",
        ),
        is_demo=True,
    )
    submit_analysis(analysis.id)
    return AnalysisSummaryModel(**analysis_to_dict(session, analysis))


@router.get("", response_model=AnalysisListResponse)
def list_analyses(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    analysis_status: str | None = Query(default=None, alias="status"),
    session: Session = Depends(get_db),
) -> AnalysisListResponse:
    statement = select(Analysis)
    count_statement = select(func.count()).select_from(Analysis)
    if analysis_status:
        if analysis_status not in ANALYSIS_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "invalid_status",
                    "message": f"'{analysis_status}' is not a valid analysis status.",
                    "hint": f"Use one of {', '.join(ANALYSIS_STATUSES)}.",
                },
            )
        statement = statement.where(Analysis.status == analysis_status)
        count_statement = count_statement.where(Analysis.status == analysis_status)
    total = session.scalar(count_statement) or 0
    rows = session.scalars(
        statement.order_by(Analysis.created_at.desc()).limit(limit).offset(offset)
    ).all()
    return AnalysisListResponse(
        items=[AnalysisSummaryModel(**analysis_to_dict(session, row)) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{analysis_id}", response_model=AnalysisSummaryModel)
def read_analysis(
    analysis: Analysis = Depends(get_analysis),
    session: Session = Depends(get_db),
) -> AnalysisSummaryModel:
    return AnalysisSummaryModel(**analysis_to_dict(session, analysis))


@router.get("/{analysis_id}/status", response_model=AnalysisStatusResponse)
def read_status(analysis: Analysis = Depends(get_analysis)) -> AnalysisStatusResponse:
    return AnalysisStatusResponse(
        id=analysis.id,
        status=analysis.status,
        progress=analysis.progress,
        stage=analysis.stage,
        error_message=analysis.error_message,
        error_hint=analysis.error_hint,
        updated_at=analysis.updated_at,
        expires_at=analysis.expires_at,
    )


@router.delete("/{analysis_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_analysis(
    analysis: Analysis = Depends(get_analysis),
    session: Session = Depends(get_db),
    settings: Settings = Depends(settings_dependency),
) -> None:
    remove_analysis_artifacts(settings, analysis)
    session.delete(analysis)
    session.commit()

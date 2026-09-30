from __future__ import annotations

import json
import re

from fastapi import APIRouter, Depends, HTTPException, Path, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ...db import get_db
from ...models import Analysis
from ...reports import build_csv_report, build_pdf_report
from ...services import build_report_payload
from ..deps import get_completed_analysis

router = APIRouter(prefix="/analyses", tags=["reports"])

MEDIA_TYPES = {
    "json": "application/json",
    "csv": "text/csv; charset=utf-8",
    "pdf": "application/pdf",
}


def _download_name(analysis: Analysis, extension: str) -> str:
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", analysis.original_filename or "evidence").strip("-.")
    stem = stem.rsplit(".", 1)[0][:60] or "evidence"
    return f"fatscope-{stem}-{analysis.id[:8]}.{extension}"


@router.get("/{analysis_id}/reports/{report_format}")
def download_report(
    report_format: str = Path(pattern="^(json|csv|pdf)$"),
    analysis: Analysis = Depends(get_completed_analysis),
    session: Session = Depends(get_db),
) -> Response:
    payload = build_report_payload(session, analysis)
    if report_format == "json":
        content = json.dumps(payload, indent=2, default=str).encode("utf-8")
    elif report_format == "csv":
        content = build_csv_report(payload)
    else:
        try:
            content = build_pdf_report(payload)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={
                    "code": "report_generation_failed",
                    "message": "The PDF report could not be generated.",
                    "hint": f"{type(exc).__name__}: {exc}",
                },
            ) from exc
    filename = _download_name(analysis, report_format)
    return Response(
        content=content,
        media_type=MEDIA_TYPES[report_format],
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(content)),
        },
    )

from __future__ import annotations

from fastapi import Depends, HTTPException, Path, status
from sqlalchemy.orm import Session

from ..config import Settings, get_settings
from ..db import get_db
from ..models import STATUS_COMPLETED, Analysis


def settings_dependency() -> Settings:
    return get_settings()


def get_analysis(
    analysis_id: str = Path(min_length=8, max_length=36),
    session: Session = Depends(get_db),
) -> Analysis:
    analysis = session.get(Analysis, analysis_id)
    if analysis is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "analysis_not_found",
                "message": "This analysis no longer exists.",
                "hint": "Analyses are removed automatically once their retention window expires.",
            },
        )
    return analysis


def get_completed_analysis(analysis: Analysis = Depends(get_analysis)) -> Analysis:
    if analysis.status != STATUS_COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "analysis_not_ready",
                "message": f"The analysis is {analysis.status} and has no results yet.",
                "hint": analysis.error_message
                or "Poll the status endpoint until the analysis completes.",
                "status": analysis.status,
                "progress": analysis.progress,
            },
        )
    return analysis

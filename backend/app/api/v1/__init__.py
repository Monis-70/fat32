from fastapi import APIRouter

from . import analyses, recovery, reports, system, views

api_router = APIRouter()
api_router.include_router(system.router)
api_router.include_router(analyses.router)
api_router.include_router(views.router)
api_router.include_router(recovery.router)
api_router.include_router(reports.router)

__all__ = ["api_router"]

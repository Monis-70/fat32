from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api import api_router
from .config import API_VERSION, APP_NAME, APP_VERSION, get_settings
from .db import init_database, session_scope
from .jobs import shutdown_executor
from .models import STATUS_FAILED, STATUS_QUEUED, STATUS_RUNNING, Analysis, utcnow
from .storage import purge_expired, purge_orphan_uploads

logger = logging.getLogger("fatscope")
CLEANUP_INTERVAL_SECONDS = 900


def _fail_interrupted_jobs() -> None:
    with session_scope() as session:
        stale = (
            session.query(Analysis)
            .filter(Analysis.status.in_([STATUS_QUEUED, STATUS_RUNNING]))
            .all()
        )
        for analysis in stale:
            analysis.status = STATUS_FAILED
            analysis.stage = "Analysis interrupted"
            analysis.error_message = "The service restarted while this analysis was running."
            analysis.error_hint = "Upload the evidence image again to restart the analysis."
            analysis.updated_at = utcnow()


async def _cleanup_loop() -> None:
    settings = get_settings()
    while True:
        try:
            await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
            await asyncio.to_thread(_run_cleanup, settings)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Retention cleanup failed")


def _run_cleanup(settings) -> None:
    with session_scope() as session:
        removed = purge_expired(session, settings)
        orphans = purge_orphan_uploads(session, settings)
    if removed or orphans:
        logger.info("Retention cleanup removed %s analyses and %s orphan files", removed, orphans)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    settings.ensure_directories()
    init_database()
    _fail_interrupted_jobs()
    _run_cleanup(settings)
    task = asyncio.create_task(_cleanup_loop())
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        shutdown_executor()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=f"{APP_NAME} API",
        version=APP_VERSION,
        description=(
            "Read-only FAT32 forensic analysis API. Evidence images are parsed from raw bytes "
            "using bounded memory-mapped reads and are never mounted or modified."
        ),
        docs_url="/docs",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition", "X-Recovered-SHA256"],
        max_age=600,
    )
    app.include_router(api_router, prefix=f"/api/{API_VERSION}")

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "detail": {
                    "code": "validation_error",
                    "message": "One or more request parameters were rejected.",
                    "hint": "Check the errors array for the offending fields.",
                    "errors": [
                        {
                            "field": ".".join(str(part) for part in error.get("loc", [])),
                            "message": error.get("msg", "Invalid value"),
                        }
                        for error in exc.errors()
                    ],
                }
            },
        )

    @app.get("/", include_in_schema=False)
    async def root() -> dict[str, str]:
        return {
            "service": APP_NAME,
            "version": APP_VERSION,
            "api": f"/api/{API_VERSION}",
            "docs": "/docs",
        }

    return app


app = create_app()

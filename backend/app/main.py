from contextlib import asynccontextmanager
import logging
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.session import get_db
from app.observability import install_observability

logger = logging.getLogger("seodirect")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    logger.info("SEODirect starting up")
    yield
    logger.info("SEODirect shutting down")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="SEODirect Tool",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )

    install_observability(app)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_url, "http://localhost:5173", "http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
    )

    # Routers
    from app.routers.auth import router as auth_router
    from app.routers.projects import router as projects_router
    from app.routers.crawl import router as crawl_router
    from app.routers.direct import router as direct_router
    from app.routers.settings import router as settings_router
    from app.routers.export import router as export_router
    from app.routers.users import router as users_router
    from app.routers.tasks import router as tasks_router
    from app.routers.seo import router as seo_router
    from app.routers.og import router as og_router
    from app.routers.mediaplan import router as mediaplan_router
    from app.routers.history import router as history_router
    from app.routers.analytics import router as analytics_router
    from app.routers.topvisor import router as topvisor_router
    from app.routers.content_plan import router as content_plan_router
    from app.routers.reports import router as reports_router
    from app.routers.brief_templates import router as brief_templates_router
    from app.routers.push import router as push_router
    from app.routers.utm import router as utm_router
    from app.routers.portal import router as portal_router
    from app.routers.seo_enrichments import router as seo_enrichments_router
    from app.routers.direct_analysis import router as direct_analysis_router

    app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
    app.include_router(projects_router, prefix="/api/projects", tags=["projects"])
    app.include_router(crawl_router, prefix="/api", tags=["crawl"])
    app.include_router(direct_router, prefix="/api", tags=["direct"])
    app.include_router(settings_router, prefix="/api/settings", tags=["settings"])
    app.include_router(export_router, prefix="/api", tags=["export"])
    app.include_router(users_router, prefix="/api/users", tags=["users"])
    app.include_router(tasks_router, prefix="/api/tasks", tags=["tasks"])
    app.include_router(seo_router, prefix="/api", tags=["seo"])
    app.include_router(og_router, prefix="/api", tags=["og"])
    app.include_router(mediaplan_router, prefix="/api", tags=["mediaplan"])
    app.include_router(history_router, prefix="/api", tags=["history"])
    app.include_router(analytics_router, prefix="/api", tags=["analytics"])
    app.include_router(topvisor_router, prefix="/api", tags=["topvisor"])
    app.include_router(content_plan_router, prefix="/api", tags=["content-plan"])
    app.include_router(reports_router, prefix="/api", tags=["reports"])
    app.include_router(brief_templates_router, prefix="/api", tags=["briefs"])
    app.include_router(push_router, prefix="/api", tags=["push"])
    app.include_router(utm_router, prefix="/api", tags=["utm"])
    app.include_router(portal_router, prefix="/api", tags=["portal"])
    app.include_router(seo_enrichments_router, prefix="/api", tags=["seo"])
    app.include_router(direct_analysis_router, prefix="/api", tags=["direct"])

    @app.get("/api/health", tags=["system"])
    def health():
        """Liveness probe — service process is running."""
        return {"status": "ok"}

    @app.get("/api/ready", tags=["system"])
    def readiness(db: Annotated[Session, Depends(get_db)]):
        """Readiness probe — DB and Redis are reachable."""
        import redis as redis_lib
        errors: list[str] = []

        # Check DB
        try:
            db.execute(text("SELECT 1"))
        except Exception as e:
            errors.append(f"db: {e}")

        # Check Redis
        try:
            from app.config import get_settings
            r = redis_lib.from_url(str(get_settings().redis_url), socket_connect_timeout=2)
            r.ping()
        except Exception as e:
            errors.append(f"redis: {e}")

        if errors:
            raise HTTPException(status_code=503, detail={"errors": errors})
        return {"status": "ready"}

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception):
        logging.getLogger("seodirect").exception(
            "Unhandled exception on %s %s", request.method, request.url.path
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )

    return app


app = create_app()

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.session import get_db
from app.limiter import limiter
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
    # Disable OpenAPI docs in production
    is_dev = settings.app_env == "development"
    app = FastAPI(
        title="SEODirect Tool",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/api/docs" if is_dev else None,
        redoc_url="/api/redoc" if is_dev else None,
        openapi_url="/api/openapi.json" if is_dev else None,
    )

    install_observability(app)

    # Rate limiting
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # CORS: only allow localhost origins in development
    allowed_origins = [settings.frontend_url]
    if settings.app_env == "development":
        allowed_origins.extend(["http://localhost:5173", "http://localhost:3000"])

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
    )

    # Routers
    from app.routers.analytics import router as analytics_router
    from app.routers.auth import router as auth_router
    from app.routers.brief_templates import router as brief_templates_router
    from app.routers.content_plan import router as content_plan_router
    from app.routers.crawl import router as crawl_router
    from app.routers.direct import router as direct_router
    from app.routers.direct_analysis import router as direct_analysis_router
    from app.routers.export import router as export_router
    from app.routers.geo import router as geo_router
    from app.routers.history import router as history_router
    from app.routers.images import router as images_router
    from app.routers.marketing import router as marketing_router
    from app.routers.mediaplan import router as mediaplan_router
    from app.routers.og import router as og_router
    from app.routers.portal import router as portal_router
    from app.routers.projects import router as projects_router
    from app.routers.push import router as push_router
    from app.routers.reports import router as reports_router
    from app.routers.seo import router as seo_router
    from app.routers.seo_enrichments import router as seo_enrichments_router
    from app.routers.settings import router as settings_router
    from app.routers.tasks import router as tasks_router
    from app.routers.topvisor import router as topvisor_router
    from app.routers.users import router as users_router
    from app.routers.utm import router as utm_router

    app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
    app.include_router(projects_router, prefix="/api/projects", tags=["projects"])
    app.include_router(crawl_router, prefix="/api", tags=["crawl"])
    app.include_router(direct_router, prefix="/api", tags=["direct"])
    app.include_router(settings_router, prefix="/api/settings", tags=["settings"])
    app.include_router(export_router, prefix="/api", tags=["export"])
    app.include_router(geo_router, prefix="/api", tags=["geo"])
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
    app.include_router(marketing_router, prefix="/api", tags=["marketing"])
    app.include_router(images_router, prefix="/api", tags=["images"])

    # Serve uploaded images as static files at /uploads/...
    uploads_dir = Path(__file__).parent.parent / "static" / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

    @app.get("/api/health", tags=["system"])
    def health():
        """Liveness probe — service process is running."""
        return {"status": "ok"}

    @app.get("/api/ready", tags=["system"])
    def readiness(db: Annotated[Session, Depends(get_db)]):
        """Readiness probe — DB, Redis, and Celery are reachable."""
        import redis as redis_lib
        errors: list[str] = []
        components = {}

        # Check DB
        try:
            db.execute(text("SELECT 1"))
            components["db"] = "ok"
        except Exception:
            errors.append("db: unreachable")
            components["db"] = "error"

        # Check Redis
        try:
            r = redis_lib.from_url(str(settings.redis_url), socket_connect_timeout=2)
            r.ping()
            components["redis"] = "ok"
        except Exception:
            errors.append("redis: unreachable")
            components["redis"] = "error"

        # Check Celery
        try:
            from app.celery_app import celery_app as celery
            inspect = celery.control.inspect(timeout=2)
            ping_result = inspect.ping()
            if ping_result:
                worker_count = len(ping_result)
                components["celery"] = f"ok ({worker_count} workers)"
            else:
                components["celery"] = "no workers"
                errors.append("celery: no workers responding")
        except Exception:
            components["celery"] = "error"
            errors.append("celery: unreachable")

        if errors:
            raise HTTPException(status_code=503, detail={"errors": errors, "components": components})
        return {"status": "ready", "components": components}

    # ─── Prometheus metrics endpoint ──────────────────────────────────────────
    @app.get("/api/metrics", tags=["system"], include_in_schema=False)
    def prometheus_metrics(request: Request):
        """Expose Prometheus metrics — restricted to internal IPs only."""
        from prometheus_client import CONTENT_TYPE_LATEST, REGISTRY, generate_latest
        from starlette.responses import Response as StarletteResponse

        # Double-check at app level (nginx also blocks, but defense-in-depth)
        client_ip = request.headers.get("x-real-ip", request.client.host if request.client else "")
        allowed_prefixes = ("127.", "10.", "172.16.", "172.17.", "172.18.", "172.19.",
                            "172.20.", "172.21.", "172.22.", "172.23.", "172.24.",
                            "172.25.", "172.26.", "172.27.", "172.28.", "172.29.",
                            "172.30.", "172.31.", "192.168.", "::1")
        if not any(client_ip.startswith(p) for p in allowed_prefixes):
            raise HTTPException(status_code=403, detail="Forbidden")

        return StarletteResponse(
            content=generate_latest(REGISTRY),
            media_type=CONTENT_TYPE_LATEST,
        )

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

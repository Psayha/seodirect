from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
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
        allow_methods=["*"],
        allow_headers=["*"],
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

    @app.get("/api/health")
    def health():
        return {"status": "ok", "version": "0.1.0"}

    return app


app = create_app()

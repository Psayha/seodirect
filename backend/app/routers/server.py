"""Server management endpoints — Docker cleanup, disk usage, system info.

Admin / Super Admin only.
"""
import logging
import shutil
import subprocess
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.deps import CurrentUser, require_roles
from app.models.user import UserRole

logger = logging.getLogger("seodirect.server")

router = APIRouter()
AdminDep = require_roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)


# ── Schemas ──────────────────────────────────────────────────────────────────

class DiskUsage(BaseModel):
    path: str
    total_gb: float
    used_gb: float
    free_gb: float
    used_pct: float


class DockerOverview(BaseModel):
    images: list[dict]
    containers: list[dict]
    volumes: list[dict]
    build_cache_size: str
    disk_usage_summary: str


class CleanupResult(BaseModel):
    action: str
    reclaimed: str
    details: str


class SystemInfo(BaseModel):
    hostname: str
    uptime: str
    load_avg: str
    memory_total_mb: int
    memory_used_mb: int
    memory_free_mb: int
    memory_used_pct: float
    disk: list[DiskUsage]
    docker: DockerOverview | None


# ── Helpers ──────────────────────────────────────────────────────────────────

def _run(cmd: list[str], timeout: int = 30) -> str:
    """Run a shell command and return stdout. Returns empty string on failure."""
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return result.stdout.strip()
    except Exception as exc:
        logger.warning("Command %s failed: %s", cmd, exc)
        return ""


def _get_disk_usage() -> list[DiskUsage]:
    """Get disk usage for key mount points."""
    items: list[DiskUsage] = []
    for path in ["/", "/var/lib/docker"]:
        try:
            usage = shutil.disk_usage(path)
            items.append(DiskUsage(
                path=path,
                total_gb=round(usage.total / (1024 ** 3), 2),
                used_gb=round(usage.used / (1024 ** 3), 2),
                free_gb=round(usage.free / (1024 ** 3), 2),
                used_pct=round(usage.used / usage.total * 100, 1) if usage.total else 0,
            ))
        except OSError:
            pass
    return items


def _get_memory_info() -> dict:
    """Parse /proc/meminfo for memory stats."""
    try:
        with open("/proc/meminfo") as f:
            info = {}
            for line in f:
                parts = line.split()
                if len(parts) >= 2:
                    info[parts[0].rstrip(":")] = int(parts[1])
            total = info.get("MemTotal", 0) // 1024
            free = info.get("MemAvailable", info.get("MemFree", 0)) // 1024
            used = total - free
            return {
                "memory_total_mb": total,
                "memory_used_mb": used,
                "memory_free_mb": free,
                "memory_used_pct": round(used / total * 100, 1) if total else 0,
            }
    except Exception:
        return {"memory_total_mb": 0, "memory_used_mb": 0, "memory_free_mb": 0, "memory_used_pct": 0}


def _docker_overview() -> DockerOverview | None:
    """Gather Docker state info."""
    try:
        # Images
        raw = _run(["docker", "images", "--format", "{{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}\t{{.ID}}"])
        images = []
        for line in raw.splitlines():
            parts = line.split("\t")
            if len(parts) >= 4:
                images.append({
                    "name": parts[0], "size": parts[1],
                    "created": parts[2], "id": parts[3],
                })

        # Containers
        raw = _run(["docker", "ps", "-a", "--format", "{{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Size}}"])
        containers = []
        for line in raw.splitlines():
            parts = line.split("\t")
            if len(parts) >= 4:
                containers.append({
                    "name": parts[0], "status": parts[1],
                    "image": parts[2], "size": parts[3],
                })

        # Volumes
        raw = _run(["docker", "volume", "ls", "--format", "{{.Name}}\t{{.Driver}}"])
        volumes = []
        for line in raw.splitlines():
            parts = line.split("\t")
            if len(parts) >= 2:
                volumes.append({"name": parts[0], "driver": parts[1]})

        # Build cache
        raw = _run(["docker", "buildx", "du", "--verbose"], timeout=15)
        cache_size = "N/A"
        if raw:
            for line in raw.splitlines():
                if "Total" in line or "total" in line:
                    cache_size = line.strip()
                    break

        # Disk usage summary
        du_summary = _run(["docker", "system", "df"])

        return DockerOverview(
            images=images,
            containers=containers,
            volumes=volumes,
            build_cache_size=cache_size,
            disk_usage_summary=du_summary,
        )
    except Exception as exc:
        logger.warning("docker_overview failed: %s", exc)
        return None


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/server/info")
def get_server_info(
    _admin: Annotated[object, AdminDep],
    current_user: CurrentUser,
) -> SystemInfo:
    """Full server overview: disk, memory, Docker state."""
    hostname = _run(["hostname"]) or "unknown"
    uptime = _run(["uptime", "-p"]) or "unknown"
    load_avg = _run(["cat", "/proc/loadavg"]) or "unknown"
    mem = _get_memory_info()

    return SystemInfo(
        hostname=hostname,
        uptime=uptime,
        load_avg=load_avg,
        disk=_get_disk_usage(),
        docker=_docker_overview(),
        **mem,
    )


@router.post("/server/cleanup/images")
def cleanup_images(
    _admin: Annotated[object, AdminDep],
    current_user: CurrentUser,
) -> CleanupResult:
    """Remove dangling and unused Docker images."""
    output = _run(["docker", "image", "prune", "-af"], timeout=120)
    reclaimed = "0B"
    for line in output.splitlines():
        if "reclaimed" in line.lower() or "space" in line.lower():
            reclaimed = line.strip()
            break
    logger.info("Docker image prune by %s: %s", current_user.login, reclaimed)
    return CleanupResult(action="image_prune", reclaimed=reclaimed, details=output)


@router.post("/server/cleanup/containers")
def cleanup_containers(
    _admin: Annotated[object, AdminDep],
    current_user: CurrentUser,
) -> CleanupResult:
    """Remove stopped containers."""
    output = _run(["docker", "container", "prune", "-f"], timeout=60)
    reclaimed = "0B"
    for line in output.splitlines():
        if "reclaimed" in line.lower() or "space" in line.lower():
            reclaimed = line.strip()
            break
    logger.info("Docker container prune by %s: %s", current_user.login, reclaimed)
    return CleanupResult(action="container_prune", reclaimed=reclaimed, details=output)


@router.post("/server/cleanup/volumes")
def cleanup_volumes(
    _admin: Annotated[object, AdminDep],
    current_user: CurrentUser,
) -> CleanupResult:
    """Remove unused Docker volumes."""
    output = _run(["docker", "volume", "prune", "-f"], timeout=60)
    reclaimed = "0B"
    for line in output.splitlines():
        if "reclaimed" in line.lower() or "space" in line.lower():
            reclaimed = line.strip()
            break
    logger.info("Docker volume prune by %s: %s", current_user.login, reclaimed)
    return CleanupResult(action="volume_prune", reclaimed=reclaimed, details=output)


@router.post("/server/cleanup/build-cache")
def cleanup_build_cache(
    _admin: Annotated[object, AdminDep],
    current_user: CurrentUser,
) -> CleanupResult:
    """Remove Docker build cache."""
    output = _run(["docker", "builder", "prune", "-af"], timeout=120)
    reclaimed = "0B"
    for line in output.splitlines():
        if "reclaimed" in line.lower() or "space" in line.lower():
            reclaimed = line.strip()
            break
    logger.info("Docker builder prune by %s: %s", current_user.login, reclaimed)
    return CleanupResult(action="builder_prune", reclaimed=reclaimed, details=output)


@router.post("/server/cleanup/full")
def cleanup_full(
    _admin: Annotated[object, AdminDep],
    current_user: CurrentUser,
) -> CleanupResult:
    """Full system prune: images + containers + volumes + build cache."""
    output = _run(["docker", "system", "prune", "-af", "--volumes"], timeout=180)
    reclaimed = "0B"
    for line in output.splitlines():
        if "reclaimed" in line.lower() or "space" in line.lower():
            reclaimed = line.strip()
            break
    logger.info("Docker full system prune by %s: %s", current_user.login, reclaimed)
    return CleanupResult(action="system_prune", reclaimed=reclaimed, details=output)


@router.post("/server/restart/{service}")
def restart_service(
    service: str,
    _admin: Annotated[object, AdminDep],
    current_user: CurrentUser,
) -> dict:
    """Restart a specific Docker Compose service."""
    allowed = {"backend", "frontend", "celery", "celery-beat", "nginx", "redis"}
    if service not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Service '{service}' not allowed. Allowed: {', '.join(sorted(allowed))}",
        )
    output = _run(
        ["docker", "compose", "-f", "/opt/seodirect/docker-compose.prod.yml",
         "restart", service],
        timeout=60,
    )
    logger.info("Service %s restarted by %s", service, current_user.login)
    return {"service": service, "status": "restarted", "output": output}


@router.get("/server/logs/{service}")
def get_service_logs(
    service: str,
    _admin: Annotated[object, AdminDep],
    current_user: CurrentUser,
    lines: int = 100,
) -> dict:
    """Get recent logs for a Docker Compose service."""
    allowed = {"backend", "frontend", "celery", "celery-beat", "nginx", "redis", "postgres"}
    if service not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Service '{service}' not allowed. Allowed: {', '.join(sorted(allowed))}",
        )
    if lines > 500:
        lines = 500
    output = _run(
        ["docker", "compose", "-f", "/opt/seodirect/docker-compose.prod.yml",
         "logs", "--tail", str(lines), "--no-color", service],
        timeout=30,
    )
    return {"service": service, "lines": lines, "logs": output}

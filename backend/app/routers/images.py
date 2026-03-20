"""Project images router — upload/list/delete images for Direct Commander."""
from __future__ import annotations

import datetime as _dt
import logging
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth.deps import CurrentUser, NonViewerRequired
from app.config import get_settings
from app.db.session import get_db
from app.models.user import UserRole

logger = logging.getLogger("seodirect")
router = APIRouter()

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
MIN_DIMENSION = 450  # Yandex Direct minimum

# Storage: backend/static/uploads/projects/<project_id>/
STATIC_ROOT = Path(__file__).parent.parent.parent / "static" / "uploads" / "projects"


def _check_project_access(project_id: uuid.UUID, current_user, db: Session) -> None:
    row = db.execute(
        text("SELECT specialist_id, deleted_at FROM projects WHERE id = :id"),
        {"id": str(project_id)},
    ).fetchone()
    if not row or row.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Project not found")
    if current_user.role == UserRole.SPECIALIST and str(row.specialist_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")


@router.post("/projects/{project_id}/images", status_code=201)
async def upload_image(
    project_id: uuid.UUID,
    file: Annotated[UploadFile, File(...)],
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    """Upload an image for use in Yandex Direct Commander (JPEG/PNG/WEBP, max 10 MB)."""
    _check_project_access(project_id, current_user, db)

    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Недопустимый тип файла: {file.content_type}. Разрешены JPEG, PNG, WEBP.",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Файл слишком большой (максимум 10 МБ).")

    width, height = _detect_dimensions(content, file.content_type or "")
    if width and height and (width < MIN_DIMENSION or height < MIN_DIMENSION):
        raise HTTPException(
            status_code=400,
            detail=f"Изображение слишком маленькое ({width}×{height}). Минимум 450×450 пикселей.",
        )

    ext = _mime_to_ext(file.content_type or "image/jpeg")
    stored_name = f"{uuid.uuid4().hex}{ext}"
    project_dir = STATIC_ROOT / str(project_id)
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / stored_name).write_bytes(content)

    settings = get_settings()
    public_url = (
        f"{settings.frontend_url.rstrip('/')}/uploads/projects/{project_id}/{stored_name}"
    )

    img_id = uuid.uuid4()
    now = _dt.datetime.now(_dt.timezone.utc)

    db.execute(
        text("""
            INSERT INTO project_images
              (id, project_id, original_name, stored_name, url, width, height,
               file_size, mime_type, created_at, created_by)
            VALUES
              (:id, :project_id, :original_name, :stored_name, :url, :width, :height,
               :file_size, :mime_type, :created_at, :created_by)
        """),
        {
            "id": str(img_id),
            "project_id": str(project_id),
            "original_name": file.filename or stored_name,
            "stored_name": stored_name,
            "url": public_url,
            "width": width,
            "height": height,
            "file_size": len(content),
            "mime_type": file.content_type,
            "created_at": now,
            "created_by": current_user.login,
        },
    )
    db.commit()

    return {
        "id": str(img_id),
        "original_name": file.filename or stored_name,
        "url": public_url,
        "width": width,
        "height": height,
        "file_size": len(content),
        "mime_type": file.content_type,
        "created_at": now.isoformat(),
        "created_by": current_user.login,
    }


@router.get("/projects/{project_id}/images")
def list_images(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    """List all uploaded images for a project."""
    _check_project_access(project_id, current_user, db)

    rows = db.execute(
        text("""
            SELECT id, original_name, url, width, height, file_size, mime_type,
                   created_at, created_by
            FROM project_images
            WHERE project_id = :pid
            ORDER BY created_at DESC
        """),
        {"pid": str(project_id)},
    ).fetchall()

    return [
        {
            "id": str(r.id),
            "original_name": r.original_name,
            "url": r.url,
            "width": r.width,
            "height": r.height,
            "file_size": r.file_size,
            "mime_type": r.mime_type,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "created_by": r.created_by,
        }
        for r in rows
    ]


@router.delete("/projects/{project_id}/images/{image_id}", status_code=204)
def delete_image(
    project_id: uuid.UUID,
    image_id: uuid.UUID,
    current_user: CurrentUser,
    _: Annotated[object, NonViewerRequired],
    db: Annotated[Session, Depends(get_db)],
):
    """Delete an uploaded image and remove it from disk."""
    _check_project_access(project_id, current_user, db)

    row = db.execute(
        text(
            "SELECT stored_name FROM project_images WHERE id = :id AND project_id = :pid"
        ),
        {"id": str(image_id), "pid": str(project_id)},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Изображение не найдено")

    file_path = STATIC_ROOT / str(project_id) / row.stored_name
    if file_path.exists():
        file_path.unlink()

    db.execute(
        text("DELETE FROM project_images WHERE id = :id"),
        {"id": str(image_id)},
    )
    db.commit()
    return JSONResponse(status_code=204, content=None)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _mime_to_ext(mime: str) -> str:
    return {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}.get(mime, ".jpg")


def _detect_dimensions(data: bytes, mime: str) -> tuple[int | None, int | None]:
    """Parse image dimensions from raw bytes without Pillow."""
    try:
        import struct

        if mime == "image/png" and len(data) >= 24:
            w = struct.unpack(">I", data[16:20])[0]
            h = struct.unpack(">I", data[20:24])[0]
            return w, h

        elif mime == "image/jpeg":
            i = 2
            while i + 4 <= len(data):
                if data[i] != 0xFF:
                    break
                marker = data[i + 1]
                if marker in (0xC0, 0xC1, 0xC2):
                    if i + 9 <= len(data):
                        h = struct.unpack(">H", data[i + 5 : i + 7])[0]
                        w = struct.unpack(">H", data[i + 7 : i + 9])[0]
                        return w, h
                seg_len = struct.unpack(">H", data[i + 2 : i + 4])[0]
                i += 2 + seg_len

        elif mime == "image/webp" and len(data) >= 30:
            if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
                chunk = data[12:16]
                if chunk == b"VP8 ":
                    w = struct.unpack("<H", data[26:28])[0] & 0x3FFF
                    h = struct.unpack("<H", data[28:30])[0] & 0x3FFF
                    return w, h
                elif chunk == b"VP8L" and len(data) >= 25:
                    bits = struct.unpack("<I", data[21:25])[0]
                    w = (bits & 0x3FFF) + 1
                    h = ((bits >> 14) & 0x3FFF) + 1
                    return w, h
    except Exception:
        pass
    return None, None

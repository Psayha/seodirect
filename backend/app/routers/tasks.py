from fastapi import APIRouter
router = APIRouter()

@router.get("/{task_id}")
def get_task(task_id: str):
    return {"task_id": task_id, "status": "stub"}

"""FastAPI note routes — relative paths mounted via include_router prefix."""

from fastapi import APIRouter

router = APIRouter()


@router.get("")
async def list_notes():
    return []


@router.post("")
async def create_note():
    return {"id": 1}


@router.get("/{note_id}")
async def get_note(note_id: int):
    return {"id": note_id}

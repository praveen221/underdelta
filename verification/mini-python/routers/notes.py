"""FastAPI note routes (absolute paths — include_router prefixes unresolved)."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/notes")
async def list_notes():
    return []


@router.post("/notes")
async def create_note():
    return {"id": 1}


@router.get("/notes/{note_id}")
async def get_note(note_id: int):
    return {"id": note_id}

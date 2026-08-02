"""FastAPI entrypoint for the mini-python notes fixture."""

from fastapi import FastAPI

from routers import notes

app = FastAPI(title="Mini Python notes")
app.include_router(notes.router)


@app.get("/health")
async def health():
    return {"ok": True}


@app.api_route("/ping", methods=["GET", "HEAD"])
async def ping():
    return {"pong": True}

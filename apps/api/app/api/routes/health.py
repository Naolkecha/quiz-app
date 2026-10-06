import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.deps import DbSession
from app.schemas.errors import HealthResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Check that the API can reach PostgreSQL",
    description="Authentication is not required. A 503 means the database is unreachable.",
    responses={
        503: {
            "model": HealthResponse,
            "description": "PostgreSQL did not respond.",
        }
    },
)
async def health(session: DbSession) -> HealthResponse | JSONResponse:
    try:
        await session.execute(text("SELECT 1"))
    except Exception:
        logger.warning("database health check failed")
        return JSONResponse(
            status_code=503,
            content={"status": "unavailable", "database": "unavailable"},
        )
    return HealthResponse(status="ok", database="ok")

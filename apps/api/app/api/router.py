from fastapi import APIRouter

from app.api.routes import admin, auth, challenges, duels, health, play, referrals, spin, wallet, webhooks
from app.core.config import get_settings

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(admin.router)
api_router.include_router(auth.router)
api_router.include_router(challenges.router)
api_router.include_router(duels.router)
api_router.include_router(play.router)
api_router.include_router(referrals.router)
api_router.include_router(spin.router)
api_router.include_router(wallet.router)
api_router.include_router(webhooks.router)
if get_settings().dev_auth_enabled:
    api_router.include_router(auth.dev_router)

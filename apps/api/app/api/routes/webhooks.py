"""Inbound provider webhooks. Signature-checked; no user session."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Request, Response

from app.api.deps import DbSession
from app.core.config import get_settings
from app.integrations.verify_et.client import (
    WEBHOOK_TOLERANCE_MS,
    parse_verification_payload,
    verify_webhook_signature,
)
from app.services.wallets import WalletService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post(
    "/verify-et",
    status_code=204,
    summary="Receive Verify.et verification.completed events",
)
async def verify_et_webhook(request: Request, session: DbSession) -> Response:
    settings = get_settings()
    secret = settings.verify_et_webhook_secret
    raw_body = await request.body()
    timestamp = request.headers.get("X-Webhook-Timestamp", "")
    signature = request.headers.get("X-Webhook-Signature", "")
    event_id = request.headers.get("X-Webhook-Event-Id")

    if not secret:
        logger.warning("verify.et webhook rejected: VERIFY_ET_WEBHOOK_SECRET is unset")
        return Response(status_code=401, content="Missing webhook secret")

    try:
        sent_at = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError:
        return Response(status_code=401, content="Invalid webhook timestamp")

    age_ms = abs((datetime.now(UTC) - sent_at).total_seconds() * 1000)
    if age_ms > WEBHOOK_TOLERANCE_MS:
        return Response(status_code=401, content="Stale webhook timestamp")

    if not verify_webhook_signature(
        secret=secret,
        timestamp=timestamp,
        raw_body=raw_body,
        signature_header=signature,
    ):
        return Response(status_code=401, content="Invalid signature")

    if request.headers.get("X-Webhook-Test") == "true":
        return Response(status_code=204)

    try:
        event: dict[str, Any] = json.loads(raw_body.decode("utf-8"))
    except Exception:
        return Response(status_code=400, content="Invalid JSON")

    event_name = event.get("event") or request.headers.get("X-Webhook-Event")
    if event_name and event_name not in {
        "verification.completed",
        "verification.succeeded",
        "verification.not_found",
        "verification.failed",
    }:
        logger.info("Ignoring Verify.et event %s id=%s", event_name, event_id)
        return Response(status_code=204)

    request_id = str(event.get("requestId") or "")
    raw_data = event.get("data")
    data: dict[str, Any] = raw_data if isinstance(raw_data, dict) else {}
    if not request_id:
        return Response(status_code=400, content="Missing requestId")

    outcome = parse_verification_payload(data, request_id=request_id)
    service = WalletService(session)
    order = await service.apply_verify_et_result(request_id=request_id, outcome=outcome)
    if order is None:
        logger.info("No money order for Verify.et requestId=%s event=%s", request_id, event_id)
    else:
        logger.info(
            "Applied Verify.et result order=%s status=%s event=%s",
            order.id,
            order.status,
            event_id,
        )
    return Response(status_code=204)


@router.post(
    "/telegram",
    summary="Receive Telegram Bot Webhook updates",
)
async def telegram_webhook(request: Request) -> dict[str, bool]:
    try:
        data = await request.json()
    except Exception:
        return {"ok": False}
    from app.services.telegram_bot import TelegramBotService

    service = TelegramBotService()
    await service.handle_update(data)
    return {"ok": True}


@router.post(
    "/telegram/setup",
    summary="Register Telegram webhook and menu button with Telegram API",
)
async def setup_telegram_webhook(request: Request) -> dict[str, Any]:
    from app.services.telegram_bot import TelegramBotService

    service = TelegramBotService()
    base = str(request.base_url).rstrip("/")
    if base.startswith("http://") and "localhost" not in base and "127.0.0.1" not in base:
        base = "https://" + base[len("http://") :]
    webhook_url = f"{base}/api/webhooks/telegram"
    webhook_ok = await service.set_webhook(webhook_url)
    menu_ok = await service.set_menu_button()
    return {
        "webhook_url": webhook_url,
        "webhook_registered": webhook_ok,
        "menu_button_registered": menu_ok,
    }


"""Verify.et Telebirr transaction verification client."""

from __future__ import annotations

import hashlib
import hmac
import logging
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Protocol
from uuid import uuid4

import httpx

from app.core.config import Settings

logger = logging.getLogger(__name__)

WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000


@dataclass(frozen=True, slots=True)
class VerificationOutcome:
    request_id: str
    processing_status: str
    status: str
    verified: bool
    amount: Decimal | None = None
    currency: str | None = None
    settlement_matched: bool | None = None
    error_message: str | None = None
    completed: bool = False


class VerifyEtClient(Protocol):
    async def submit_telebirr(
        self,
        *,
        transaction_number: str,
        settlement_account: str | None,
        idempotency_key: str,
        wait_ms: int = 5000,
    ) -> VerificationOutcome: ...


class HttpVerifyEtClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def submit_telebirr(
        self,
        *,
        transaction_number: str,
        settlement_account: str | None,
        idempotency_key: str,
        wait_ms: int = 5000,
    ) -> VerificationOutcome:
        payload: dict[str, Any] = {
            "bank": "telebirr",
            "transactionNumber": transaction_number,
        }
        if settlement_account:
            payload["settlementAccount"] = settlement_account

        url = f"{self.settings.verify_et_base_url.rstrip('/')}/api/verify"
        if wait_ms > 0:
            url = f"{url}?waitMs={wait_ms}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": self.settings.verify_et_api_key,
                    "Idempotency-Key": idempotency_key,
                },
                json=payload,
            )

        body = response.json()
        if response.status_code not in {200, 202}:
            message = body.get("message") or body.get("error", {}).get("message") or response.text
            raise VerifyEtApiError(str(message), status_code=response.status_code)

        return _parse_submit_response(body, http_status=response.status_code)


class StubVerifyEtClient:
    """Local/dev stub that treats every submitted Telebirr txn as verified."""

    def __init__(self, *, amount_from: Decimal | None = None) -> None:
        self.amount_from = amount_from

    async def submit_telebirr(
        self,
        *,
        transaction_number: str,
        settlement_account: str | None,
        idempotency_key: str,
        wait_ms: int = 5000,
    ) -> VerificationOutcome:
        _ = settlement_account, wait_ms
        request_id = f"stub-{idempotency_key}"
        amount = self.amount_from
        return VerificationOutcome(
            request_id=request_id,
            processing_status="completed",
            status="success",
            verified=True,
            amount=amount,
            currency="ETB",
            settlement_matched=True,
            completed=True,
        )


class VerifyEtApiError(Exception):
    def __init__(self, message: str, *, status_code: int) -> None:
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def build_verify_et_client(settings: Settings) -> VerifyEtClient:
    if settings.verify_et_api_key.strip():
        return HttpVerifyEtClient(settings)
    if settings.app_env in {"development", "test"}:
        return StubVerifyEtClient()
    raise RuntimeError("VERIFY_ET_API_KEY is required outside development/test.")


def verify_webhook_signature(
    *,
    secret: str,
    timestamp: str,
    raw_body: bytes,
    signature_header: str,
) -> bool:
    if not secret or not timestamp or not signature_header:
        return False
    expected = hmac.new(
        secret.encode(),
        f"{timestamp}.".encode() + raw_body,
        hashlib.sha256,
    ).hexdigest()
    expected_buf = expected.encode()
    for part in signature_header.split(","):
        actual = part.strip().removeprefix("sha256=").encode()
        if len(actual) == len(expected_buf) and hmac.compare_digest(actual, expected_buf):
            return True
    return False


def parse_verification_payload(data: dict[str, Any], *, request_id: str) -> VerificationOutcome:
    processing_status = str(data.get("processingStatus") or "completed")
    status = str(data.get("status") or "failed")
    verified = bool(data.get("verified"))
    amount = _as_decimal(data.get("amount"))
    settlement = data.get("settlementAccountMatch")
    settlement_matched: bool | None = None
    if isinstance(settlement, dict) and "matched" in settlement:
        settlement_matched = bool(settlement["matched"])
    error = data.get("error")
    error_message = None
    if isinstance(error, dict):
        error_message = str(error.get("message") or error.get("code") or "Verification failed.")
    elif isinstance(error, str):
        error_message = error
    completed = processing_status in {"completed", "failed"}
    return VerificationOutcome(
        request_id=request_id,
        processing_status=processing_status,
        status=status,
        verified=verified,
        amount=amount,
        currency=str(data["currency"]) if data.get("currency") else None,
        settlement_matched=settlement_matched,
        error_message=error_message,
        completed=completed,
    )


def _parse_submit_response(body: dict[str, Any], *, http_status: int) -> VerificationOutcome:
    request_id = str(body.get("requestId") or uuid4())
    verification = body.get("verification") or {}
    data = body.get("data")
    first: dict[str, Any] = {}
    if isinstance(data, list) and data:
        first = data[0] if isinstance(data[0], dict) else {}
    elif isinstance(data, dict):
        first = data

    if http_status == 200 and first:
        outcome = parse_verification_payload(first, request_id=request_id)
        return VerificationOutcome(
            request_id=request_id,
            processing_status=outcome.processing_status or "completed",
            status=outcome.status,
            verified=outcome.verified,
            amount=outcome.amount,
            currency=outcome.currency,
            settlement_matched=outcome.settlement_matched,
            error_message=outcome.error_message,
            completed=True,
        )

    processing_status = str(verification.get("processingStatus") or "queued")
    status = str(verification.get("status") or "pending")
    verified = bool(verification.get("verified"))
    return VerificationOutcome(
        request_id=request_id,
        processing_status=processing_status,
        status=status,
        verified=verified,
        completed=processing_status in {"completed", "failed"},
        amount=_as_decimal(first.get("amount")) if first else None,
        settlement_matched=(
            bool(first["settlementAccountMatch"]["matched"])
            if isinstance(first.get("settlementAccountMatch"), dict)
            and "matched" in first["settlementAccountMatch"]
            else None
        ),
    )


def _as_decimal(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except Exception:
        logger.warning("Could not parse Verify.et amount %r", value)
        return None

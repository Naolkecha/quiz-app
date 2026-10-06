"""Deprecated Telebirr merchant gateway.

Deposits now verify through Verify.et. Withdrawals are manual payout requests.
This module remains only so older imports do not break during the transition.
"""

from typing import Literal

from app.core.config import Settings

TelebirrMode = Literal["sandbox", "credentials_required", "live_adapter_required"]


class TelebirrGateway:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    @property
    def mode(self) -> TelebirrMode:
        if self.settings.verify_et_configured:
            return "live_adapter_required"
        if self.settings.app_env in {"development", "test"}:
            return "sandbox"
        return "credentials_required"

    @property
    def deposits_enabled(self) -> bool:
        return self.settings.deposits_enabled

    @property
    def withdrawals_enabled(self) -> bool:
        return self.settings.withdrawals_enabled

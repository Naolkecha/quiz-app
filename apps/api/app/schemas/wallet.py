from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.models.wallet import LedgerType, MoneyOrderKind, MoneyOrderStatus


def _normalize_ethiopian_phone(value: str) -> str:
    compact = "".join(character for character in value if character.isdigit() or character == "+")
    if compact.startswith("+2519") and len(compact) == 13:
        return compact
    if compact.startswith("2519") and len(compact) == 12:
        return f"+{compact}"
    if compact.startswith("09") and len(compact) == 10:
        return f"+251{compact[1:]}"
    if compact.startswith("9") and len(compact) == 9:
        return f"+251{compact}"
    raise ValueError("Use an Ethiopian Telebirr number such as 0912345678.")


class DepositRequest(BaseModel):
    amount_etb: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    transaction_number: str = Field(min_length=6, max_length=64)
    idempotency_key: UUID

    @field_validator("transaction_number")
    @classmethod
    def normalize_transaction(cls, value: str) -> str:
        compact = "".join(character for character in value.strip().upper() if character.isalnum())
        if len(compact) < 6:
            raise ValueError("Enter a valid Telebirr transaction number.")
        return compact


class WithdrawalRequest(BaseModel):
    amount_etb: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    phone_number: str = Field(min_length=9, max_length=20)
    idempotency_key: UUID

    @field_validator("phone_number")
    @classmethod
    def normalize_phone(cls, value: str) -> str:
        return _normalize_ethiopian_phone(value)


class WithdrawalDecision(BaseModel):
    reason: str | None = Field(default=None, max_length=256)


class PaymentAccountUpdate(BaseModel):
    holder_name: str = Field(min_length=2, max_length=80)
    account_number: str = Field(min_length=9, max_length=20)

    @field_validator("holder_name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        letters = cleaned.replace(" ", "").replace("-", "").replace("'", "")
        if len(cleaned) < 2 or not letters.isalpha():
            raise ValueError("Enter the account name using letters.")
        return cleaned

    @field_validator("account_number")
    @classmethod
    def clean_number(cls, value: str) -> str:
        normalized = _normalize_ethiopian_phone(value)
        return f"0{normalized[4:]}"


class PaymentAccountView(BaseModel):
    holder_name: str
    account_number: str


class WalletTransactionView(BaseModel):
    id: UUID
    entry_type: LedgerType
    amount_etb: Decimal
    balance_after_etb: Decimal
    description: str
    created_at: datetime


class MoneyOrderView(BaseModel):
    id: UUID
    kind: MoneyOrderKind
    status: MoneyOrderStatus
    provider: str
    amount_etb: Decimal
    phone_number: str | None
    transaction_number: str | None
    failure_reason: str | None
    created_at: datetime
    completed_at: datetime | None


class AdminWithdrawalView(MoneyOrderView):
    user_id: UUID
    player_name: str
    telegram_username: str | None
    telegram_id: int
    balance_etb: Decimal


class WalletView(BaseModel):
    balance_etb: Decimal
    pending_withdrawals_etb: Decimal
    available_etb: Decimal
    currency: str = "ETB"
    deposit_mode: str
    deposits_enabled: bool
    withdrawals_enabled: bool
    settlement_account: str | None
    settlement_account_name: str | None
    transactions: list[WalletTransactionView]
    orders: list[MoneyOrderView]

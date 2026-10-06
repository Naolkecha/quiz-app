"""Errors that map to a stable API payload."""


class AppError(Exception):
    def __init__(self, *, code: str, message: str, status_code: int) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class InitDataError(AppError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(code=code, message=message, status_code=401)


class InvalidSessionError(AppError):
    def __init__(self) -> None:
        super().__init__(
            code="session_invalid",
            message="Authentication required.",
            status_code=401,
        )


class UserBlockedError(AppError):
    def __init__(self) -> None:
        super().__init__(
            code="user_blocked",
            message="This account cannot access Challenge.",
            status_code=403,
        )


class NotFoundError(AppError):
    def __init__(self, message: str = "Not found.") -> None:
        super().__init__(code="not_found", message=message, status_code=404)


class PlayError(AppError):
    def __init__(self, code: str, message: str, status_code: int = 409) -> None:
        super().__init__(code=code, message=message, status_code=status_code)


class WalletError(AppError):
    def __init__(self, code: str, message: str, status_code: int = 409) -> None:
        super().__init__(code=code, message=message, status_code=status_code)

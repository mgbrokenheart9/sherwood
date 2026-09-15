"""Exceptions raised by the Sherwood SDK. Everything derives from :class:`SherwoodError`."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .registry import TransactionResult
    from .x402 import PaymentRequirements, SettlementResponse


class SherwoodError(Exception):
    """Base class for every error raised by the SDK."""


class UnknownNetworkError(SherwoodError, ValueError):
    """The network id, alias or chain id is not supported."""


class RpcError(SherwoodError):
    """A JSON-RPC call failed, either on every endpoint or with an error from the node."""

    def __init__(self, message: str, *, code: int | None = None, data: Any = None, url: str | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.data = data
        self.url = url


class RegistryRevertError(SherwoodError):
    """The registry reverted with one of its custom errors, e.g. ``AgentAlreadyRegistered``."""

    def __init__(self, error_name: str, error_args: tuple[Any, ...]) -> None:
        super().__init__(f"{error_name}({', '.join(str(arg) for arg in error_args)})")
        self.error_name = error_name
        self.error_args = error_args


class TransactionFailedError(SherwoodError):
    """A transaction was mined but reverted."""

    def __init__(self, result: TransactionResult) -> None:
        super().__init__(f"Transaction {result.hash} reverted in block {result.block_number}")
        self.result = result


class PaymentError(SherwoodError):
    """Base class for x402 payment failures."""


class PaymentRequiredError(PaymentError):
    """The resource answered 402 and the client could not produce an acceptable payment."""

    def __init__(self, message: str, *, reason: str | None = None, accepts: list[PaymentRequirements] | None = None) -> None:
        super().__init__(message)
        self.reason = reason
        self.accepts = accepts or []


class PriceLimitExceededError(PaymentError):
    """The resource asks for more than the client's spending limit. Nothing was signed."""

    def __init__(self, amount: int, limit: int) -> None:
        super().__init__(f"Resource costs {amount} USDG base units, above the limit of {limit}")
        self.amount = amount
        self.limit = limit


class SettlementFailedError(PaymentError):
    """A signed payment was sent but the server refused or failed to settle it."""

    def __init__(self, reason: str, settlement: SettlementResponse | None = None) -> None:
        super().__init__(f"Payment was not settled: {reason}")
        self.reason = reason
        self.settlement = settlement

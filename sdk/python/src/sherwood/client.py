"""HTTP client that pays x402 resources automatically, within a spending limit you set."""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

import httpx
from eth_account.signers.local import LocalAccount

from .errors import PaymentRequiredError, PriceLimitExceededError, SettlementFailedError
from .networks import MAINNET, Network
from .x402 import (
    DEFAULT_VALID_FOR_SECONDS,
    PAYMENT_HEADER,
    PAYMENT_RESPONSE_HEADER,
    PaymentPayload,
    PaymentRequirements,
    SettlementResponse,
    create_authorization,
    decode_header,
    select_requirements,
    sign_authorization,
    to_usdg_units,
)


@dataclass(frozen=True)
class PaidResponse:
    """Final HTTP response plus what was paid for it. ``payment`` is ``None`` when the resource was free."""

    response: httpx.Response
    requirements: PaymentRequirements | None = None
    payment: PaymentPayload | None = None
    settlement: SettlementResponse | None = None

    @property
    def paid(self) -> bool:
        return self.payment is not None

    def json(self) -> Any:
        return self.response.json()


class X402Client:
    """Fetch resources that answer ``402 Payment Required`` by signing a USDG EIP-3009 authorization.

    ``max_amount`` is required on purpose: the client refuses, before signing anything, any resource that asks
    for more. Pass a USDG amount (``"0.05"``) or base units via :func:`sherwood.x402.to_usdg_units`.
    """

    def __init__(
        self,
        account: LocalAccount,
        *,
        max_amount: str | int | Decimal,
        network: Network = MAINNET,
        valid_for_seconds: int = DEFAULT_VALID_FOR_SECONDS,
        http: httpx.Client | None = None,
        timeout: float = 30.0,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.account = account
        self.network = network
        self.max_amount = max_amount if isinstance(max_amount, int) and not isinstance(max_amount, bool) else to_usdg_units(max_amount)
        self.valid_for_seconds = valid_for_seconds
        self._http = http or httpx.Client(timeout=timeout)
        self._owns_http = http is None
        self._clock = clock

    def __enter__(self) -> X402Client:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def close(self) -> None:
        if self._owns_http:
            self._http.close()

    def get(self, url: str, **kwargs: Any) -> PaidResponse:
        return self.request("GET", url, **kwargs)

    def post(self, url: str, **kwargs: Any) -> PaidResponse:
        return self.request("POST", url, **kwargs)

    def request(self, method: str, url: str, **kwargs: Any) -> PaidResponse:
        headers = dict(kwargs.pop("headers", None) or {})
        first = self._http.request(method, url, headers=headers, **kwargs)
        if first.status_code != 402:
            return PaidResponse(first)

        requirements = self._choose_requirements(first)
        payment = self.create_payment(requirements)

        paid = self._http.request(method, url, headers={**headers, PAYMENT_HEADER: payment.to_header()}, **kwargs)
        settlement = self._settlement(paid)
        if paid.status_code == 402 or (settlement is not None and not settlement.success):
            reason = (settlement.error_reason if settlement else None) or _error_of(paid) or "payment_rejected"
            raise SettlementFailedError(reason, settlement)
        return PaidResponse(paid, requirements, payment, settlement)

    def create_payment(self, requirements: PaymentRequirements) -> PaymentPayload:
        """Sign a payment for ``requirements`` after checking the network, asset and spending limit."""
        if requirements.network != self.network.id or select_requirements([requirements], self.network) is None:
            raise PaymentRequiredError("Requirements are for another network or asset", reason="network_mismatch", accepts=[requirements])
        if requirements.max_amount_required > self.max_amount:
            raise PriceLimitExceededError(requirements.max_amount_required, self.max_amount)

        # Stay inside the verifier's window: validBefore - now <= maxTimeoutSeconds + 60.
        valid_for = min(self.valid_for_seconds, requirements.max_timeout_seconds)
        authorization = create_authorization(
            self.account.address,
            requirements.pay_to,
            requirements.max_amount_required,
            valid_for_seconds=valid_for,
            now=self._clock(),
        )
        signature = sign_authorization(self.account, authorization, chain_id=self.network.chain_id, asset=self.network.usdg)
        return PaymentPayload(network=self.network.id, signature=signature, authorization=authorization)

    def _choose_requirements(self, response: httpx.Response) -> PaymentRequirements:
        try:
            body = response.json()
            accepts = [PaymentRequirements.from_dict(item) for item in body.get("accepts", [])]
        except (ValueError, KeyError, TypeError) as error:
            raise PaymentRequiredError(f"Malformed 402 response: {error}", reason="malformed_requirements") from error

        requirements = select_requirements(accepts, self.network)
        if requirements is None:
            reason = body.get("error") if isinstance(body, dict) else None
            raise PaymentRequiredError(
                f"No payment option for {self.network.name} USDG{f' ({reason})' if reason else ''}",
                reason=reason or "no_compatible_requirements",
                accepts=accepts,
            )
        return requirements

    @staticmethod
    def _settlement(response: httpx.Response) -> SettlementResponse | None:
        header = response.headers.get(PAYMENT_RESPONSE_HEADER)
        if not header:
            return None
        try:
            return SettlementResponse.from_dict(decode_header(header))
        except (ValueError, KeyError, TypeError):
            return None


def _error_of(response: httpx.Response) -> str | None:
    try:
        body = response.json()
    except ValueError:
        return None
    return body.get("error") if isinstance(body, dict) else None

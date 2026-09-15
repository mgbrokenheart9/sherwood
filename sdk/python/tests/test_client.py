"""X402Client against an in-process resource server that verifies payments like the app does."""

from __future__ import annotations

import httpx
import pytest
from eth_account import Account

from sherwood import (
    MAINNET,
    TESTNET,
    PaymentPayload,
    PaymentRequiredError,
    PaymentRequirements,
    PriceLimitExceededError,
    SettlementFailedError,
    X402Client,
    encode_header,
    verify_authorization_offline,
)

from .conftest import ANVIL_KEYS, NOW

PAYER = Account.from_key(ANVIL_KEYS[1])
MERCHANT = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
URL = "https://sherwood.example/api/x402/premium"
TX = "0x" + "ab" * 32


class ResourceServer:
    """Answers 402 with requirements, verifies X-PAYMENT offline, then 'settles' like src/app/api/x402/premium."""

    def __init__(self, requirements: PaymentRequirements, *, settle: bool = True) -> None:
        self.requirements = requirements
        self.settle = settle
        self.requests: list[httpx.Request] = []
        self.payments: list[PaymentPayload] = []

    def payment_required(self, error: str) -> httpx.Response:
        return httpx.Response(402, json={"x402Version": 1, "error": error, "accepts": [self.requirements.to_dict()]})

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        header = request.headers.get("X-PAYMENT")
        if header is None:
            return self.payment_required("X-PAYMENT header is required")

        payment = PaymentPayload.from_header(header)
        result = verify_authorization_offline(payment, self.requirements, now=NOW)
        if not result.is_valid:
            return self.payment_required(result.invalid_reason or "invalid_payment")
        if not self.settle:
            return self.payment_required("insufficient_funds")

        self.payments.append(payment)
        settlement = {"success": True, "network": payment.network, "payer": result.payer, "transaction": TX}
        return httpx.Response(200, json={"resource": "zkx8004-signal-feed", "payer": result.payer}, headers={"X-PAYMENT-RESPONSE": encode_header(settlement)})


def requirements(**overrides) -> PaymentRequirements:
    fields = {"network": MAINNET.id, "max_amount_required": 10_000, "resource": URL, "pay_to": MERCHANT, "asset": MAINNET.usdg}
    return PaymentRequirements(**{**fields, **overrides})


def client_for(server, *, max_amount="0.05", network=MAINNET) -> X402Client:
    return X402Client(PAYER, max_amount=max_amount, network=network, http=httpx.Client(transport=httpx.MockTransport(server)), clock=lambda: NOW)


def test_pays_and_returns_the_settlement():
    server = ResourceServer(requirements())
    with client_for(server) as client:
        result = client.get(URL)

    assert result.paid
    assert result.response.status_code == 200
    assert result.json() == {"resource": "zkx8004-signal-feed", "payer": PAYER.address}
    assert result.settlement is not None and result.settlement.transaction == TX
    assert len(server.requests) == 2 and len(server.payments) == 1
    assert server.payments[0].authorization.value == 10_000


def test_free_resources_pass_through_without_signing():
    with client_for(lambda request: httpx.Response(200, json={"free": True})) as client:
        result = client.get(URL)
    assert not result.paid and result.json() == {"free": True}


def test_refuses_to_sign_above_the_spending_limit():
    server = ResourceServer(requirements(max_amount_required=100_000))
    with client_for(server, max_amount="0.05") as client, pytest.raises(PriceLimitExceededError) as error:
        client.get(URL)
    assert (error.value.amount, error.value.limit) == (100_000, 50_000)
    assert len(server.requests) == 1


def test_accepts_integer_base_units_as_limit():
    server = ResourceServer(requirements())
    with client_for(server, max_amount=10_000) as client:
        assert client.get(URL).paid


def test_rejects_requirements_for_other_networks():
    server = ResourceServer(requirements())
    with client_for(server, network=TESTNET) as client, pytest.raises(PaymentRequiredError) as error:
        client.get(URL)
    assert error.value.reason == "X-PAYMENT header is required"
    assert error.value.accepts[0].network == MAINNET.id


def test_settlement_failure_raises_with_reason():
    server = ResourceServer(requirements(), settle=False)
    with client_for(server) as client, pytest.raises(SettlementFailedError) as error:
        client.get(URL)
    assert error.value.reason == "insufficient_funds"


def test_authorization_window_never_exceeds_max_timeout():
    server = ResourceServer(requirements(max_timeout_seconds=30))
    with client_for(server) as client:
        payment = client.get(URL).payment
    assert payment is not None
    assert payment.authorization.valid_before - NOW == 30


def test_keeps_method_and_custom_headers():
    server = ResourceServer(requirements())
    with client_for(server) as client:
        client.post(URL, headers={"X-Agent": "momentum"}, json={"topic": "USDG/ETH"})
    assert [request.method for request in server.requests] == ["POST", "POST"]
    assert all(request.headers["X-Agent"] == "momentum" for request in server.requests)
    assert server.requests[1].content == server.requests[0].content


def test_malformed_402_is_reported():
    with client_for(lambda request: httpx.Response(402, json={"accepts": [{"scheme": "exact"}]})) as client:
        with pytest.raises(PaymentRequiredError) as error:
            client.get(URL)
    assert error.value.reason == "malformed_requirements"

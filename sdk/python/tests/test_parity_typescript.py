"""Python-signed payments checked by the app's own TypeScript verifier (scripts/verify-payment-header.ts)."""

from __future__ import annotations

import dataclasses
import json
import shutil
import subprocess

import pytest
from eth_account import Account

from sherwood import MAINNET, PaymentPayload, PaymentRequirements, X402Client, verify_authorization_offline

from .conftest import NOW, REPO_ROOT

pytestmark = pytest.mark.parity

NODE = shutil.which("node")
TSX = REPO_ROOT / "node_modules" / "tsx" / "dist" / "cli.mjs"
MERCHANT = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"


def typescript_verdict(payment: PaymentPayload, requirements: PaymentRequirements, now: int) -> dict:
    if NODE is None or not TSX.exists():
        pytest.skip("Node.js and `npm install` at the repository root are needed for parity tests")
    completed = subprocess.run(
        [NODE, str(TSX), "scripts/verify-payment-header.ts"],
        input=json.dumps({"header": payment.to_header(), "requirements": requirements.to_dict(), "now": now}),
        capture_output=True,
        text=True,
        encoding="utf-8",
        cwd=REPO_ROOT,
        timeout=180,
    )
    if completed.returncode != 0:
        pytest.fail(f"TypeScript verifier exited with {completed.returncode}:\n{completed.stderr}")
    return json.loads(completed.stdout.strip().splitlines()[-1])


@pytest.fixture(scope="module")
def signed():
    requirements = PaymentRequirements.create(
        network=MAINNET, pay_to=MERCHANT, amount=10_000, resource="https://sherwood.example/api/x402/premium"
    )
    payer = Account.create()
    with X402Client(payer, max_amount="0.01", clock=lambda: NOW) as client:
        return requirements, client.create_payment(requirements)


def test_typescript_accepts_a_fresh_python_payment(signed):
    requirements, payment = signed
    verdict = typescript_verdict(payment, requirements, NOW)
    assert verdict == {"isValid": True, "payer": payment.authorization.from_address}


@pytest.mark.parametrize(
    ("change", "now_offset"),
    [
        ({"value": 20_000}, 0),
        ({"to": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"}, 0),
        ({"value": 9_999}, 0),
        ({}, 3_600),
    ],
    ids=["tampered-amount", "wrong-recipient", "underpayment", "expired"],
)
def test_both_verifiers_reject_for_the_same_reason(signed, change, now_offset):
    requirements, payment = signed
    tampered = dataclasses.replace(payment, authorization=dataclasses.replace(payment.authorization, **change))
    now = NOW + now_offset

    python = verify_authorization_offline(tampered, requirements, now=now)
    typescript = typescript_verdict(tampered, requirements, now)

    assert not python.is_valid
    assert typescript["isValid"] is False
    assert typescript["invalidReason"] == python.invalid_reason

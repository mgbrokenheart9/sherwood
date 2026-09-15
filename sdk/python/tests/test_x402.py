"""Offline x402 behaviour. Mirrors the checks in scripts/verify-x402.ts."""

import dataclasses

import pytest
from eth_account import Account
from eth_account.messages import encode_typed_data

from sherwood import MAINNET, TESTNET, PaymentPayload, PaymentRequirements, TransferAuthorization
from sherwood.x402 import (
    authorization_typed_data,
    create_authorization,
    decode_header,
    encode_header,
    recover_authorization_signer,
    sign_authorization,
    split_signature,
    verify_authorization_offline,
)

from .conftest import ANVIL_KEYS, NOW

PAYER = Account.from_key(ANVIL_KEYS[1])
STRANGER = Account.from_key(ANVIL_KEYS[2])
# Anvil account #3, distinct from PAYER (#1) and STRANGER (#2).
MERCHANT = "0x90F79bf6EB2c4f870365E785982E1f101E93b906"


def requirements(**overrides) -> PaymentRequirements:
    fields = {
        "network": MAINNET.id,
        "max_amount_required": 10_000,
        "resource": "https://sherwood.example/api/x402/premium",
        "pay_to": MERCHANT,
        "asset": MAINNET.usdg,
        "description": "verification",
    }
    return PaymentRequirements(**{**fields, **overrides})


def signed_payment(reqs: PaymentRequirements, *, valid_for: int = 120, signer=PAYER) -> PaymentPayload:
    authorization = create_authorization(PAYER.address, reqs.pay_to, reqs.max_amount_required, valid_for_seconds=valid_for, now=NOW)
    if signer is PAYER:
        signature = sign_authorization(PAYER, authorization, chain_id=MAINNET.chain_id, asset=MAINNET.usdg)
    else:
        typed = authorization_typed_data(authorization, chain_id=MAINNET.chain_id, asset=MAINNET.usdg)
        signature = "0x" + bytes(signer.sign_message(encode_typed_data(full_message=typed)).signature).hex()
    return PaymentPayload(network=MAINNET.id, signature=signature, authorization=authorization)


def with_authorization(payment: PaymentPayload, **changes) -> PaymentPayload:
    return dataclasses.replace(payment, authorization=dataclasses.replace(payment.authorization, **changes))


def reason(payment: PaymentPayload, reqs: PaymentRequirements, now: int = NOW) -> str | None:
    result = verify_authorization_offline(payment, reqs, now=now)
    assert result.payer == PAYER.address
    return result.invalid_reason


def test_valid_payment_passes_offline_verification():
    reqs = requirements()
    result = verify_authorization_offline(signed_payment(reqs), reqs, now=NOW)
    assert result.is_valid and result.invalid_reason is None


def test_header_round_trips():
    payment = signed_payment(requirements())
    assert PaymentPayload.from_header(payment.to_header()) == payment
    assert decode_header(encode_header({"a": "é", "b": [1, True, None]})) == {"a": "é", "b": [1, True, None]}


def test_authorization_window_matches_typescript_client():
    authorization = signed_payment(requirements()).authorization
    assert authorization.valid_after == NOW - 60
    assert authorization.valid_before == NOW + 120


@pytest.mark.parametrize(
    ("change", "expected"),
    [
        ({"value": 9_999}, "insufficient_amount"),
        ({"value": 20_000}, "invalid_signature"),
        ({"to": STRANGER.address}, "pay_to_mismatch"),
    ],
)
def test_tampered_authorizations_are_rejected(change, expected):
    reqs = requirements()
    assert reason(with_authorization(signed_payment(reqs), **change), reqs) == expected


def test_wrong_network_is_rejected():
    reqs = requirements()
    payment = dataclasses.replace(signed_payment(reqs), network=TESTNET.id)
    assert reason(payment, reqs) == "network_mismatch"


def test_expired_and_early_authorizations_are_rejected():
    reqs = requirements()
    payment = signed_payment(reqs)
    assert reason(payment, reqs, now=payment.authorization.valid_before + 10) == "authorization_expired"
    assert reason(payment, reqs, now=payment.authorization.valid_after - 60) == "authorization_not_yet_valid"


def test_overly_long_window_is_rejected():
    reqs = requirements(max_timeout_seconds=120)
    assert reason(signed_payment(reqs, valid_for=3_600), reqs) == "authorization_window_too_long"


def test_signature_from_another_key_is_rejected():
    reqs = requirements()
    assert reason(signed_payment(reqs, signer=STRANGER), reqs) == "invalid_signature"


def test_asset_and_unknown_network_checks():
    assert reason(signed_payment(requirements()), requirements(asset=TESTNET.usdg)) == "asset_mismatch"
    reqs = requirements(network="base-mainnet")
    payment = dataclasses.replace(signed_payment(reqs), network="base-mainnet")
    assert reason(payment, reqs) == "unsupported_network"


def test_sign_rejects_authorization_for_another_account():
    authorization = create_authorization(STRANGER.address, MERCHANT, 1, now=NOW)
    with pytest.raises(ValueError):
        sign_authorization(PAYER, authorization, chain_id=MAINNET.chain_id, asset=MAINNET.usdg)


def test_recover_and_split_signature():
    payment = signed_payment(requirements())
    signer = recover_authorization_signer(payment.authorization, payment.signature, chain_id=MAINNET.chain_id, asset=MAINNET.usdg)
    assert signer == PAYER.address

    v, r, s = split_signature(payment.signature)
    assert v in (27, 28)
    assert payment.signature == r + s[2:] + format(v, "02x")


def test_requirements_round_trip_and_validation():
    reqs = requirements(extra={"name": "Global Dollar", "version": "1", "caip2": "eip155:4663", "decimals": 6})
    assert PaymentRequirements.from_dict(reqs.to_dict()) == reqs

    bad = reqs.to_dict()
    for key, value in [("maxAmountRequired", 10_000), ("maxTimeoutSeconds", "120"), ("scheme", "upto"), ("payTo", "0x1234")]:
        with pytest.raises((ValueError, TypeError)):
            PaymentRequirements.from_dict({**bad, key: value})


def test_models_normalise_addresses_and_nonces():
    authorization = TransferAuthorization(
        from_address=PAYER.address.lower(), to=MERCHANT.lower(), value=1, valid_after=0, valid_before=1, nonce="0x" + "AB" * 32
    )
    assert authorization.from_address == PAYER.address
    assert authorization.to == MERCHANT
    assert authorization.nonce == "0x" + "ab" * 32


@pytest.mark.parametrize(
    "fields",
    [
        {"nonce": "0x1234"},
        {"value": -1},
        {"from_address": "0xnot-an-address"},
    ],
)
def test_authorization_validation(fields):
    base = {"from_address": PAYER.address, "to": MERCHANT, "value": 1, "valid_after": 0, "valid_before": 1, "nonce": "0x" + "00" * 32}
    with pytest.raises(ValueError):
        TransferAuthorization(**{**base, **fields})


def test_payment_payload_validation():
    payment = signed_payment(requirements())
    with pytest.raises(ValueError):
        dataclasses.replace(payment, signature="0x1234")
    with pytest.raises(ValueError):
        dataclasses.replace(payment, x402_version=2)
    with pytest.raises(ValueError):
        TransferAuthorization.from_dict({**payment.authorization.to_dict(), "value": "1.5"})

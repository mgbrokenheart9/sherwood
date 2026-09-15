"""x402 "exact" payments on Robinhood Chain, settled with USDG EIP-3009 ``transferWithAuthorization``.

Wire-compatible with ``src/lib/chain/x402.ts``: same JSON field order, header encoding, EIP-712 typed data and
offline verification reasons. ``test/vectors/x402-vectors.json`` pins the exact bytes for both implementations.
"""

from __future__ import annotations

import base64
import json
import secrets
import time
from collections.abc import Mapping
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any

from eth_account import Account
from eth_account.messages import SignableMessage, encode_typed_data
from eth_account.signers.local import LocalAccount
from eth_utils import keccak

from ._hex import bytes32_hex, is_hex, normalize_address, same_address, to_bytes32
from .networks import NETWORKS, Network

X402_VERSION = 1
PAYMENT_HEADER = "X-PAYMENT"
PAYMENT_RESPONSE_HEADER = "X-PAYMENT-RESPONSE"

USDG_DECIMALS = 6
USDG_DOMAIN_NAME = "Global Dollar"
USDG_DOMAIN_VERSION = "1"

#: Seconds of clock skew tolerated when checking validity windows (same as the TypeScript verifier).
CLOCK_SKEW_SECONDS = 6
DEFAULT_VALID_FOR_SECONDS = 120

EIP712_DOMAIN_TYPE = [
    {"name": "name", "type": "string"},
    {"name": "version", "type": "string"},
    {"name": "chainId", "type": "uint256"},
    {"name": "verifyingContract", "type": "address"},
]

TRANSFER_WITH_AUTHORIZATION_TYPE = [
    {"name": "from", "type": "address"},
    {"name": "to", "type": "address"},
    {"name": "value", "type": "uint256"},
    {"name": "validAfter", "type": "uint256"},
    {"name": "validBefore", "type": "uint256"},
    {"name": "nonce", "type": "bytes32"},
]


# --------------------------------------------------------------------------- amounts


def to_usdg_units(amount: str | int | Decimal | float) -> int:
    """Convert a USDG amount such as ``"0.01"`` to base units (``10000``).

    Unlike viem's ``parseUnits``, amounts with more than six decimals are rejected instead of rounded.
    """
    if isinstance(amount, bool):
        raise TypeError("USDG amount must be a number or a decimal string")
    if isinstance(amount, float):
        amount = f"{amount:.{USDG_DECIMALS}f}"
    try:
        value = Decimal(str(amount).strip())
    except InvalidOperation as error:
        raise ValueError(f"Invalid USDG amount: {amount!r}") from error
    if not value.is_finite() or value < 0:
        raise ValueError(f"Invalid USDG amount: {amount!r}")
    units = value.scaleb(USDG_DECIMALS)
    if units != units.to_integral_value():
        raise ValueError(f"USDG has {USDG_DECIMALS} decimals, got {amount!r}")
    return int(units)


def format_usdg(units: int) -> str:
    """Format base units as a plain decimal string: ``10000`` -> ``"0.01"``."""
    text = f"{Decimal(units).scaleb(-USDG_DECIMALS):f}"
    return text.rstrip("0").rstrip(".") if "." in text else text


# --------------------------------------------------------------------------- models


@dataclass(frozen=True)
class PaymentRequirements:
    """One entry of the ``accepts`` list in a 402 response."""

    network: str
    max_amount_required: int
    resource: str
    pay_to: str
    asset: str
    description: str = ""
    mime_type: str = "application/json"
    max_timeout_seconds: int = DEFAULT_VALID_FOR_SECONDS
    extra: Mapping[str, Any] = field(default_factory=dict)
    scheme: str = "exact"

    def __post_init__(self) -> None:
        if self.scheme != "exact":
            raise ValueError(f"Unsupported x402 scheme: {self.scheme!r}")
        if self.max_amount_required < 0 or self.max_timeout_seconds <= 0:
            raise ValueError("Payment requirements need a non-negative amount and a positive timeout")
        object.__setattr__(self, "pay_to", normalize_address(self.pay_to))
        object.__setattr__(self, "asset", normalize_address(self.asset))

    @classmethod
    def create(
        cls,
        *,
        network: Network,
        pay_to: str,
        amount: int,
        resource: str,
        description: str = "",
        mime_type: str = "application/json",
        max_timeout_seconds: int = DEFAULT_VALID_FOR_SECONDS,
    ) -> PaymentRequirements:
        """Requirements shaped like ``createRequirements`` in x402.ts, including the USDG ``extra`` block."""
        return cls(
            network=network.id,
            max_amount_required=amount,
            resource=resource,
            description=description,
            mime_type=mime_type,
            pay_to=pay_to,
            max_timeout_seconds=max_timeout_seconds,
            asset=network.usdg,
            extra={"name": USDG_DOMAIN_NAME, "version": USDG_DOMAIN_VERSION, "caip2": network.caip2, "decimals": USDG_DECIMALS},
        )

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> PaymentRequirements:
        amount = data["maxAmountRequired"]
        if not isinstance(amount, str) or not amount.isdigit():
            raise ValueError("maxAmountRequired must be an unsigned integer string")
        timeout = data["maxTimeoutSeconds"]
        if not isinstance(timeout, int) or isinstance(timeout, bool):
            raise ValueError("maxTimeoutSeconds must be an integer")
        return cls(
            scheme=data["scheme"],
            network=data["network"],
            max_amount_required=int(amount),
            resource=data["resource"],
            description=data.get("description", ""),
            mime_type=data.get("mimeType", "application/json"),
            pay_to=data["payTo"],
            max_timeout_seconds=timeout,
            asset=data["asset"],
            extra=dict(data.get("extra", {})),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "scheme": self.scheme,
            "network": self.network,
            "maxAmountRequired": str(self.max_amount_required),
            "resource": self.resource,
            "description": self.description,
            "mimeType": self.mime_type,
            "payTo": self.pay_to,
            "maxTimeoutSeconds": self.max_timeout_seconds,
            "asset": self.asset,
            "extra": dict(self.extra),
        }


@dataclass(frozen=True)
class TransferAuthorization:
    """EIP-3009 ``TransferWithAuthorization`` message. ``from`` is spelled ``from_address`` in Python."""

    from_address: str
    to: str
    value: int
    valid_after: int
    valid_before: int
    nonce: str

    def __post_init__(self) -> None:
        object.__setattr__(self, "from_address", normalize_address(self.from_address))
        object.__setattr__(self, "to", normalize_address(self.to))
        if not is_hex(self.nonce, 32):
            raise ValueError(f"Nonce must be 32 bytes of hex, got {self.nonce!r}")
        object.__setattr__(self, "nonce", self.nonce.lower())
        if min(self.value, self.valid_after, self.valid_before) < 0:
            raise ValueError("Authorization amounts and timestamps must be unsigned")

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> TransferAuthorization:
        def uint(key: str) -> int:
            value = data[key]
            if not isinstance(value, str) or not value.isdigit():
                raise ValueError(f"{key} must be an unsigned integer string")
            return int(value)

        return cls(
            from_address=data["from"],
            to=data["to"],
            value=uint("value"),
            valid_after=uint("validAfter"),
            valid_before=uint("validBefore"),
            nonce=data["nonce"],
        )

    def to_dict(self) -> dict[str, str]:
        return {
            "from": self.from_address,
            "to": self.to,
            "value": str(self.value),
            "validAfter": str(self.valid_after),
            "validBefore": str(self.valid_before),
            "nonce": self.nonce,
        }

    def message(self) -> dict[str, Any]:
        """The EIP-712 message with native types."""
        return {
            "from": self.from_address,
            "to": self.to,
            "value": self.value,
            "validAfter": self.valid_after,
            "validBefore": self.valid_before,
            "nonce": to_bytes32(self.nonce),
        }


@dataclass(frozen=True)
class PaymentPayload:
    """Decoded ``X-PAYMENT`` header."""

    network: str
    signature: str
    authorization: TransferAuthorization
    scheme: str = "exact"
    x402_version: int = X402_VERSION

    def __post_init__(self) -> None:
        if self.x402_version != X402_VERSION:
            raise ValueError(f"Unsupported x402 version: {self.x402_version!r}")
        if self.scheme != "exact":
            raise ValueError(f"Unsupported x402 scheme: {self.scheme!r}")
        if not is_hex(self.signature, 65):
            raise ValueError("Signature must be 65 bytes of hex")

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> PaymentPayload:
        payload = data["payload"]
        return cls(
            x402_version=data["x402Version"],
            scheme=data["scheme"],
            network=data["network"],
            signature=payload["signature"],
            authorization=TransferAuthorization.from_dict(payload["authorization"]),
        )

    @classmethod
    def from_header(cls, value: str) -> PaymentPayload:
        return cls.from_dict(decode_header(value))

    def to_dict(self) -> dict[str, Any]:
        return {
            "x402Version": self.x402_version,
            "scheme": self.scheme,
            "network": self.network,
            "payload": {"signature": self.signature, "authorization": self.authorization.to_dict()},
        }

    def to_header(self) -> str:
        return encode_header(self.to_dict())


@dataclass(frozen=True)
class SettlementResponse:
    """Decoded ``X-PAYMENT-RESPONSE`` header."""

    success: bool
    network: str
    transaction: str | None = None
    payer: str | None = None
    error_reason: str | None = None

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> SettlementResponse:
        return cls(
            success=bool(data["success"]),
            network=data["network"],
            transaction=data.get("transaction"),
            payer=data.get("payer"),
            error_reason=data.get("errorReason"),
        )


@dataclass(frozen=True)
class VerifyResult:
    is_valid: bool
    invalid_reason: str | None = None
    payer: str | None = None


@dataclass(frozen=True)
class Eip712Hashes:
    domain_separator: str
    struct_hash: str
    digest: str


# --------------------------------------------------------------------------- headers


def encode_header(value: Mapping[str, Any]) -> str:
    """Base64 of compact JSON, byte-identical to ``encodeHeader`` in x402.ts (``JSON.stringify`` + ``btoa``)."""
    text = json.dumps(value, separators=(",", ":"), ensure_ascii=False)
    return base64.b64encode(text.encode("utf-8")).decode("ascii")


def decode_header(value: str) -> Any:
    return json.loads(base64.b64decode(value, validate=True).decode("utf-8"))


# --------------------------------------------------------------------------- authorizations


def create_nonce() -> str:
    return "0x" + secrets.token_hex(32)


def create_authorization(
    from_address: str,
    to: str,
    value: int,
    *,
    valid_for_seconds: int = DEFAULT_VALID_FOR_SECONDS,
    now: float | None = None,
    nonce: str | None = None,
) -> TransferAuthorization:
    """Authorization valid from one minute ago for ``valid_for_seconds``, like ``createAuthorization`` in x402.ts."""
    now_seconds = int(time.time() if now is None else now)
    return TransferAuthorization(
        from_address=from_address,
        to=to,
        value=int(value),
        valid_after=now_seconds - 60,
        valid_before=now_seconds + valid_for_seconds,
        nonce=nonce or create_nonce(),
    )


def authorization_typed_data(authorization: TransferAuthorization, *, chain_id: int, asset: str) -> dict[str, Any]:
    """Full EIP-712 typed data for the USDG domain on ``chain_id`` at ``asset``."""
    return {
        "types": {"EIP712Domain": EIP712_DOMAIN_TYPE, "TransferWithAuthorization": TRANSFER_WITH_AUTHORIZATION_TYPE},
        "primaryType": "TransferWithAuthorization",
        "domain": {
            "name": USDG_DOMAIN_NAME,
            "version": USDG_DOMAIN_VERSION,
            "chainId": chain_id,
            "verifyingContract": normalize_address(asset),
        },
        "message": authorization.message(),
    }


def _signable(authorization: TransferAuthorization, chain_id: int, asset: str) -> SignableMessage:
    return encode_typed_data(full_message=authorization_typed_data(authorization, chain_id=chain_id, asset=asset))


def authorization_hashes(authorization: TransferAuthorization, *, chain_id: int, asset: str) -> Eip712Hashes:
    """Domain separator, struct hash and the digest that is actually signed."""
    signable = _signable(authorization, chain_id, asset)
    digest = keccak(b"\x19" + signable.version + signable.header + signable.body)
    return Eip712Hashes(bytes32_hex(signable.header), bytes32_hex(signable.body), bytes32_hex(digest))


def sign_authorization(account: LocalAccount, authorization: TransferAuthorization, *, chain_id: int, asset: str) -> str:
    """Sign with the payer's key. Returns the 65-byte ``r || s || v`` signature as hex."""
    if not same_address(account.address, authorization.from_address):
        raise ValueError("authorization.from_address must be the signing account")
    signed = account.sign_message(_signable(authorization, chain_id, asset))
    return "0x" + bytes(signed.signature).hex()


def recover_authorization_signer(authorization: TransferAuthorization, signature: str, *, chain_id: int, asset: str) -> str:
    return normalize_address(Account.recover_message(_signable(authorization, chain_id, asset), signature=signature))


def split_signature(signature: str) -> tuple[int, str, str]:
    """``(v, r, s)`` for ``transferWithAuthorization``."""
    if not is_hex(signature, 65):
        raise ValueError("Signature must be 65 bytes of hex")
    raw = bytes.fromhex(signature[2:])
    v = raw[64] if raw[64] >= 27 else raw[64] + 27
    return v, bytes32_hex(raw[:32]), bytes32_hex(raw[32:64])


# --------------------------------------------------------------------------- verification


def select_requirements(accepts: list[PaymentRequirements], network: Network) -> PaymentRequirements | None:
    """First "exact" requirement for ``network`` paid in that network's USDG."""
    for requirements in accepts:
        if requirements.network == network.id and same_address(requirements.asset, network.usdg):
            return requirements
    return None


def verify_authorization_offline(
    payment: PaymentPayload,
    requirements: PaymentRequirements,
    *,
    now: float | None = None,
    networks: Mapping[str, Network] = NETWORKS,
) -> VerifyResult:
    """Everything that does not need the chain: fields, amount, validity window and signature.

    Returns the same ``invalid_reason`` strings as ``verifyAuthorizationOffline`` in x402.ts.
    """
    authorization = payment.authorization
    payer = authorization.from_address

    def invalid(reason: str) -> VerifyResult:
        return VerifyResult(False, reason, payer)

    if payment.scheme != requirements.scheme:
        return invalid("unsupported_scheme")
    if payment.network != requirements.network:
        return invalid("network_mismatch")

    network = networks.get(requirements.network)
    if network is None:
        return invalid("unsupported_network")
    if not same_address(requirements.asset, network.usdg):
        return invalid("asset_mismatch")
    if not same_address(authorization.to, requirements.pay_to):
        return invalid("pay_to_mismatch")
    if authorization.value < requirements.max_amount_required:
        return invalid("insufficient_amount")

    now_seconds = int(time.time() if now is None else now)
    if authorization.valid_after > now_seconds + CLOCK_SKEW_SECONDS:
        return invalid("authorization_not_yet_valid")
    if authorization.valid_before <= now_seconds + CLOCK_SKEW_SECONDS:
        return invalid("authorization_expired")
    if authorization.valid_before - now_seconds > requirements.max_timeout_seconds + 60:
        return invalid("authorization_window_too_long")

    try:
        signer = recover_authorization_signer(
            authorization, payment.signature, chain_id=network.chain_id, asset=network.usdg
        )
    except Exception:  # noqa: BLE001 - any recovery failure means the signature is unusable
        return invalid("invalid_signature")
    if not same_address(signer, payer):
        return invalid("invalid_signature")

    return VerifyResult(True, None, payer)

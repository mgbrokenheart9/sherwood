"""Hex, bytes32 and address helpers shared across the SDK."""

from __future__ import annotations

import re

from eth_utils import is_address, to_checksum_address

ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

_HEX = re.compile(r"^0x[0-9a-fA-F]*$")


def strip_0x(value: str) -> str:
    return value[2:] if value[:2].lower() == "0x" else value


def is_hex(value: object, byte_length: int | None = None) -> bool:
    if not isinstance(value, str) or not _HEX.match(value) or len(value) % 2:
        return False
    return byte_length is None or len(value) == 2 + byte_length * 2


def to_bytes32(value: str | bytes) -> bytes:
    """Accept ``0x`` + 64 hex characters or 32 raw bytes."""
    if isinstance(value, (bytes, bytearray)):
        if len(value) != 32:
            raise ValueError(f"Expected 32 bytes, got {len(value)}")
        return bytes(value)
    if not is_hex(value, 32):
        raise ValueError(f"Expected 32 bytes of 0x-prefixed hex, got {value!r}")
    return bytes.fromhex(value[2:])


def bytes32_hex(value: bytes) -> str:
    if len(value) != 32:
        raise ValueError(f"Expected 32 bytes, got {len(value)}")
    return "0x" + value.hex()


def normalize_address(value: object) -> str:
    """Return the EIP-55 checksummed address, rejecting malformed input and bad checksums."""
    if not isinstance(value, str) or not is_address(value):
        raise ValueError(f"Invalid address: {value!r}")
    return to_checksum_address(value)


def same_address(a: str, b: str) -> bool:
    return a.lower() == b.lower()

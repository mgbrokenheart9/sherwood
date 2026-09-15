"""Identifiers and commitments derived exactly like the Sherwood console (``src/lib/runtime/contexts``).

* agent ids and capability hashes: ``keccak256`` of the UTF-8 string (``agents.ts``)
* configuration commitments: ``sha256`` of ``JSON.stringify({ capabilities, deploymentOptions })`` (``agents.ts``)
* proof commitments and nullifiers: ``sha256`` of the pre-images in ``privacy.ts``

JSON is serialised the way ``JSON.stringify`` does it, including JavaScript's key order where integer-like keys
come first. ``test/vectors/x402-vectors.json`` pins the results produced by the TypeScript code.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import secrets
from collections.abc import Mapping, Sequence
from typing import Any

from eth_utils import keccak

from ._hex import bytes32_hex

# Root collation order (ICU/CLDR) for printable ASCII, which is what String#localeCompare uses in Node.
# Whitespace and punctuation sort before digits, digits before letters, and letters ignore case at first.
_PUNCTUATION = " _-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$"
_PRIMARY: dict[str, int] = {char: index for index, char in enumerate(_PUNCTUATION)}
_PRIMARY.update({digit: 100 + index for index, digit in enumerate("0123456789")})
for _index, _letter in enumerate("abcdefghijklmnopqrstuvwxyz"):
    _PRIMARY[_letter] = _PRIMARY[_letter.upper()] = 200 + _index

_ARRAY_INDEX = re.compile(r"^(0|[1-9][0-9]*)$")


def agent_id(runtime_id: str) -> str:
    """On-chain agent id for a console agent id such as ``agent_mfq3k2x1a9b8c7``."""
    return bytes32_hex(keccak(text=runtime_id))


def capability_hash(capability: str) -> str:
    return bytes32_hex(keccak(text=capability))


def result_hash(runtime_id: str, capability: str, timestamp_ms: int) -> str:
    """Execution result hash recorded by the console: ``keccak256("<id>|<capability>|<Date.now()>")``."""
    return bytes32_hex(keccak(text=f"{runtime_id}|{capability}|{timestamp_ms}"))


def config_commitment(capabilities: Sequence[str], deployment_options: Mapping[str, Any]) -> str:
    """Commitment registered for an agent deployed without privacy mode."""
    payload = {"capabilities": list(capabilities), "deploymentOptions": dict(deployment_options)}
    return "0x" + hashlib.sha256(js_json(payload).encode("utf-8")).hexdigest()


def canonical_inputs(inputs: Mapping[str, str]) -> dict[str, str]:
    """Trim input names and order them like ``canonical()`` in privacy.ts.

    Names are compared with ICU root collation, which covers printable ASCII here; other characters raise
    ``ValueError`` rather than risk a commitment that the console would compute differently.
    """
    entries = sorted(((key.strip(), value) for key, value in inputs.items()), key=lambda entry: _collation_key(entry[0]))
    return _js_key_order(dict(entries))


def commitment_preimage(circuit: str, inputs: Mapping[str, str], salt: str) -> str:
    return f"commit|{circuit}|{js_json(canonical_inputs(inputs))}|{salt}"


def nullifier_preimage(salt: str) -> str:
    return f"nullifier|{salt}"


def proof_commitment(circuit: str, inputs: Mapping[str, str], salt: str) -> str:
    """Commitment the console anchors for a proof over ``inputs`` (``salt`` is 64 hex characters, no ``0x``)."""
    return "0x" + hashlib.sha256(commitment_preimage(circuit, inputs, salt).encode("utf-8")).hexdigest()


def proof_nullifier(salt: str) -> str:
    return "0x" + hashlib.sha256(nullifier_preimage(salt).encode("utf-8")).hexdigest()


def create_salt() -> str:
    return secrets.token_hex(32)


def js_json(value: Any) -> str:
    """Serialise like JavaScript's ``JSON.stringify`` for JSON-compatible Python values."""
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if not math.isfinite(value):
            return "null"
        if value.is_integer() and abs(value) < 1e21:
            return str(int(value))
        return repr(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, Mapping):
        ordered = _js_key_order({str(key): item for key, item in value.items()})
        return "{" + ",".join(f"{json.dumps(key, ensure_ascii=False)}:{js_json(item)}" for key, item in ordered.items()) + "}"
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(js_json(item) for item in value) + "]"
    raise TypeError(f"Cannot serialise {type(value).__name__} as JSON")


def _collation_key(name: str) -> tuple[tuple[int, ...], tuple[int, ...]]:
    try:
        primary = tuple(_PRIMARY[char] for char in name)
    except KeyError as error:
        raise ValueError(f"Unsupported character {error.args[0]!r} in input name {name!r}; use printable ASCII") from None
    # Tertiary level: lowercase before uppercase when the letters are otherwise equal.
    return primary, tuple(1 if char.isupper() else 0 for char in name)


def _is_array_index(key: str) -> bool:
    return bool(_ARRAY_INDEX.match(key)) and int(key) < 2**32 - 1


def _js_key_order(mapping: dict[str, Any]) -> dict[str, Any]:
    """JavaScript objects enumerate integer-like keys first, ascending, then the rest in insertion order."""
    indices = sorted((key for key in mapping if _is_array_index(key)), key=int)
    ordered = {key: mapping[key] for key in indices}
    ordered.update((key, item) for key, item in mapping.items() if not _is_array_index(key))
    return ordered

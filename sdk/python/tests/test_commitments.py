import pytest

from sherwood import agent_id, canonical_inputs, capability_hash, create_salt, proof_commitment, proof_nullifier
from sherwood.commitments import js_json


def keys(*names: str) -> list[str]:
    return list(canonical_inputs({name: "x" for name in names}))


def test_agent_id_is_keccak_of_utf8():
    assert agent_id("") == "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
    assert agent_id("agent_a") != agent_id("agent_b")
    assert capability_hash("payment_processing") == agent_id("payment_processing")


@pytest.mark.parametrize(
    ("names", "expected"),
    [
        (("b", "a"), ["a", "b"]),
        (("Asset", "asset"), ["asset", "Asset"]),
        (("B", "a"), ["a", "B"]),
        (("maxage", "max-age", "max_age"), ["max_age", "max-age", "maxage"]),
        (("a1", "1a"), ["1a", "a1"]),
        (("b", "10", "2"), ["2", "10", "b"]),
        (("zeta", "min.age", "min-age"), ["min-age", "min.age", "zeta"]),
    ],
)
def test_canonical_order(names, expected):
    assert keys(*names) == expected


def test_canonical_trims_names_and_keeps_values():
    assert canonical_inputs({" padded ": "value"}) == {"padded": "value"}


def test_canonical_rejects_non_ascii_names():
    with pytest.raises(ValueError):
        canonical_inputs({"größe": "1"})


@pytest.mark.parametrize(
    ("value", "text"),
    [
        ({"b": 1, "a": [True, None, 1.5, 2.0]}, '{"b":1,"a":[true,null,1.5,2]}'),
        ({"10": "x", "2": "y", "k": "z"}, '{"2":"y","10":"x","k":"z"}'),
        ("line\nbreak \"quoted\" é", '"line\\nbreak \\"quoted\\" é"'),
        (float("inf"), "null"),
        ([], "[]"),
    ],
)
def test_js_json(value, text):
    assert js_json(value) == text


def test_js_json_rejects_unsupported_types():
    with pytest.raises(TypeError):
        js_json({"when": object()})


def test_proof_commitment_depends_on_every_input():
    salt = create_salt()
    assert len(salt) == 64
    base = proof_commitment("balance-threshold", {"threshold": "1000"}, salt)
    assert base == proof_commitment("balance-threshold", {" threshold ": "1000"}, salt)
    assert base != proof_commitment("balance-threshold", {"threshold": "1001"}, salt)
    assert base != proof_commitment("agent-config", {"threshold": "1000"}, salt)
    assert base != proof_commitment("balance-threshold", {"threshold": "1000"}, create_salt())
    assert proof_nullifier(salt) != proof_nullifier(create_salt())

"""The SDK must reproduce test/vectors/x402-vectors.json, generated from the app's TypeScript code."""

from eth_account import Account

from sherwood import (
    PaymentPayload,
    PaymentRequirements,
    SettlementResponse,
    TransferAuthorization,
    agent_id,
    canonical_inputs,
    capability_hash,
    config_commitment,
    proof_commitment,
    proof_nullifier,
)
from sherwood.commitments import commitment_preimage, js_json, nullifier_preimage
from sherwood.x402 import authorization_hashes, decode_header, sign_authorization, split_signature, verify_authorization_offline


def vector_authorization(vectors) -> TransferAuthorization:
    auth = vectors["authorization"]
    return TransferAuthorization(
        from_address=auth["from"],
        to=auth["to"],
        value=auth["value"],
        valid_after=auth["validAfter"],
        valid_before=auth["validBefore"],
        nonce=auth["nonce"],
    )


def test_agent_ids_and_hashes(vectors):
    agent = vectors["agent"]
    assert agent_id(agent["runtimeId"]) == agent["agentId"]
    assert capability_hash(agent["capability"]) == agent["capabilityHash"]
    runtime_id, capability, timestamp = agent["resultInput"].split("|")
    from sherwood import result_hash

    assert result_hash(runtime_id, capability, int(timestamp)) == agent["resultHash"]


def test_config_commitment_uses_javascript_json(vectors):
    agent = vectors["agent"]
    assert js_json({"capabilities": agent["capabilities"], "deploymentOptions": agent["deploymentOptions"]}) == agent["configJson"]
    assert config_commitment(agent["capabilities"], agent["deploymentOptions"]) == agent["configCommitment"]


def test_canonical_input_order_matches_locale_compare(vectors):
    proof = vectors["proof"]
    assert list(canonical_inputs(proof["inputs"])) == proof["canonicalKeys"]


def test_proof_commitment_and_nullifier(vectors):
    proof = vectors["proof"]
    assert commitment_preimage(proof["circuit"], proof["inputs"], proof["salt"]) == proof["commitmentPreimage"]
    assert nullifier_preimage(proof["salt"]) == proof["nullifierPreimage"]
    assert proof_commitment(proof["circuit"], proof["inputs"], proof["salt"]) == proof["commitment"]
    assert proof_nullifier(proof["salt"]) == proof["nullifier"]


def test_eip712_hashes_match_viem(vectors):
    auth = vectors["authorization"]
    hashes = authorization_hashes(vector_authorization(vectors), chain_id=auth["chainId"], asset=auth["verifyingContract"])
    assert hashes.domain_separator == auth["domainSeparator"]
    assert hashes.struct_hash == auth["structHash"]
    assert hashes.digest == auth["digest"]


def test_signature_is_byte_identical_to_viem(vectors):
    auth = vectors["authorization"]
    account = Account.from_key(auth["privateKey"])
    assert account.address == auth["from"]

    signature = sign_authorization(account, vector_authorization(vectors), chain_id=auth["chainId"], asset=auth["verifyingContract"])
    assert signature == auth["signature"]
    assert split_signature(signature) == (auth["v"], auth["r"], auth["s"])


def test_payment_header_is_byte_identical(vectors):
    auth = vectors["authorization"]
    payment = PaymentPayload(network=auth["network"], signature=auth["signature"], authorization=vector_authorization(vectors))
    assert payment.to_header() == vectors["headers"]["payment"]
    assert PaymentPayload.from_header(vectors["headers"]["payment"]) == payment


def test_settlement_header_decodes(vectors):
    settlement = SettlementResponse.from_dict(decode_header(vectors["headers"]["settlement"]))
    expected = vectors["headers"]["settlementJson"]
    assert settlement.success is True
    assert settlement.transaction == expected["transaction"]
    assert settlement.payer == expected["payer"]


def test_requirements_round_trip_and_vector_payment_verifies(vectors):
    requirements = PaymentRequirements.from_dict(vectors["requirements"])
    assert requirements.to_dict() == vectors["requirements"]

    from sherwood import MAINNET

    created = PaymentRequirements.create(
        network=MAINNET,
        pay_to=vectors["requirements"]["payTo"],
        amount=int(vectors["requirements"]["maxAmountRequired"]),
        resource=vectors["requirements"]["resource"],
        description=vectors["requirements"]["description"],
    )
    assert created.to_dict() == vectors["requirements"]

    payment = PaymentPayload.from_header(vectors["headers"]["payment"])
    result = verify_authorization_offline(payment, requirements, now=vectors["authorization"]["now"])
    assert result.is_valid, result.invalid_reason

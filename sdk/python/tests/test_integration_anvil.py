"""End-to-end on a local anvil node: real transactions against the compiled Solidity contracts."""

from __future__ import annotations

import pytest
from eth_abi import encode
from eth_account import Account
from eth_utils import keccak

from sherwood import (
    JsonRpcClient,
    Network,
    PaymentRequirements,
    RegistryRevertError,
    RegistryWriter,
    RpcError,
    X402Client,
    agent_id,
    capability_hash,
    config_commitment,
    create_salt,
    deploy_contract,
    proof_commitment,
    proof_nullifier,
    result_hash,
    send_transaction,
    verify_authorization_offline,
)
from sherwood._hex import to_bytes32
from sherwood.registry import selector
from sherwood.x402 import split_signature

from .conftest import ANVIL_KEYS

pytestmark = pytest.mark.integration

ANVIL_CHAIN_ID = 31337


def calldata(signature: str, types: list[str], values: list) -> str:
    return "0x" + (selector(signature) + encode(types, values)).hex()


def read_uint(rpc: JsonRpcClient, to: str, signature: str, types: list[str], values: list) -> int:
    return int(rpc.call(to, calldata(signature, types, values)), 16)


def test_registry_lifecycle(anvil_url, foundry_bytecode):
    rpc = JsonRpcClient(anvil_url)
    owner, stranger = Account.from_key(ANVIL_KEYS[0]), Account.from_key(ANVIL_KEYS[1])

    deployment = deploy_contract(rpc, owner, foundry_bytecode("ZKx8004Registry.sol", "ZKx8004Registry"), chain_id=ANVIL_CHAIN_ID)
    registry = RegistryWriter(deployment.contract_address, rpc, owner)
    assert registry.has_code()

    runtime_id = "agent_python_integration"
    agent = agent_id(runtime_id)
    config = config_commitment(["payment_processing"], {"maxMemory": "256MB", "maxExecutionTime": "60s", "maxRequests": 10})

    registry.register_agent(agent, config)
    registry.record_execution(agent, capability_hash("payment_processing"), result_hash(runtime_id, "payment_processing", 1_760_000_000_000))

    stored = registry.get_agent(agent)
    assert (stored.owner, stored.executions, stored.active, stored.config_commitment) == (owner.address, 1, True, config)

    with pytest.raises(RegistryRevertError) as duplicate:
        registry.register_agent(agent, config)
    assert duplicate.value.error_name == "AgentAlreadyRegistered"

    with pytest.raises(RegistryRevertError) as not_owner:
        RegistryWriter(registry.address, rpc, stranger).set_agent_active(agent, False)
    assert not_owner.value.error_args == (agent, stranger.address)

    registry.set_agent_active(agent, False)
    with pytest.raises(RegistryRevertError) as inactive:
        registry.record_execution(agent, capability_hash("payment_processing"), "0x" + "00" * 32)
    assert inactive.value.error_name == "AgentInactive"

    salt = create_salt()
    commitment = proof_commitment("balance-threshold", {"threshold": "1000", "asset": "USDG"}, salt)
    registry.anchor_proof(commitment, proof_nullifier(salt), "balance-threshold")
    anchor = registry.get_anchor(commitment)
    assert anchor.owner == owner.address and anchor.nullifier == proof_nullifier(salt)
    assert registry.is_nullifier_used(proof_nullifier(salt))

    events = registry.events()
    assert [event.name for event in events] == ["AgentRegistered", "ExecutionRecorded", "AgentStatusChanged", "ProofAnchored"]
    assert events[3].args["circuit"] == "balance-threshold"

    executions = registry.events(names=["ExecutionRecorded"], agent_id=agent)
    assert len(executions) == 1 and executions[0].args["capability"] == capability_hash("payment_processing")


def test_python_signed_payment_settles_through_x402_settler(anvil_url, foundry_bytecode):
    rpc = JsonRpcClient(anvil_url)
    relayer, payer = Account.from_key(ANVIL_KEYS[0]), Account.from_key(ANVIL_KEYS[1])
    merchant = Account.from_key(ANVIL_KEYS[2]).address

    usdg = deploy_contract(rpc, relayer, foundry_bytecode("MockUSDG.sol", "MockUSDG"), chain_id=ANVIL_CHAIN_ID).contract_address
    settler = deploy_contract(
        rpc,
        relayer,
        foundry_bytecode("X402Settler.sol", "X402Settler"),
        chain_id=ANVIL_CHAIN_ID,
        constructor_args=encode(["address", "address"], [usdg, merchant]),
    ).contract_address
    send_transaction(rpc, relayer, to=usdg, data=calldata("mint(address,uint256)", ["address", "uint256"], [payer.address, 1_000_000]), chain_id=ANVIL_CHAIN_ID)

    local = Network(id="anvil", name="Anvil", chain_id=ANVIL_CHAIN_ID, rpc_urls=(anvil_url,), usdg=usdg, testnet=True)
    requirements = PaymentRequirements(network=local.id, max_amount_required=10_000, resource="http://127.0.0.1/api/x402/premium", pay_to=merchant, asset=usdg)

    now = int(rpc.get_block("latest")["timestamp"], 16)
    with X402Client(payer, network=local, max_amount="0.05", clock=lambda: now) as client:
        payment = client.create_payment(requirements)
    assert verify_authorization_offline(payment, requirements, now=now, networks={local.id: local}).is_valid

    auth = payment.authorization
    v, r, s = split_signature(payment.signature)
    settle = calldata(
        "settle(bytes32,(address,address,uint256,uint256,uint256,bytes32),uint8,bytes32,bytes32)",
        ["bytes32", "(address,address,uint256,uint256,uint256,bytes32)", "uint8", "bytes32", "bytes32"],
        [keccak(text=requirements.resource), (auth.from_address, auth.to, auth.value, auth.valid_after, auth.valid_before, to_bytes32(auth.nonce)), v, to_bytes32(r), to_bytes32(s)],
    )
    send_transaction(rpc, relayer, to=settler, data=settle, chain_id=ANVIL_CHAIN_ID)

    assert read_uint(rpc, usdg, "balanceOf(address)", ["address"], [merchant]) == 10_000
    assert read_uint(rpc, usdg, "balanceOf(address)", ["address"], [payer.address]) == 990_000
    assert read_uint(rpc, usdg, "authorizationState(address,bytes32)", ["address", "bytes32"], [payer.address, to_bytes32(auth.nonce)]) == 1

    with pytest.raises(RpcError):
        send_transaction(rpc, relayer, to=settler, data=settle, chain_id=ANVIL_CHAIN_ID)

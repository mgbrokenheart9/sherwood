import json

import httpx
import pytest
from eth_abi import encode
from eth_utils import keccak

from sherwood import JsonRpcClient, RegistryReader, RegistryRevertError, SherwoodError, agent_id
from sherwood.registry import EVENT_TOPICS, FUNCTION_SIGNATURES, decode_event, decode_revert, encode_call, selector

from .conftest import FOUNDRY_OUT

REGISTRY = "0x5FbDB2315678afecb367f032d93F642f64180aa3"
OWNER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
AGENT = agent_id("agent_codec")


def topic_address(address: str) -> str:
    return "0x" + "00" * 12 + address[2:].lower()


def log(name: str, topics: list[str], data: bytes) -> dict:
    return {"topics": [EVENT_TOPICS[name], *topics], "data": "0x" + data.hex(), "blockNumber": "0x10", "transactionHash": "0x" + "cd" * 32, "logIndex": "0x2"}


def test_selectors_match_the_foundry_artifact():
    artifact = FOUNDRY_OUT / "ZKx8004Registry.sol" / "ZKx8004Registry.json"
    if not artifact.exists():
        pytest.skip("run `forge build` to compare against the compiled ABI")
    identifiers = json.loads(artifact.read_text(encoding="utf-8"))["methodIdentifiers"]
    for signature in FUNCTION_SIGNATURES.values():
        assert identifiers[signature] == selector(signature).hex()


def test_encode_call():
    data = encode_call("setAgentActive", bytes.fromhex(AGENT[2:]), True)
    assert data == "0x" + (keccak(text="setAgentActive(bytes32,bool)")[:4] + encode(["bytes32", "bool"], [bytes.fromhex(AGENT[2:]), True])).hex()


def test_decode_revert():
    data = selector("NotAgentOwner(bytes32,address)") + encode(["bytes32", "address"], [bytes.fromhex(AGENT[2:]), OWNER])
    assert decode_revert("0x" + data.hex()) == ("NotAgentOwner", (AGENT, OWNER))
    assert decode_revert(selector("EmptyValue()")) == ("EmptyValue", ())
    assert decode_revert("0x08c379a0") is None
    assert decode_revert("not hex") is None
    assert decode_revert(None) is None


def test_decode_events():
    commitment, nullifier = "0x" + "11" * 32, "0x" + "22" * 32

    anchored = decode_event(log("ProofAnchored", [commitment, nullifier, topic_address(OWNER)], encode(["string"], ["balance-threshold"])))
    assert anchored.args == {"commitment": commitment, "nullifier": nullifier, "owner": OWNER, "circuit": "balance-threshold"}
    assert (anchored.block_number, anchored.log_index) == (16, 2)

    registered = decode_event(log("AgentRegistered", [AGENT, topic_address(OWNER)], bytes.fromhex("33" * 32)))
    assert registered.args == {"agentId": AGENT, "owner": OWNER, "configCommitment": "0x" + "33" * 32}

    status = decode_event(log("AgentStatusChanged", [AGENT], encode(["bool"], [False])))
    assert status.args == {"agentId": AGENT, "active": False}

    execution = decode_event(log("ExecutionRecorded", [AGENT, "0x" + "44" * 32], bytes.fromhex("55" * 32)))
    assert execution.args == {"agentId": AGENT, "capability": "0x" + "44" * 32, "resultHash": "0x" + "55" * 32}

    assert decode_event({"topics": ["0x" + "99" * 32], "data": "0x"}) is None


def reader(handler) -> tuple[RegistryReader, list[dict]]:
    requests: list[dict] = []

    def transport(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        requests.append(body)
        return handler(body)

    return RegistryReader(REGISTRY, JsonRpcClient("https://rpc.example", client=httpx.Client(transport=httpx.MockTransport(transport)))), requests


def ok(value) -> httpx.Response:
    return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": value})


def test_get_agent_decodes_the_struct():
    struct = encode(["(address,uint64,uint32,bool,bytes32)"], [(OWNER, 1_760_000_000, 7, True, b"\x66" * 32)])
    registry, requests = reader(lambda body: ok("0x" + struct.hex()))

    agent = registry.get_agent(AGENT)
    assert (agent.owner, agent.registered_at, agent.executions, agent.active) == (OWNER, 1_760_000_000, 7, True)
    assert agent.config_commitment == "0x" + "66" * 32 and agent.exists
    assert requests[0]["params"][0]["data"] == encode_call("getAgent", bytes.fromhex(AGENT[2:]))


def test_reads_fail_clearly_without_a_contract():
    registry, _ = reader(lambda body: ok("0x"))
    with pytest.raises(SherwoodError, match="No registry contract"):
        registry.is_nullifier_used("0x" + "00" * 32)


def test_revert_data_nested_by_the_node_is_decoded():
    revert = "0x" + (selector("UnknownAgent(bytes32)") + bytes.fromhex(AGENT[2:])).hex()
    error = {"code": -32000, "message": "execution reverted", "data": {"data": revert}}
    registry, _ = reader(lambda body: httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "error": error}))
    with pytest.raises(RegistryRevertError) as raised:
        registry.get_anchor("0x" + "00" * 32)
    assert (raised.value.error_name, raised.value.error_args) == ("UnknownAgent", (AGENT,))


def test_events_build_topic_filters_and_sort():
    logs = [
        log("ExecutionRecorded", [AGENT, "0x" + "44" * 32], bytes(32)) | {"blockNumber": "0x20", "logIndex": "0x0"},
        log("AgentRegistered", [AGENT, topic_address(OWNER)], bytes(32)) | {"blockNumber": "0x10", "logIndex": "0x5"},
    ]
    registry, requests = reader(lambda body: ok(logs))

    events = registry.events(names=["AgentRegistered", "ExecutionRecorded"], agent_id=AGENT, from_block=16)
    assert [event.name for event in events] == ["AgentRegistered", "ExecutionRecorded"]
    assert requests[0]["params"][0]["topics"] == [[EVENT_TOPICS["AgentRegistered"], EVENT_TOPICS["ExecutionRecorded"]], AGENT]

    with pytest.raises(ValueError):
        registry.events(agent_id=AGENT)
    with pytest.raises(ValueError):
        registry.events(names=["Transfer"])

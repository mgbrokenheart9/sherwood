"""Read and write the ZKx8004 registry (``contracts/ZKx8004Registry.sol``) from Python."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Any

from eth_abi import decode, encode
from eth_account.signers.local import LocalAccount
from eth_utils import keccak

from ._hex import ZERO_ADDRESS, bytes32_hex, normalize_address, strip_0x, to_bytes32
from .errors import RegistryRevertError, RpcError, SherwoodError, TransactionFailedError
from .networks import Network
from .rpc import JsonRpcClient

AGENT_TUPLE = "(address,uint64,uint32,bool,bytes32)"

FUNCTION_SIGNATURES = {
    "anchorProof": "anchorProof(bytes32,bytes32,string)",
    "getAnchor": "getAnchor(bytes32)",
    "nullifierUsed": "nullifierUsed(bytes32)",
    "registerAgent": "registerAgent(bytes32,bytes32)",
    "setAgentActive": "setAgentActive(bytes32,bool)",
    "recordExecution": "recordExecution(bytes32,bytes32,bytes32)",
    "getAgent": "getAgent(bytes32)",
}

EVENT_SIGNATURES = {
    "ProofAnchored": "ProofAnchored(bytes32,bytes32,address,string)",
    "AgentRegistered": "AgentRegistered(bytes32,address,bytes32)",
    "AgentStatusChanged": "AgentStatusChanged(bytes32,bool)",
    "ExecutionRecorded": "ExecutionRecorded(bytes32,bytes32,bytes32)",
}

ERROR_SIGNATURES = (
    "EmptyValue()",
    "AlreadyAnchored(bytes32)",
    "NullifierAlreadyUsed(bytes32)",
    "AgentAlreadyRegistered(bytes32)",
    "UnknownAgent(bytes32)",
    "NotAgentOwner(bytes32,address)",
    "AgentInactive(bytes32)",
)


def selector(signature: str) -> bytes:
    return keccak(text=signature)[:4]


def _arg_types(signature: str) -> list[str]:
    inner = signature[signature.index("(") + 1 : -1]
    return [part for part in inner.split(",") if part]


EVENT_TOPICS = {name: bytes32_hex(keccak(text=signature)) for name, signature in EVENT_SIGNATURES.items()}
_EVENT_BY_TOPIC = {topic: name for name, topic in EVENT_TOPICS.items()}
_ERROR_BY_SELECTOR = {selector(sig): (sig[: sig.index("(")], _arg_types(sig)) for sig in ERROR_SIGNATURES}


def encode_call(function: str, *args: Any) -> str:
    signature = FUNCTION_SIGNATURES[function]
    return "0x" + (selector(signature) + encode(_arg_types(signature), list(args))).hex()


def _normalize(abi_type: str, value: Any) -> Any:
    if abi_type == "bytes32":
        return bytes32_hex(value)
    if abi_type == "address":
        return normalize_address(value)
    return value


def decode_revert(data: str | bytes | None) -> tuple[str, tuple[Any, ...]] | None:
    """Decode registry custom errors from revert data; ``None`` for anything else."""
    if isinstance(data, str):
        try:
            data = bytes.fromhex(strip_0x(data))
        except ValueError:
            return None
    if not data or len(data) < 4 or data[:4] not in _ERROR_BY_SELECTOR:
        return None
    name, types = _ERROR_BY_SELECTOR[data[:4]]
    values = decode(types, data[4:]) if types else ()
    return name, tuple(_normalize(t, v) for t, v in zip(types, values))


def _revert_or(error: RpcError) -> SherwoodError:
    data = error.data.get("data") if isinstance(error.data, dict) else error.data
    decoded = decode_revert(data)
    return RegistryRevertError(*decoded) if decoded else error


# --------------------------------------------------------------------------- models


@dataclass(frozen=True)
class Agent:
    agent_id: str
    owner: str
    registered_at: int
    executions: int
    active: bool
    config_commitment: str

    @property
    def exists(self) -> bool:
        return self.owner != ZERO_ADDRESS


@dataclass(frozen=True)
class ProofAnchor:
    commitment: str
    owner: str
    anchored_at: int
    nullifier: str

    @property
    def exists(self) -> bool:
        return self.owner != ZERO_ADDRESS


@dataclass(frozen=True)
class RegistryEvent:
    name: str
    args: dict[str, Any]
    block_number: int
    transaction_hash: str
    log_index: int


@dataclass(frozen=True)
class TransactionResult:
    hash: str
    block_number: int
    gas_used: int
    status: int
    contract_address: str | None = None


def _topic_address(topic: str) -> str:
    return normalize_address("0x" + strip_0x(topic)[-40:])


def decode_event(log: dict[str, Any]) -> RegistryEvent | None:
    """Decode a registry log. Logs from other contracts or events return ``None``."""
    topics = [topic.lower() for topic in log.get("topics", [])]
    name = _EVENT_BY_TOPIC.get(topics[0]) if topics else None
    if name is None:
        return None
    data = bytes.fromhex(strip_0x(log["data"]))

    if name == "ProofAnchored":
        args = {"commitment": topics[1], "nullifier": topics[2], "owner": _topic_address(topics[3]), "circuit": decode(["string"], data)[0]}
    elif name == "AgentRegistered":
        args = {"agentId": topics[1], "owner": _topic_address(topics[2]), "configCommitment": bytes32_hex(decode(["bytes32"], data)[0])}
    elif name == "AgentStatusChanged":
        args = {"agentId": topics[1], "active": decode(["bool"], data)[0]}
    else:
        args = {"agentId": topics[1], "capability": topics[2], "resultHash": bytes32_hex(decode(["bytes32"], data)[0])}

    return RegistryEvent(
        name=name,
        args=args,
        block_number=int(log["blockNumber"], 16),
        transaction_hash=log["transactionHash"],
        log_index=int(log["logIndex"], 16),
    )


# --------------------------------------------------------------------------- reader


class RegistryReader:
    def __init__(self, address: str, rpc: JsonRpcClient) -> None:
        self.address = normalize_address(address)
        self.rpc = rpc

    @classmethod
    def for_network(cls, network: Network, address: str, *, timeout: float = 10.0) -> RegistryReader:
        return cls(address, JsonRpcClient(network.rpc_urls, timeout=timeout))

    def has_code(self) -> bool:
        return strip_0x(self.rpc.get_code(self.address)) != ""

    def _read(self, function: str, args: Sequence[Any], output_types: list[str]) -> tuple[Any, ...]:
        try:
            result = self.rpc.call(self.address, encode_call(function, *args))
        except RpcError as error:
            raise _revert_or(error) from None
        if strip_0x(result) == "":
            raise SherwoodError(f"No registry contract at {self.address}")
        return decode(output_types, bytes.fromhex(strip_0x(result)))

    def get_agent(self, agent_id: str | bytes) -> Agent:
        key = to_bytes32(agent_id)
        ((owner, registered_at, executions, active, config),) = self._read("getAgent", [key], [AGENT_TUPLE])
        return Agent(bytes32_hex(key), normalize_address(owner), registered_at, executions, active, bytes32_hex(config))

    def get_anchor(self, commitment: str | bytes) -> ProofAnchor:
        key = to_bytes32(commitment)
        owner, anchored_at, nullifier = self._read("getAnchor", [key], ["address", "uint64", "bytes32"])
        return ProofAnchor(bytes32_hex(key), normalize_address(owner), anchored_at, bytes32_hex(nullifier))

    def is_nullifier_used(self, nullifier: str | bytes) -> bool:
        (used,) = self._read("nullifierUsed", [to_bytes32(nullifier)], ["bool"])
        return used

    def events(
        self,
        *,
        from_block: int | str = 0,
        to_block: int | str = "latest",
        names: Iterable[str] | None = None,
        agent_id: str | bytes | None = None,
    ) -> list[RegistryEvent]:
        """Registry events in chain order, optionally filtered by event name and agent id."""
        selected = list(names) if names is not None else list(EVENT_TOPICS)
        unknown = [name for name in selected if name not in EVENT_TOPICS]
        if unknown:
            raise ValueError(f"Unknown registry events: {', '.join(unknown)}")

        topics: list[Any] = [[EVENT_TOPICS[name] for name in selected]]
        if agent_id is not None:
            if "ProofAnchored" in selected:
                raise ValueError("agent_id does not apply to ProofAnchored; pass names without it")
            topics.append(bytes32_hex(to_bytes32(agent_id)))

        logs = self.rpc.get_logs(address=self.address, topics=topics, from_block=from_block, to_block=to_block)
        events = [event for event in map(decode_event, logs) if event is not None]
        return sorted(events, key=lambda event: (event.block_number, event.log_index))


# --------------------------------------------------------------------------- writer


def send_transaction(
    rpc: JsonRpcClient,
    account: LocalAccount,
    *,
    data: str,
    chain_id: int,
    to: str | None = None,
    value: int = 0,
    gas_margin: float = 1.2,
    timeout: float = 120.0,
) -> TransactionResult:
    """Estimate, sign (EIP-1559) and send a transaction, then wait for the receipt.

    Reverts caught during estimation are decoded into :class:`RegistryRevertError` before anything is sent.
    """
    call: dict[str, Any] = {"from": account.address, "data": data, "value": hex(value)}
    if to is not None:
        call["to"] = normalize_address(to)
    try:
        gas = rpc.estimate_gas(call)
    except RpcError as error:
        raise _revert_or(error) from None

    base_fee = int(rpc.get_block("latest").get("baseFeePerGas") or "0x0", 16)
    try:
        priority_fee = rpc.max_priority_fee_per_gas()
    except RpcError:
        priority_fee = 0

    tx: dict[str, Any] = {
        "type": 2,
        "chainId": chain_id,
        "nonce": rpc.get_transaction_count(account.address, "pending"),
        "gas": int(gas * gas_margin),
        "maxFeePerGas": base_fee * 2 + priority_fee,
        "maxPriorityFeePerGas": priority_fee,
        "value": value,
        "data": data,
    }
    if to is not None:
        tx["to"] = normalize_address(to)

    signed = account.sign_transaction(tx)
    tx_hash = rpc.send_raw_transaction(bytes(signed.raw_transaction))
    receipt = rpc.wait_for_receipt(tx_hash, timeout=timeout)

    contract = receipt.get("contractAddress")
    result = TransactionResult(
        hash=tx_hash,
        block_number=int(receipt["blockNumber"], 16),
        gas_used=int(receipt["gasUsed"], 16),
        status=int(receipt["status"], 16),
        contract_address=normalize_address(contract) if contract else None,
    )
    if result.status != 1:
        raise TransactionFailedError(result)
    return result


def deploy_contract(
    rpc: JsonRpcClient, account: LocalAccount, bytecode: str, *, chain_id: int | None = None, constructor_args: bytes = b""
) -> TransactionResult:
    """Deploy creation bytecode (e.g. from ``forge build``) and return the receipt with ``contract_address``."""
    data = "0x" + strip_0x(bytecode) + constructor_args.hex()
    return send_transaction(rpc, account, data=data, chain_id=chain_id or rpc.chain_id())


class RegistryWriter(RegistryReader):
    """Registry reader that can also send transactions from a local account."""

    def __init__(self, address: str, rpc: JsonRpcClient, account: LocalAccount, *, chain_id: int | None = None) -> None:
        super().__init__(address, rpc)
        self.account = account
        self._chain_id = chain_id

    @property
    def chain_id(self) -> int:
        if self._chain_id is None:
            self._chain_id = self.rpc.chain_id()
        return self._chain_id

    def _send(self, function: str, *args: Any) -> TransactionResult:
        return send_transaction(self.rpc, self.account, to=self.address, data=encode_call(function, *args), chain_id=self.chain_id)

    def register_agent(self, agent_id: str | bytes, config_commitment: str | bytes) -> TransactionResult:
        return self._send("registerAgent", to_bytes32(agent_id), to_bytes32(config_commitment))

    def set_agent_active(self, agent_id: str | bytes, active: bool) -> TransactionResult:
        return self._send("setAgentActive", to_bytes32(agent_id), active)

    def record_execution(self, agent_id: str | bytes, capability: str | bytes, result_hash: str | bytes) -> TransactionResult:
        return self._send("recordExecution", to_bytes32(agent_id), to_bytes32(capability), to_bytes32(result_hash))

    def anchor_proof(self, commitment: str | bytes, nullifier: str | bytes, circuit: str) -> TransactionResult:
        return self._send("anchorProof", to_bytes32(commitment), to_bytes32(nullifier), circuit)

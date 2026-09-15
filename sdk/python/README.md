# Sherwood Python SDK

Python client for [Sherwood](../../README.md), powered by ZKx8004 on Robinhood Chain:

- **x402 payments**: fetch resources that answer `402 Payment Required` by signing a USDG EIP-3009 authorization, with a spending limit enforced before anything is signed.
- **ZKx8004 registry**: read agents, proof anchors and events; register agents and record executions from a local key.
- **Console-compatible ids**: agent ids, capability hashes, configuration and proof commitments computed exactly like the web console.

It is wire-compatible with the TypeScript implementation in `src/lib/chain/x402.ts`. Both are tested against the same vectors (`test/vectors/x402-vectors.json`), down to the signature bytes and the `X-PAYMENT` header.

## Install

```bash
cd sdk/python
uv venv && uv pip install -e ".[dev]"     # or: python -m venv .venv && pip install -e ".[dev]"
```

Requires Python 3.10+. Runtime dependencies: `eth-account` and `httpx`.

## Pay for an x402 resource

```python
from eth_account import Account
from sherwood import TESTNET, X402Client

payer = Account.from_key(os.environ["SHERWOOD_PRIVATE_KEY"])

with X402Client(payer, network=TESTNET, max_amount="0.05") as client:
    result = client.get("https://your-sherwood-host/api/x402/premium")

print(result.json())
print(result.settlement.transaction)   # USDG transfer settled by the facilitator
```

`max_amount` is required. A resource that asks for more raises `PriceLimitExceededError` and no signature is produced. The authorization window is capped by the resource's `maxTimeoutSeconds`, and requirements for another network or asset are refused.

## Use the registry

```python
from sherwood import JsonRpcClient, RegistryWriter, TESTNET, agent_id, capability_hash, config_commitment, result_hash

rpc = JsonRpcClient(TESTNET.rpc_urls)
registry = RegistryWriter("0xYourRegistry", rpc, payer)

runtime_id = "agent_mfq3k2x1a9b8c7"
registry.register_agent(agent_id(runtime_id), config_commitment(["payment_processing"], {"maxRequests": 1000}))
registry.record_execution(agent_id(runtime_id), capability_hash("payment_processing"), result_hash(runtime_id, "payment_processing", 1760000000000))

print(registry.get_agent(agent_id(runtime_id)))
for event in registry.events(agent_id=agent_id(runtime_id), names=["AgentRegistered", "ExecutionRecorded"]):
    print(event.name, event.args)
```

Reverts are decoded before a transaction is sent: registering an existing id raises `RegistryRevertError` with `error_name == "AgentAlreadyRegistered"`.

## Command line

```bash
sherwood networks
sherwood --network testnet status
sherwood agent-id agent_mfq3k2x1a9b8c7
sherwood --network testnet agent agent_mfq3k2x1a9b8c7 --registry 0xYourRegistry
sherwood --network testnet events --registry 0xYourRegistry --from-block 1000000
SHERWOOD_PRIVATE_KEY=0x... sherwood --network testnet pay https://your-sherwood-host/api/x402/premium --max 0.05
```

The private key is only read from the environment, never from arguments.

## Examples

| Script | What it does |
| --- | --- |
| [`examples/pay_premium.py`](examples/pay_premium.py) | Buys the premium signal feed and prints the settlement link |
| [`examples/register_agent.py`](examples/register_agent.py) | Registers an agent and records one execution |
| [`examples/watch_registry.py`](examples/watch_registry.py) | Follows registry events as new blocks arrive |
| [`examples/verify_header.py`](examples/verify_header.py) | Checks an `X-PAYMENT` header offline, like a resource server would |

## Tests

```bash
uv run --extra dev pytest                  # everything available on this machine
uv run --extra dev pytest -m "not integration and not parity"   # pure unit tests
```

- **Unit tests** need nothing else.
- **Integration tests** (`-m integration`) start a local `anvil`, deploy the registry, `MockUSDG` and `X402Settler` from `forge build` artifacts, then register agents, anchor proofs and settle a Python-signed payment on-chain. They are skipped when Foundry is missing.
- **Parity tests** (`-m parity`) send Python-signed payments through the app's own TypeScript verifier (`scripts/verify-payment-header.ts`). They need Node.js and `npm install` at the repository root.

## Compatibility notes

- USDG amounts with more than 6 decimals are rejected rather than rounded.
- Proof input names are ordered with ICU root collation for printable ASCII, matching `localeCompare` in the console. Other characters raise `ValueError`.

"""Register an agent in the ZKx8004 registry and record one execution, the same way the console does.

    SHERWOOD_PRIVATE_KEY=0x... REGISTRY_ADDRESS=0x... python examples/register_agent.py --network testnet
"""

from __future__ import annotations

import argparse
import os
import secrets
import sys
import time

from eth_account import Account

from sherwood import (
    JsonRpcClient,
    RegistryWriter,
    SherwoodError,
    agent_id,
    capability_hash,
    config_commitment,
    get_network,
    result_hash,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--network", default="testnet")
    parser.add_argument("--capability", default="contract_interaction")
    args = parser.parse_args()

    key, registry_address = os.environ.get("SHERWOOD_PRIVATE_KEY"), os.environ.get("REGISTRY_ADDRESS")
    if not key or not registry_address:
        print("Set SHERWOOD_PRIVATE_KEY (holds a little ETH for gas) and REGISTRY_ADDRESS.", file=sys.stderr)
        return 2

    network = get_network(args.network)
    runtime_id = f"agent_py{secrets.token_hex(6)}"
    options = {"maxMemory": "512MB", "maxExecutionTime": "300s", "maxRequests": 1000}

    with JsonRpcClient(network.rpc_urls) as rpc:
        registry = RegistryWriter(registry_address, rpc, Account.from_key(key), chain_id=network.chain_id)
        try:
            registered = registry.register_agent(agent_id(runtime_id), config_commitment([args.capability], options))
            print(f"Registered {runtime_id} → {agent_id(runtime_id)}")
            print(network.explorer_tx(registered.hash))

            executed = registry.record_execution(
                agent_id(runtime_id), capability_hash(args.capability), result_hash(runtime_id, args.capability, int(time.time() * 1000))
            )
            print(f"Recorded {args.capability}: {network.explorer_tx(executed.hash)}")
        except SherwoodError as error:
            print(f"Registry call failed: {error}", file=sys.stderr)
            return 1

        print(registry.get_agent(agent_id(runtime_id)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

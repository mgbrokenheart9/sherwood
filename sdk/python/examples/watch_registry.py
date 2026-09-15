"""Follow ZKx8004 registry events as new blocks arrive.

    python examples/watch_registry.py 0xYourRegistry --network testnet --lookback 5000
"""

from __future__ import annotations

import argparse
import time

from sherwood import JsonRpcClient, RegistryReader, RpcError, get_network


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("registry")
    parser.add_argument("--network", default="testnet")
    parser.add_argument("--lookback", type=int, default=5_000, help="blocks to replay before following new ones")
    parser.add_argument("--interval", type=float, default=4.0, help="seconds between polls")
    args = parser.parse_args()

    network = get_network(args.network)
    with JsonRpcClient(network.rpc_urls) as rpc:
        registry = RegistryReader(args.registry, rpc)
        next_block = max(0, rpc.block_number() - args.lookback)
        print(f"Watching {registry.address} on {network.name} from block {next_block}. Ctrl+C to stop.")

        try:
            while True:
                head = rpc.block_number()
                if head >= next_block:
                    try:
                        for event in registry.events(from_block=next_block, to_block=head):
                            print(f"#{event.block_number} {event.name:<19} {event.args}")
                        next_block = head + 1
                    except RpcError as error:
                        print(f"retrying after RPC error: {error}")
                time.sleep(args.interval)
        except KeyboardInterrupt:
            return 0


if __name__ == "__main__":
    raise SystemExit(main())

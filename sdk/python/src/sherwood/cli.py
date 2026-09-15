"""``sherwood`` command line interface."""

from __future__ import annotations

import argparse
import dataclasses
import json
import os
import sys
from collections.abc import Sequence
from typing import Any

from eth_account import Account

from . import __version__
from ._hex import is_hex
from .client import X402Client
from .commitments import agent_id
from .errors import SherwoodError
from .networks import NETWORKS, Network, get_network
from .registry import RegistryReader
from .rpc import JsonRpcClient
from .x402 import format_usdg

PRIVATE_KEY_ENV = "SHERWOOD_PRIVATE_KEY"


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="sherwood",
        description="Pay x402 resources with USDG and read the ZKx8004 registry on Robinhood Chain.",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    parser.add_argument("--network", default="mainnet", help="mainnet, testnet, a network id or a chain id")
    parser.add_argument("--rpc-url", action="append", help="use this RPC endpoint instead (repeat for fallbacks)")
    commands = parser.add_subparsers(dest="command", required=True)

    commands.add_parser("networks", help="list supported networks")
    commands.add_parser("status", help="chain id, block height and gas price")

    derive = commands.add_parser("agent-id", help="on-chain id for a console agent id")
    derive.add_argument("runtime_id")

    agent = commands.add_parser("agent", help="read an agent from the registry")
    agent.add_argument("agent", help="console agent id or 0x-prefixed on-chain id")
    agent.add_argument("--registry", required=True, help="registry address")

    events = commands.add_parser("events", help="list registry events")
    events.add_argument("--registry", required=True, help="registry address")
    events.add_argument("--from-block", type=int, default=0)
    events.add_argument("--to-block", default="latest")

    pay = commands.add_parser("pay", help=f"fetch an x402 resource, signing with ${PRIVATE_KEY_ENV}")
    pay.add_argument("url")
    pay.add_argument("--max", required=True, dest="max_usdg", help="highest price you accept, in USDG (e.g. 0.05)")
    return parser


def _network(args: argparse.Namespace) -> Network:
    network = get_network(args.network)
    return dataclasses.replace(network, rpc_urls=tuple(args.rpc_url)) if args.rpc_url else network


def _print(value: Any) -> None:
    print(json.dumps(value, indent=2, default=str))


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        return _run(args)
    except SherwoodError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


def _run(args: argparse.Namespace) -> int:
    if args.command == "networks":
        _print([{"id": n.id, "name": n.name, "chainId": n.chain_id, "usdg": n.usdg, "explorer": n.explorer_url} for n in NETWORKS.values()])
        return 0

    if args.command == "agent-id":
        print(agent_id(args.runtime_id))
        return 0

    network = _network(args)

    if args.command == "status":
        with JsonRpcClient(network.rpc_urls) as rpc:
            _print({"network": network.id, "chainId": rpc.chain_id(), "blockNumber": rpc.block_number(), "gasPriceWei": rpc.gas_price()})
        return 0

    if args.command in ("agent", "events"):
        with JsonRpcClient(network.rpc_urls) as rpc:
            registry = RegistryReader(args.registry, rpc)
            if args.command == "agent":
                key = args.agent if is_hex(args.agent, 32) else agent_id(args.agent)
                _print(dataclasses.asdict(registry.get_agent(key)))
            else:
                to_block = int(args.to_block) if str(args.to_block).isdigit() else args.to_block
                _print([dataclasses.asdict(event) for event in registry.events(from_block=args.from_block, to_block=to_block)])
        return 0

    if args.command == "pay":
        key = os.environ.get(PRIVATE_KEY_ENV)
        if not key:
            print(f"error: set {PRIVATE_KEY_ENV} to the payer's private key", file=sys.stderr)
            return 2
        with X402Client(Account.from_key(key), network=network, max_amount=args.max_usdg) as client:
            result = client.get(args.url)
        transaction = result.settlement.transaction if result.settlement else None
        _print(
            {
                "status": result.response.status_code,
                "paidUsdg": format_usdg(result.requirements.max_amount_required) if result.requirements else "0",
                "transaction": transaction,
                "explorer": network.explorer_tx(transaction) if transaction else None,
                "body": _body(result.response),
            }
        )
        return 0

    raise AssertionError(f"unhandled command {args.command}")


def _body(response: Any) -> Any:
    try:
        return response.json()
    except ValueError:
        return response.text


if __name__ == "__main__":
    raise SystemExit(main())

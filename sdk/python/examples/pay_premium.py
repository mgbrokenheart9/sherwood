"""Buy the Sherwood premium signal feed over x402 and print the settlement link.

    SHERWOOD_PRIVATE_KEY=0x... python examples/pay_premium.py https://your-sherwood-host/api/x402/premium \
        --network testnet --max 0.05
"""

from __future__ import annotations

import argparse
import json
import os
import sys

from eth_account import Account

from sherwood import SherwoodError, X402Client, format_usdg, get_network


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("url")
    parser.add_argument("--network", default="testnet")
    parser.add_argument("--max", default="0.05", help="highest price accepted, in USDG")
    args = parser.parse_args()

    key = os.environ.get("SHERWOOD_PRIVATE_KEY")
    if not key:
        print("Set SHERWOOD_PRIVATE_KEY to a funded payer key (USDG only, no ETH needed).", file=sys.stderr)
        return 2

    network = get_network(args.network)
    try:
        with X402Client(Account.from_key(key), network=network, max_amount=args.max) as client:
            result = client.get(args.url)
    except SherwoodError as error:
        print(f"Payment failed: {error}", file=sys.stderr)
        return 1

    if result.paid and result.requirements:
        print(f"Paid {format_usdg(result.requirements.max_amount_required)} USDG on {network.name}")
        if result.settlement and result.settlement.transaction:
            print(network.explorer_tx(result.settlement.transaction))
    print(json.dumps(result.json(), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

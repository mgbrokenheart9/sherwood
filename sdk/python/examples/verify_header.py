"""Check an X-PAYMENT header offline, the way a resource server does before settling.

    python examples/verify_header.py "<base64 header>" --pay-to 0xMerchant --amount 0.01 --network mainnet
"""

from __future__ import annotations

import argparse
import json

from sherwood import PaymentPayload, PaymentRequirements, get_network, to_usdg_units, verify_authorization_offline


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("header")
    parser.add_argument("--pay-to", required=True)
    parser.add_argument("--amount", required=True, help="price in USDG")
    parser.add_argument("--network", default="mainnet")
    parser.add_argument("--resource", default="")
    args = parser.parse_args()

    network = get_network(args.network)
    payment = PaymentPayload.from_header(args.header)
    requirements = PaymentRequirements(
        network=network.id,
        max_amount_required=to_usdg_units(args.amount),
        resource=args.resource,
        pay_to=args.pay_to,
        asset=network.usdg,
    )

    print(json.dumps(payment.to_dict(), indent=2))
    result = verify_authorization_offline(payment, requirements)
    print("valid" if result.is_valid else f"invalid: {result.invalid_reason}")
    return 0 if result.is_valid else 1


if __name__ == "__main__":
    raise SystemExit(main())

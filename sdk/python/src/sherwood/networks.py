"""Robinhood Chain networks, mirrored from ``src/lib/chain/config.ts``.

Public RPCs come first because the robinhood.com endpoints are blocked on some networks.
"""

from __future__ import annotations

from dataclasses import dataclass

from ._hex import normalize_address
from .errors import UnknownNetworkError


@dataclass(frozen=True)
class Network:
    id: str
    name: str
    chain_id: int
    rpc_urls: tuple[str, ...]
    usdg: str
    explorer_url: str = ""
    testnet: bool = False

    def __post_init__(self) -> None:
        object.__setattr__(self, "usdg", normalize_address(self.usdg))
        if not self.rpc_urls:
            raise ValueError(f"Network {self.id} needs at least one RPC URL")

    @property
    def caip2(self) -> str:
        return f"eip155:{self.chain_id}"

    def explorer_tx(self, tx_hash: str) -> str | None:
        return f"{self.explorer_url}/tx/{tx_hash}" if self.explorer_url else None

    def explorer_address(self, address: str) -> str | None:
        return f"{self.explorer_url}/address/{address}" if self.explorer_url else None


MAINNET = Network(
    id="robinhood-mainnet",
    name="Robinhood Chain",
    chain_id=4663,
    rpc_urls=(
        "https://robinhood-rpc.publicnode.com",
        "https://rpc.mainnet.chain.robinhood.com",
        "https://rpc.nodeflare.app/robinhood/public",
    ),
    usdg="0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    explorer_url="https://robinhoodchain.blockscout.com",
)

TESTNET = Network(
    id="robinhood-testnet",
    name="Robinhood Chain Testnet",
    chain_id=46630,
    rpc_urls=(
        "https://robinhood-sepolia-rpc.publicnode.com",
        "https://rpc.testnet.chain.robinhood.com",
        "https://robinhood-testnet.drpc.org",
    ),
    usdg="0x7E955252E15c84f5768B83c41a71F9eba181802F",
    explorer_url="https://explorer.testnet.chain.robinhood.com",
    testnet=True,
)

NETWORKS: dict[str, Network] = {network.id: network for network in (MAINNET, TESTNET)}

_ALIASES = {"mainnet": MAINNET, "testnet": TESTNET}


def get_network(value: str | int) -> Network:
    """Look up a network by id (``robinhood-testnet``), alias (``testnet``) or chain id (``46630``)."""
    if isinstance(value, int) or (isinstance(value, str) and value.isdigit()):
        chain_id = int(value)
        for network in NETWORKS.values():
            if network.chain_id == chain_id:
                return network
    elif isinstance(value, str):
        key = value.strip().lower()
        if key in NETWORKS:
            return NETWORKS[key]
        if key in _ALIASES:
            return _ALIASES[key]
    raise UnknownNetworkError(f"Unknown network {value!r}. Use one of: {', '.join([*_ALIASES, *NETWORKS])}")

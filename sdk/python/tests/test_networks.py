import dataclasses

import pytest

from sherwood import MAINNET, NETWORKS, TESTNET, UnknownNetworkError, get_network


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("mainnet", MAINNET),
        ("testnet", TESTNET),
        ("robinhood-testnet", TESTNET),
        (" Robinhood-Mainnet ", MAINNET),
        (4663, MAINNET),
        ("46630", TESTNET),
    ],
)
def test_get_network_accepts_ids_aliases_and_chain_ids(value, expected):
    assert get_network(value) is expected


@pytest.mark.parametrize("value", ["base", 1, "", "robinhood"])
def test_get_network_rejects_unknown_values(value):
    with pytest.raises(UnknownNetworkError):
        get_network(value)


def test_networks_mirror_the_app_config():
    assert MAINNET.chain_id == 4663 and TESTNET.chain_id == 46630
    assert MAINNET.usdg == "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"
    assert TESTNET.usdg == "0x7E955252E15c84f5768B83c41a71F9eba181802F"
    assert MAINNET.caip2 == "eip155:4663"
    assert set(NETWORKS) == {"robinhood-mainnet", "robinhood-testnet"}
    # Public RPCs come first because robinhood.com endpoints are blocked on some networks.
    assert "publicnode" in MAINNET.rpc_urls[0] and "publicnode" in TESTNET.rpc_urls[0]


def test_explorer_links():
    assert MAINNET.explorer_tx("0xabc") == "https://robinhoodchain.blockscout.com/tx/0xabc"
    assert TESTNET.explorer_address("0xdef") == "https://explorer.testnet.chain.robinhood.com/address/0xdef"
    local = dataclasses.replace(MAINNET, id="anvil", explorer_url="")
    assert local.explorer_tx("0xabc") is None


def test_network_normalises_usdg_and_requires_rpc():
    network = dataclasses.replace(MAINNET, usdg=MAINNET.usdg.lower())
    assert network.usdg == MAINNET.usdg
    with pytest.raises(ValueError):
        dataclasses.replace(MAINNET, rpc_urls=())

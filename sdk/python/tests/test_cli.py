import json

from sherwood import agent_id
from sherwood.cli import PRIVATE_KEY_ENV, main


def test_agent_id(capsys):
    assert main(["agent-id", "agent_mfq3k2x1a9b8c7"]) == 0
    assert capsys.readouterr().out.strip() == agent_id("agent_mfq3k2x1a9b8c7")


def test_networks(capsys):
    assert main(["networks"]) == 0
    networks = json.loads(capsys.readouterr().out)
    assert {network["chainId"] for network in networks} == {4663, 46630}


def test_unknown_network_is_a_clean_error(capsys):
    assert main(["--network", "base", "status"]) == 1
    assert "Unknown network" in capsys.readouterr().err


def test_pay_requires_the_key_in_the_environment(capsys, monkeypatch):
    monkeypatch.delenv(PRIVATE_KEY_ENV, raising=False)
    assert main(["pay", "https://sherwood.example/api/x402/premium", "--max", "0.01"]) == 2
    assert PRIVATE_KEY_ENV in capsys.readouterr().err

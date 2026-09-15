from __future__ import annotations

import json
import shutil
import socket
import subprocess
import time
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest

SDK_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SDK_ROOT.parents[1]
VECTORS_PATH = REPO_ROOT / "test" / "vectors" / "x402-vectors.json"
FOUNDRY_OUT = REPO_ROOT / "out"

#: Anvil's public default accounts. The local node funds them with test ETH; never use them on a real network.
ANVIL_KEYS = (
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
)

NOW = 1_760_000_000


@pytest.fixture(scope="session")
def vectors() -> dict[str, Any]:
    return json.loads(VECTORS_PATH.read_text(encoding="utf-8"))


def _find_anvil() -> str | None:
    found = shutil.which("anvil")
    if found:
        return found
    for name in ("anvil.exe", "anvil"):
        candidate = Path.home() / ".foundry" / "bin" / name
        if candidate.exists():
            return str(candidate)
    return None


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture(scope="session")
def anvil_url() -> Iterator[str]:
    anvil = _find_anvil()
    if anvil is None:
        pytest.skip("anvil not found; install Foundry to run the integration tests")

    port = _free_port()
    process = subprocess.Popen([anvil, "--port", str(port), "--silent"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    url = f"http://127.0.0.1:{port}"
    deadline = time.monotonic() + 30
    try:
        while True:
            try:
                response = httpx.post(url, json={"jsonrpc": "2.0", "id": 1, "method": "eth_chainId", "params": []}, timeout=1)
                if response.status_code == 200:
                    break
            except httpx.TransportError:
                pass
            if process.poll() is not None or time.monotonic() > deadline:
                pytest.fail("anvil did not start")
            time.sleep(0.2)
        yield url
    finally:
        process.terminate()
        process.wait(timeout=10)


@pytest.fixture(scope="session")
def foundry_bytecode() -> Callable[[str, str], str]:
    def load(source: str, contract: str) -> str:
        path = FOUNDRY_OUT / source / f"{contract}.json"
        if not path.exists():
            pytest.skip(f"{path.relative_to(REPO_ROOT)} is missing; run `forge build` at the repository root")
        return json.loads(path.read_text(encoding="utf-8"))["bytecode"]["object"]

    return load

"""Minimal JSON-RPC client with ordered fallback, like the viem ``fallback`` transport the app uses."""

from __future__ import annotations

import itertools
import time
from collections.abc import Sequence
from typing import Any

import httpx

from .errors import RpcError

#: HTTP statuses that move on to the next endpoint instead of failing the call.
RETRYABLE_STATUS = frozenset({408, 425, 429, 500, 502, 503, 504})

BlockTag = int | str


def _block(value: BlockTag) -> str:
    return hex(value) if isinstance(value, int) else value


class JsonRpcClient:
    """Tries each URL in order. Transport failures fall through; node errors (e.g. reverts) are raised at once."""

    def __init__(self, urls: str | Sequence[str], *, timeout: float = 10.0, client: httpx.Client | None = None) -> None:
        self.urls: tuple[str, ...] = (urls,) if isinstance(urls, str) else tuple(urls)
        if not self.urls:
            raise ValueError("At least one RPC URL is required")
        self._client = client or httpx.Client(timeout=timeout)
        self._owns_client = client is None
        self._ids = itertools.count(1)

    def __enter__(self) -> JsonRpcClient:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def request(self, method: str, params: Sequence[Any] = ()) -> Any:
        failures: list[str] = []
        for url in self.urls:
            payload = {"jsonrpc": "2.0", "id": next(self._ids), "method": method, "params": list(params)}
            try:
                response = self._client.post(url, json=payload)
            except httpx.TransportError as error:
                failures.append(f"{url}: {error.__class__.__name__}")
                continue
            if response.status_code in RETRYABLE_STATUS:
                failures.append(f"{url}: HTTP {response.status_code}")
                continue
            try:
                body = response.json()
            except ValueError:
                failures.append(f"{url}: non-JSON response (HTTP {response.status_code})")
                continue
            error = body.get("error") if isinstance(body, dict) else None
            if error:
                raise RpcError(error.get("message", "JSON-RPC error"), code=error.get("code"), data=error.get("data"), url=url)
            if not isinstance(body, dict) or "result" not in body:
                failures.append(f"{url}: malformed JSON-RPC response")
                continue
            return body["result"]
        raise RpcError(f"All RPC endpoints failed for {method}: {'; '.join(failures)}")

    # ------------------------------------------------------------------ eth_* helpers

    def chain_id(self) -> int:
        return int(self.request("eth_chainId"), 16)

    def block_number(self) -> int:
        return int(self.request("eth_blockNumber"), 16)

    def gas_price(self) -> int:
        return int(self.request("eth_gasPrice"), 16)

    def max_priority_fee_per_gas(self) -> int:
        return int(self.request("eth_maxPriorityFeePerGas"), 16)

    def get_block(self, block: BlockTag = "latest") -> dict[str, Any]:
        return self.request("eth_getBlockByNumber", [_block(block), False])

    def get_balance(self, address: str, block: BlockTag = "latest") -> int:
        return int(self.request("eth_getBalance", [address, _block(block)]), 16)

    def get_code(self, address: str, block: BlockTag = "latest") -> str:
        return self.request("eth_getCode", [address, _block(block)])

    def get_transaction_count(self, address: str, block: BlockTag = "pending") -> int:
        return int(self.request("eth_getTransactionCount", [address, _block(block)]), 16)

    def call(self, to: str, data: str, *, from_address: str | None = None, block: BlockTag = "latest") -> str:
        tx: dict[str, str] = {"to": to, "data": data}
        if from_address:
            tx["from"] = from_address
        return self.request("eth_call", [tx, _block(block)])

    def estimate_gas(self, tx: dict[str, Any]) -> int:
        return int(self.request("eth_estimateGas", [tx]), 16)

    def get_logs(
        self, *, address: str, topics: Sequence[Any], from_block: BlockTag = 0, to_block: BlockTag = "latest"
    ) -> list[dict[str, Any]]:
        return self.request(
            "eth_getLogs",
            [{"address": address, "topics": list(topics), "fromBlock": _block(from_block), "toBlock": _block(to_block)}],
        )

    def send_raw_transaction(self, raw: bytes | str) -> str:
        return self.request("eth_sendRawTransaction", ["0x" + raw.hex() if isinstance(raw, bytes) else raw])

    def get_transaction_receipt(self, tx_hash: str) -> dict[str, Any] | None:
        return self.request("eth_getTransactionReceipt", [tx_hash])

    def wait_for_receipt(self, tx_hash: str, *, timeout: float = 60.0, poll_interval: float = 1.0) -> dict[str, Any]:
        deadline = time.monotonic() + timeout
        while True:
            receipt = self.get_transaction_receipt(tx_hash)
            if receipt is not None:
                return receipt
            if time.monotonic() >= deadline:
                raise RpcError(f"Timed out after {timeout:.0f}s waiting for {tx_hash}")
            time.sleep(poll_interval)

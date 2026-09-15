import json

import httpx
import pytest

from sherwood import JsonRpcClient, RpcError

PRIMARY = "https://primary.example"
BACKUP = "https://backup.example"


def rpc_with(handler) -> tuple[JsonRpcClient, list[str]]:
    seen: list[str] = []

    def transport(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url).rstrip("/"))
        return handler(request)

    return JsonRpcClient([PRIMARY, BACKUP], client=httpx.Client(transport=httpx.MockTransport(transport))), seen


def result(value) -> httpx.Response:
    return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": value})


def test_falls_back_on_connection_errors():
    def handler(request):
        if request.url.host == "primary.example":
            raise httpx.ConnectError("blocked", request=request)
        return result("0x1237")

    rpc, seen = rpc_with(handler)
    assert rpc.chain_id() == 4663
    assert seen == [PRIMARY, BACKUP]


@pytest.mark.parametrize(
    "failure",
    [httpx.Response(503, text="unavailable"), httpx.Response(403, text="<html>blocked</html>"), httpx.Response(200, json={"jsonrpc": "2.0"})],
)
def test_falls_back_on_bad_responses(failure):
    rpc, seen = rpc_with(lambda request: failure if request.url.host == "primary.example" else result("0x10"))
    assert rpc.block_number() == 16
    assert seen == [PRIMARY, BACKUP]


def test_node_errors_are_raised_without_trying_other_endpoints():
    error = {"code": 3, "message": "execution reverted", "data": "0xdeadbeef"}
    rpc, seen = rpc_with(lambda request: httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "error": error}))
    with pytest.raises(RpcError) as raised:
        rpc.call("0x" + "11" * 20, "0x")
    assert (raised.value.code, raised.value.data, raised.value.url) == (3, "0xdeadbeef", PRIMARY)
    assert seen == [PRIMARY]


def test_reports_every_failed_endpoint():
    rpc, _ = rpc_with(lambda request: httpx.Response(502))
    with pytest.raises(RpcError, match="primary.example: HTTP 502; https://backup.example: HTTP 502"):
        rpc.gas_price()


def test_sends_well_formed_requests():
    captured = []

    def handler(request):
        captured.append(json.loads(request.content))
        return result([])

    rpc, _ = rpc_with(handler)
    rpc.get_logs(address="0x" + "22" * 20, topics=[["0xaa"]], from_block=100)
    rpc.send_raw_transaction(b"\x01\x02")

    assert captured[0]["method"] == "eth_getLogs"
    assert captured[0]["params"][0] == {"address": "0x" + "22" * 20, "topics": [["0xaa"]], "fromBlock": "0x64", "toBlock": "latest"}
    assert captured[1]["params"] == ["0x0102"]
    assert captured[0]["id"] != captured[1]["id"]


def test_wait_for_receipt_times_out():
    rpc, _ = rpc_with(lambda request: result(None))
    with pytest.raises(RpcError, match="Timed out"):
        rpc.wait_for_receipt("0x" + "33" * 32, timeout=0, poll_interval=0)


def test_requires_at_least_one_url():
    with pytest.raises(ValueError):
        JsonRpcClient([])

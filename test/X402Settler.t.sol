// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC3009} from "../contracts/interfaces/IERC3009.sol";
import {X402Settler} from "../contracts/examples/X402Settler.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";

contract X402SettlerTest is Test {
    MockUSDG internal usdg;
    X402Settler internal settler;

    address internal merchant = makeAddr("merchant");
    address internal relayer = makeAddr("relayer");
    address internal payer;
    uint256 internal payerKey;

    bytes32 internal constant RESOURCE = keccak256("https://sherwood.local/api/x402/premium");
    uint256 internal constant PRICE = 10_000; // 0.01 USDG

    function setUp() public {
        vm.warp(1_760_000_000);
        (payer, payerKey) = makeAddrAndKey("payer");

        usdg = new MockUSDG();
        settler = new X402Settler(IERC3009(address(usdg)), merchant);
        usdg.mint(payer, 1_000_000_000); // 1,000 USDG
    }

    function test_Constructor_RevertsOnZeroAsset() public {
        vm.expectRevert(X402Settler.ZeroAddress.selector);
        new X402Settler(IERC3009(address(0)), merchant);
    }

    function test_Constructor_RevertsOnZeroMerchant() public {
        vm.expectRevert(X402Settler.ZeroAddress.selector);
        new X402Settler(IERC3009(address(usdg)), address(0));
    }

    function test_Settle_MovesFundsToMerchant() public {
        X402Settler.Authorization memory auth = _authorization(merchant, PRICE, "nonce-1");
        (uint8 v, bytes32 r, bytes32 s) = _sign(payerKey, auth);

        vm.prank(relayer);
        settler.settle(RESOURCE, auth, v, r, s);

        assertEq(usdg.balanceOf(merchant), PRICE);
        assertEq(usdg.balanceOf(payer), 1_000_000_000 - PRICE);
        assertEq(usdg.balanceOf(relayer), 0);
        assertTrue(usdg.authorizationState(payer, auth.nonce));
    }

    function test_Settle_EmitsReceipt() public {
        X402Settler.Authorization memory auth = _authorization(merchant, PRICE, "nonce-receipt");
        (uint8 v, bytes32 r, bytes32 s) = _sign(payerKey, auth);

        vm.expectEmit(address(settler));
        emit X402Settler.PaymentSettled(payer, RESOURCE, auth.nonce, PRICE, relayer);

        vm.prank(relayer);
        settler.settle(RESOURCE, auth, v, r, s);
    }

    function test_Settle_RevertsWhenRecipientIsNotMerchant() public {
        X402Settler.Authorization memory auth = _authorization(relayer, PRICE, "nonce-redirect");
        (uint8 v, bytes32 r, bytes32 s) = _sign(payerKey, auth);

        vm.expectRevert(abi.encodeWithSelector(X402Settler.WrongRecipient.selector, relayer));
        settler.settle(RESOURCE, auth, v, r, s);
    }

    function test_Settle_RevertsOnReplay() public {
        X402Settler.Authorization memory auth = _authorization(merchant, PRICE, "nonce-replay");
        (uint8 v, bytes32 r, bytes32 s) = _sign(payerKey, auth);
        settler.settle(RESOURCE, auth, v, r, s);

        vm.expectRevert(abi.encodeWithSelector(MockUSDG.AuthorizationAlreadyUsed.selector, payer, auth.nonce));
        settler.settle(RESOURCE, auth, v, r, s);
    }

    function test_Settle_RevertsWhenSignedByAnotherKey() public {
        (, uint256 strangerKey) = makeAddrAndKey("stranger");
        X402Settler.Authorization memory auth = _authorization(merchant, PRICE, "nonce-forged");
        (uint8 v, bytes32 r, bytes32 s) = _sign(strangerKey, auth);

        vm.expectRevert(MockUSDG.InvalidSignature.selector);
        settler.settle(RESOURCE, auth, v, r, s);
    }

    function test_Settle_RevertsWhenAmountWasTamperedWith() public {
        X402Settler.Authorization memory auth = _authorization(merchant, PRICE, "nonce-tampered");
        (uint8 v, bytes32 r, bytes32 s) = _sign(payerKey, auth);
        auth.value = PRICE * 100;

        vm.expectRevert(MockUSDG.InvalidSignature.selector);
        settler.settle(RESOURCE, auth, v, r, s);
    }

    function test_Settle_RevertsWhenExpired() public {
        X402Settler.Authorization memory auth = _authorization(merchant, PRICE, "nonce-expired");
        (uint8 v, bytes32 r, bytes32 s) = _sign(payerKey, auth);
        vm.warp(auth.validBefore);

        vm.expectRevert(MockUSDG.AuthorizationExpired.selector);
        settler.settle(RESOURCE, auth, v, r, s);
    }

    function test_Settle_RevertsBeforeValidAfter() public {
        X402Settler.Authorization memory auth = _authorization(merchant, PRICE, "nonce-early");
        auth.validAfter = block.timestamp + 30;
        (uint8 v, bytes32 r, bytes32 s) = _sign(payerKey, auth);

        vm.expectRevert(MockUSDG.AuthorizationNotYetValid.selector);
        settler.settle(RESOURCE, auth, v, r, s);
    }

    function test_Settle_RevertsWhenPayerCannotCover() public {
        X402Settler.Authorization memory auth = _authorization(merchant, 2_000_000_000, "nonce-broke");
        (uint8 v, bytes32 r, bytes32 s) = _sign(payerKey, auth);

        vm.expectRevert(
            abi.encodeWithSelector(MockUSDG.InsufficientBalance.selector, payer, 1_000_000_000, 2_000_000_000)
        );
        settler.settle(RESOURCE, auth, v, r, s);
    }

    function test_MockDigestMatchesIndependentEip712Encoding() public view {
        X402Settler.Authorization memory auth = _authorization(merchant, PRICE, "nonce-digest");
        assertEq(
            usdg.authorizationDigest(auth.from, auth.to, auth.value, auth.validAfter, auth.validBefore, auth.nonce),
            _digest(auth)
        );
    }

    function testFuzz_Settle_AnyAffordableAmount(uint256 value, bytes32 nonce, bytes32 resource) public {
        value = bound(value, 1, usdg.balanceOf(payer));
        X402Settler.Authorization memory auth = X402Settler.Authorization({
            from: payer,
            to: merchant,
            value: value,
            validAfter: block.timestamp - 60,
            validBefore: block.timestamp + 120,
            nonce: nonce
        });
        (uint8 v, bytes32 r, bytes32 s) = _sign(payerKey, auth);

        settler.settle(resource, auth, v, r, s);
        assertEq(usdg.balanceOf(merchant), value);
    }

    /* -------------------------------------------------------------------- helpers */

    /// @dev Same window the TypeScript client uses: valid from one minute ago for two minutes.
    function _authorization(address to, uint256 value, string memory nonceLabel)
        internal
        view
        returns (X402Settler.Authorization memory)
    {
        return X402Settler.Authorization({
            from: payer,
            to: to,
            value: value,
            validAfter: block.timestamp - 60,
            validBefore: block.timestamp + 120,
            nonce: keccak256(bytes(nonceLabel))
        });
    }

    function _digest(X402Settler.Authorization memory auth) internal view returns (bytes32) {
        bytes32 typehash = keccak256(
            "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
        );
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Global Dollar"),
                keccak256("1"),
                block.chainid,
                address(usdg)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(typehash, auth.from, auth.to, auth.value, auth.validAfter, auth.validBefore, auth.nonce)
        );
        return keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    }

    function _sign(uint256 key, X402Settler.Authorization memory auth)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        return vm.sign(key, _digest(auth));
    }
}

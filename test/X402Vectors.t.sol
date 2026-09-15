// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";

/// @notice Checks Solidity against test/vectors/x402-vectors.json, generated with viem from the app's code
///         (`npm run vectors`). The Python SDK tests read the same file, so all three agree byte for byte.
contract X402VectorsTest is Test {
    struct VectorAuthorization {
        address from;
        address to;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    string internal json;

    function setUp() public {
        json = vm.readFile(string.concat(vm.projectRoot(), "/test/vectors/x402-vectors.json"));
    }

    function test_AgentIdIsKeccakOfRuntimeId() public view {
        bytes memory runtimeId = bytes(vm.parseJsonString(json, ".agent.runtimeId"));
        assertEq(keccak256(runtimeId), vm.parseJsonBytes32(json, ".agent.agentId"));
    }

    function test_CapabilityAndResultHashes() public view {
        assertEq(
            keccak256(bytes(vm.parseJsonString(json, ".agent.capability"))),
            vm.parseJsonBytes32(json, ".agent.capabilityHash")
        );
        assertEq(
            keccak256(bytes(vm.parseJsonString(json, ".agent.resultInput"))),
            vm.parseJsonBytes32(json, ".agent.resultHash")
        );
    }

    function test_ConfigAndProofCommitmentsAreSha256() public view {
        assertEq(
            sha256(bytes(vm.parseJsonString(json, ".agent.configJson"))),
            vm.parseJsonBytes32(json, ".agent.configCommitment")
        );
        assertEq(
            sha256(bytes(vm.parseJsonString(json, ".proof.commitmentPreimage"))),
            vm.parseJsonBytes32(json, ".proof.commitment")
        );
        assertEq(
            sha256(bytes(vm.parseJsonString(json, ".proof.nullifierPreimage"))),
            vm.parseJsonBytes32(json, ".proof.nullifier")
        );
    }

    function test_UsdgDomainSeparatorMatchesViem() public {
        MockUSDG usdg = _usdgAtVectorAddress();
        assertEq(usdg.DOMAIN_SEPARATOR(), vm.parseJsonBytes32(json, ".authorization.domainSeparator"));
    }

    function test_AuthorizationDigestMatchesViem() public {
        MockUSDG usdg = _usdgAtVectorAddress();
        VectorAuthorization memory auth = _authorization();
        assertEq(
            usdg.authorizationDigest(auth.from, auth.to, auth.value, auth.validAfter, auth.validBefore, auth.nonce),
            vm.parseJsonBytes32(json, ".authorization.digest")
        );
    }

    function test_ViemSignatureRecoversToPayer() public view {
        VectorAuthorization memory auth = _authorization();
        bytes32 digest = vm.parseJsonBytes32(json, ".authorization.digest");
        uint256 privateKey = uint256(vm.parseJsonBytes32(json, ".authorization.privateKey"));

        assertEq(vm.addr(privateKey), auth.from);
        assertEq(ecrecover(digest, auth.v, auth.r, auth.s), auth.from);

        // The signature is deterministic (RFC 6979), so signing in Solidity yields the same bytes as viem.
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        assertEq(v, auth.v);
        assertEq(r, auth.r);
        assertEq(s, auth.s);
    }

    function test_ViemSignedAuthorizationSettles() public {
        MockUSDG usdg = _usdgAtVectorAddress();
        VectorAuthorization memory auth = _authorization();

        usdg.mint(auth.from, auth.value);
        vm.warp(vm.parseJsonUint(json, ".authorization.now"));

        usdg.transferWithAuthorization(
            auth.from, auth.to, auth.value, auth.validAfter, auth.validBefore, auth.nonce, auth.v, auth.r, auth.s
        );

        assertEq(usdg.balanceOf(auth.to), auth.value);
        assertEq(usdg.balanceOf(auth.from), 0);
        assertTrue(usdg.authorizationState(auth.from, auth.nonce));
    }

    function _authorization() internal view returns (VectorAuthorization memory auth) {
        auth.from = vm.parseJsonAddress(json, ".authorization.from");
        auth.to = vm.parseJsonAddress(json, ".authorization.to");
        auth.value = vm.parseJsonUint(json, ".authorization.value");
        auth.validAfter = vm.parseJsonUint(json, ".authorization.validAfter");
        auth.validBefore = vm.parseJsonUint(json, ".authorization.validBefore");
        auth.nonce = vm.parseJsonBytes32(json, ".authorization.nonce");
        auth.v = uint8(vm.parseJsonUint(json, ".authorization.v"));
        auth.r = vm.parseJsonBytes32(json, ".authorization.r");
        auth.s = vm.parseJsonBytes32(json, ".authorization.s");
    }

    /// @dev Places MockUSDG at the real USDG address on the vector's chain id, so the EIP-712 domain is identical.
    function _usdgAtVectorAddress() internal returns (MockUSDG) {
        vm.chainId(vm.parseJsonUint(json, ".authorization.chainId"));
        address usdg = vm.parseJsonAddress(json, ".authorization.verifyingContract");
        vm.etch(usdg, address(new MockUSDG()).code);
        return MockUSDG(usdg);
    }
}

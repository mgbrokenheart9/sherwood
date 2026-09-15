// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC3009} from "../contracts/interfaces/IERC3009.sol";
import {X402Settler} from "../contracts/examples/X402Settler.sol";

/// @notice Deploys an X402Settler for a merchant. USDG defaults to the token on the target chain.
///
/// MERCHANT_ADDRESS=0x... forge script script/DeployX402Settler.s.sol \
///   --rpc-url https://robinhood-sepolia-rpc.publicnode.com --broadcast --interactive
contract DeployX402Settler is Script {
    uint256 internal constant ROBINHOOD_MAINNET = 4663;
    uint256 internal constant ROBINHOOD_TESTNET = 46_630;
    address internal constant USDG_MAINNET = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address internal constant USDG_TESTNET = 0x7E955252E15c84f5768B83c41a71F9eba181802F;

    error UnknownUsdg(uint256 chainId);

    function run() external returns (X402Settler settler) {
        address merchant = vm.envAddress("MERCHANT_ADDRESS");
        address usdg = vm.envOr("USDG_ADDRESS", defaultUsdg(block.chainid));

        vm.startBroadcast();
        settler = new X402Settler(IERC3009(usdg), merchant);
        vm.stopBroadcast();

        console2.log("X402Settler deployed at", address(settler));
        console2.log("asset", usdg);
        console2.log("merchant", merchant);
    }

    function defaultUsdg(uint256 chainId) public pure returns (address) {
        if (chainId == ROBINHOOD_MAINNET) return USDG_MAINNET;
        if (chainId == ROBINHOOD_TESTNET) return USDG_TESTNET;
        // Local simulation and other chains must pass USDG_ADDRESS explicitly.
        return address(0);
    }
}

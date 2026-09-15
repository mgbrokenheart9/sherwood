// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ZKx8004Registry} from "../contracts/ZKx8004Registry.sol";

/// @notice Deploys the ZKx8004 registry. Alternative to the console's "Deploy registry" button and
///         `npm run e2e:mainnet`; the compiler settings in foundry.toml produce the same bytecode.
///
/// forge script script/DeployRegistry.s.sol --rpc-url https://robinhood-sepolia-rpc.publicnode.com \
///   --broadcast --interactive
///
/// Afterwards set NEXT_PUBLIC_REGISTRY_ADDRESS_TESTNET (or _MAINNET) in .env.local and rebuild the app.
contract DeployRegistry is Script {
    function run() external returns (ZKx8004Registry registry) {
        vm.startBroadcast();
        registry = new ZKx8004Registry();
        vm.stopBroadcast();

        console2.log("ZKx8004Registry deployed at", address(registry));
        console2.log("chain id", block.chainid);
    }
}

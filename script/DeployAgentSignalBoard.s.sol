// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IZKx8004Registry} from "../contracts/interfaces/IZKx8004Registry.sol";
import {AgentSignalBoard} from "../contracts/examples/AgentSignalBoard.sol";

/// @notice Deploys an AgentSignalBoard bound to an existing registry.
///
/// REGISTRY_ADDRESS=0x... forge script script/DeployAgentSignalBoard.s.sol \
///   --rpc-url https://robinhood-sepolia-rpc.publicnode.com --broadcast --interactive
contract DeployAgentSignalBoard is Script {
    error RegistryHasNoCode(address registry);

    function run() external returns (AgentSignalBoard board) {
        address registry = vm.envAddress("REGISTRY_ADDRESS");
        if (registry.code.length == 0) revert RegistryHasNoCode(registry);

        vm.startBroadcast();
        board = new AgentSignalBoard(IZKx8004Registry(registry));
        vm.stopBroadcast();

        console2.log("AgentSignalBoard deployed at", address(board));
        console2.log("registry", registry);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IZKx8004Registry} from "../interfaces/IZKx8004Registry.sol";

/// @title AgentGate
/// @notice Base contract that restricts functions to agents registered and active in the ZKx8004 registry.
/// @dev The caller must own the agent, i.e. be the account that registered it from the Sherwood console or the
///      Python SDK. Pausing the agent in the registry closes the gate immediately, with no extra transaction here.
abstract contract AgentGate {
    IZKx8004Registry public immutable registry;

    error ZeroAddress();
    error NotActiveAgent(bytes32 agentId, address caller);

    constructor(IZKx8004Registry registry_) {
        if (address(registry_) == address(0)) revert ZeroAddress();
        registry = registry_;
    }

    modifier onlyActiveAgent(bytes32 agentId) {
        if (!isActiveAgent(agentId, msg.sender)) revert NotActiveAgent(agentId, msg.sender);
        _;
    }

    /// @notice True when `account` owns `agentId` and the agent is active.
    function isActiveAgent(bytes32 agentId, address account) public view returns (bool) {
        IZKx8004Registry.Agent memory agent = registry.getAgent(agentId);
        return agent.active && account != address(0) && agent.owner == account;
    }
}

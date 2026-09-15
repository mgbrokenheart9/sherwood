// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ZKx8004Registry} from "../contracts/ZKx8004Registry.sol";
import {IZKx8004Registry} from "../contracts/interfaces/IZKx8004Registry.sol";

/// @notice Keeps IZKx8004Registry ABI-compatible with the deployed registry source.
contract RegistryInterfaceTest is Test {
    function test_FunctionSelectorsMatch() public pure {
        _eq(IZKx8004Registry.anchorProof.selector, ZKx8004Registry.anchorProof.selector);
        _eq(IZKx8004Registry.getAnchor.selector, ZKx8004Registry.getAnchor.selector);
        _eq(IZKx8004Registry.registerAgent.selector, ZKx8004Registry.registerAgent.selector);
        _eq(IZKx8004Registry.setAgentActive.selector, ZKx8004Registry.setAgentActive.selector);
        _eq(IZKx8004Registry.recordExecution.selector, ZKx8004Registry.recordExecution.selector);
        _eq(IZKx8004Registry.getAgent.selector, ZKx8004Registry.getAgent.selector);
        // Public mapping getter on the registry side.
        _eq(IZKx8004Registry.nullifierUsed.selector, bytes4(keccak256("nullifierUsed(bytes32)")));
    }

    function test_EventTopicsMatch() public pure {
        assertEq(IZKx8004Registry.ProofAnchored.selector, ZKx8004Registry.ProofAnchored.selector);
        assertEq(IZKx8004Registry.AgentRegistered.selector, ZKx8004Registry.AgentRegistered.selector);
        assertEq(IZKx8004Registry.AgentStatusChanged.selector, ZKx8004Registry.AgentStatusChanged.selector);
        assertEq(IZKx8004Registry.ExecutionRecorded.selector, ZKx8004Registry.ExecutionRecorded.selector);
    }

    function test_ErrorSelectorsMatch() public pure {
        _eq(IZKx8004Registry.EmptyValue.selector, ZKx8004Registry.EmptyValue.selector);
        _eq(IZKx8004Registry.AlreadyAnchored.selector, ZKx8004Registry.AlreadyAnchored.selector);
        _eq(IZKx8004Registry.NullifierAlreadyUsed.selector, ZKx8004Registry.NullifierAlreadyUsed.selector);
        _eq(IZKx8004Registry.AgentAlreadyRegistered.selector, ZKx8004Registry.AgentAlreadyRegistered.selector);
        _eq(IZKx8004Registry.UnknownAgent.selector, ZKx8004Registry.UnknownAgent.selector);
        _eq(IZKx8004Registry.NotAgentOwner.selector, ZKx8004Registry.NotAgentOwner.selector);
        _eq(IZKx8004Registry.AgentInactive.selector, ZKx8004Registry.AgentInactive.selector);
    }

    /// @notice Calling the real registry through the interface decodes the Agent struct and custom errors.
    function test_RegistryIsUsableThroughInterface() public {
        IZKx8004Registry registry = IZKx8004Registry(address(new ZKx8004Registry()));
        bytes32 agentId = keccak256("agent_interface");

        registry.registerAgent(agentId, keccak256("config"));
        registry.recordExecution(agentId, keccak256("payment_processing"), keccak256("result"));

        IZKx8004Registry.Agent memory agent = registry.getAgent(agentId);
        assertEq(agent.owner, address(this));
        assertEq(agent.executions, 1);
        assertTrue(agent.active);

        vm.expectRevert(abi.encodeWithSelector(IZKx8004Registry.AgentAlreadyRegistered.selector, agentId));
        registry.registerAgent(agentId, keccak256("config"));
    }

    function _eq(bytes4 a, bytes4 b) internal pure {
        assertEq(bytes32(a), bytes32(b));
    }
}

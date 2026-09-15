// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ZKx8004Registry} from "../contracts/ZKx8004Registry.sol";

contract ZKx8004RegistryTest is Test {
    ZKx8004Registry internal registry;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    // The console derives on-chain ids as keccak256 of the runtime id and capability name.
    bytes32 internal constant AGENT_ID = keccak256("agent_signal_bot");
    bytes32 internal constant CONFIG = keccak256("config:payment_processing,contract_interaction");
    bytes32 internal constant CAPABILITY = keccak256("contract_interaction");
    bytes32 internal constant COMMITMENT = keccak256("commitment:balance-threshold");
    bytes32 internal constant NULLIFIER = keccak256("nullifier:salt");
    string internal constant CIRCUIT = "balance-threshold";

    function setUp() public {
        vm.warp(1_760_000_000);
        registry = new ZKx8004Registry();
    }

    /* ---------------------------------------------------------------- anchorProof */

    function test_AnchorProof_StoresAnchor() public {
        vm.prank(alice);
        registry.anchorProof(COMMITMENT, NULLIFIER, CIRCUIT);

        (address owner, uint64 anchoredAt, bytes32 nullifier) = registry.getAnchor(COMMITMENT);
        assertEq(owner, alice);
        assertEq(anchoredAt, block.timestamp);
        assertEq(nullifier, NULLIFIER);
        assertTrue(registry.nullifierUsed(NULLIFIER));
    }

    function test_AnchorProof_EmitsProofAnchored() public {
        vm.expectEmit(address(registry));
        emit ZKx8004Registry.ProofAnchored(COMMITMENT, NULLIFIER, alice, CIRCUIT);

        vm.prank(alice);
        registry.anchorProof(COMMITMENT, NULLIFIER, CIRCUIT);
    }

    function test_AnchorProof_RevertsOnEmptyCommitment() public {
        vm.expectRevert(ZKx8004Registry.EmptyValue.selector);
        registry.anchorProof(bytes32(0), NULLIFIER, CIRCUIT);
    }

    function test_AnchorProof_RevertsOnEmptyNullifier() public {
        vm.expectRevert(ZKx8004Registry.EmptyValue.selector);
        registry.anchorProof(COMMITMENT, bytes32(0), CIRCUIT);
    }

    function test_AnchorProof_RevertsWhenCommitmentAlreadyAnchored() public {
        vm.prank(alice);
        registry.anchorProof(COMMITMENT, NULLIFIER, CIRCUIT);

        vm.expectRevert(abi.encodeWithSelector(ZKx8004Registry.AlreadyAnchored.selector, COMMITMENT));
        vm.prank(bob);
        registry.anchorProof(COMMITMENT, keccak256("another nullifier"), CIRCUIT);
    }

    function test_AnchorProof_RevertsWhenNullifierReused() public {
        registry.anchorProof(COMMITMENT, NULLIFIER, CIRCUIT);

        vm.expectRevert(abi.encodeWithSelector(ZKx8004Registry.NullifierAlreadyUsed.selector, NULLIFIER));
        registry.anchorProof(keccak256("another commitment"), NULLIFIER, CIRCUIT);
    }

    function test_GetAnchor_UnknownCommitmentIsEmpty() public view {
        (address owner, uint64 anchoredAt, bytes32 nullifier) = registry.getAnchor(COMMITMENT);
        assertEq(owner, address(0));
        assertEq(anchoredAt, 0);
        assertEq(nullifier, bytes32(0));
        assertFalse(registry.nullifierUsed(NULLIFIER));
    }

    function testFuzz_AnchorProof_AnyNonEmptyValues(
        address caller,
        bytes32 commitment,
        bytes32 nullifier,
        string calldata circuit
    ) public {
        vm.assume(caller != address(0) && commitment != bytes32(0) && nullifier != bytes32(0));

        vm.prank(caller);
        registry.anchorProof(commitment, nullifier, circuit);

        (address owner,, bytes32 storedNullifier) = registry.getAnchor(commitment);
        assertEq(owner, caller);
        assertEq(storedNullifier, nullifier);
        assertTrue(registry.nullifierUsed(nullifier));
    }

    /* -------------------------------------------------------------- registerAgent */

    function test_RegisterAgent_StoresAgent() public {
        _register(alice);

        ZKx8004Registry.Agent memory agent = registry.getAgent(AGENT_ID);
        assertEq(agent.owner, alice);
        assertEq(agent.registeredAt, block.timestamp);
        assertEq(agent.executions, 0);
        assertTrue(agent.active);
        assertEq(agent.configCommitment, CONFIG);
    }

    function test_RegisterAgent_EmitsAgentRegistered() public {
        vm.expectEmit(address(registry));
        emit ZKx8004Registry.AgentRegistered(AGENT_ID, alice, CONFIG);
        _register(alice);
    }

    function test_RegisterAgent_RevertsOnEmptyAgentId() public {
        vm.expectRevert(ZKx8004Registry.EmptyValue.selector);
        registry.registerAgent(bytes32(0), CONFIG);
    }

    function test_RegisterAgent_RevertsOnEmptyConfig() public {
        vm.expectRevert(ZKx8004Registry.EmptyValue.selector);
        registry.registerAgent(AGENT_ID, bytes32(0));
    }

    function test_RegisterAgent_RevertsWhenIdTakenByAnotherOwner() public {
        _register(alice);

        vm.expectRevert(abi.encodeWithSelector(ZKx8004Registry.AgentAlreadyRegistered.selector, AGENT_ID));
        vm.prank(bob);
        registry.registerAgent(AGENT_ID, keccak256("bob's config"));
    }

    function test_GetAgent_UnknownAgentIsEmpty() public view {
        ZKx8004Registry.Agent memory agent = registry.getAgent(AGENT_ID);
        assertEq(agent.owner, address(0));
        assertFalse(agent.active);
        assertEq(agent.configCommitment, bytes32(0));
    }

    function testFuzz_RegisterAgent_AnyOwner(address owner, bytes32 agentId, bytes32 config) public {
        vm.assume(owner != address(0) && agentId != bytes32(0) && config != bytes32(0));

        vm.prank(owner);
        registry.registerAgent(agentId, config);

        ZKx8004Registry.Agent memory agent = registry.getAgent(agentId);
        assertEq(agent.owner, owner);
        assertEq(agent.configCommitment, config);
    }

    /* ------------------------------------------------------------- setAgentActive */

    function test_SetAgentActive_PausesAndEmits() public {
        _register(alice);

        vm.expectEmit(address(registry));
        emit ZKx8004Registry.AgentStatusChanged(AGENT_ID, false);

        vm.prank(alice);
        registry.setAgentActive(AGENT_ID, false);
        assertFalse(registry.getAgent(AGENT_ID).active);
    }

    function test_SetAgentActive_CanReactivate() public {
        _register(alice);

        vm.startPrank(alice);
        registry.setAgentActive(AGENT_ID, false);
        registry.setAgentActive(AGENT_ID, true);
        vm.stopPrank();

        assertTrue(registry.getAgent(AGENT_ID).active);
    }

    function test_SetAgentActive_RevertsForUnknownAgent() public {
        vm.expectRevert(abi.encodeWithSelector(ZKx8004Registry.UnknownAgent.selector, AGENT_ID));
        registry.setAgentActive(AGENT_ID, false);
    }

    function test_SetAgentActive_RevertsForStranger() public {
        _register(alice);

        vm.expectRevert(abi.encodeWithSelector(ZKx8004Registry.NotAgentOwner.selector, AGENT_ID, bob));
        vm.prank(bob);
        registry.setAgentActive(AGENT_ID, false);
    }

    /* ------------------------------------------------------------ recordExecution */

    function test_RecordExecution_IncrementsAndEmits() public {
        _register(alice);
        bytes32 resultHash = keccak256("agent_signal_bot|contract_interaction|1760000000000");

        vm.expectEmit(address(registry));
        emit ZKx8004Registry.ExecutionRecorded(AGENT_ID, CAPABILITY, resultHash);

        vm.prank(alice);
        registry.recordExecution(AGENT_ID, CAPABILITY, resultHash);
        assertEq(registry.getAgent(AGENT_ID).executions, 1);
    }

    function test_RecordExecution_RevertsWhenAgentPaused() public {
        _register(alice);

        vm.startPrank(alice);
        registry.setAgentActive(AGENT_ID, false);
        vm.expectRevert(abi.encodeWithSelector(ZKx8004Registry.AgentInactive.selector, AGENT_ID));
        registry.recordExecution(AGENT_ID, CAPABILITY, bytes32(0));
        vm.stopPrank();
    }

    function test_RecordExecution_ResumesAfterReactivation() public {
        _register(alice);

        vm.startPrank(alice);
        registry.recordExecution(AGENT_ID, CAPABILITY, keccak256("first"));
        registry.setAgentActive(AGENT_ID, false);
        registry.setAgentActive(AGENT_ID, true);
        registry.recordExecution(AGENT_ID, CAPABILITY, keccak256("second"));
        vm.stopPrank();

        assertEq(registry.getAgent(AGENT_ID).executions, 2);
    }

    function test_RecordExecution_RevertsForStranger() public {
        _register(alice);

        vm.expectRevert(abi.encodeWithSelector(ZKx8004Registry.NotAgentOwner.selector, AGENT_ID, bob));
        vm.prank(bob);
        registry.recordExecution(AGENT_ID, CAPABILITY, bytes32(0));
    }

    function test_RecordExecution_RevertsForUnknownAgent() public {
        vm.expectRevert(abi.encodeWithSelector(ZKx8004Registry.UnknownAgent.selector, AGENT_ID));
        registry.recordExecution(AGENT_ID, CAPABILITY, bytes32(0));
    }

    function testFuzz_RecordExecution_CountsEveryCall(uint8 calls) public {
        _register(alice);

        vm.startPrank(alice);
        for (uint256 i; i < calls; ++i) {
            registry.recordExecution(AGENT_ID, CAPABILITY, keccak256(abi.encode(i)));
        }
        vm.stopPrank();

        assertEq(registry.getAgent(AGENT_ID).executions, calls);
    }

    /* -------------------------------------------------------------------- helpers */

    function _register(address owner) internal {
        vm.prank(owner);
        registry.registerAgent(AGENT_ID, CONFIG);
    }
}

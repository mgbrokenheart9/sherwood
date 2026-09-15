// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, stdError} from "forge-std/Test.sol";
import {ZKx8004Registry} from "../contracts/ZKx8004Registry.sol";
import {IZKx8004Registry} from "../contracts/interfaces/IZKx8004Registry.sol";
import {AgentGate} from "../contracts/examples/AgentGate.sol";
import {AgentSignalBoard} from "../contracts/examples/AgentSignalBoard.sol";

contract AgentSignalBoardTest is Test {
    ZKx8004Registry internal registry;
    AgentSignalBoard internal board;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    bytes32 internal constant AGENT_ID = keccak256("agent_momentum");
    bytes32 internal constant TOPIC = keccak256("USDG/ETH");
    bytes32 internal constant SIGNAL = keccak256("long|0.42|salt");

    function setUp() public {
        vm.warp(1_760_000_000);
        registry = new ZKx8004Registry();
        board = new AgentSignalBoard(IZKx8004Registry(address(registry)));

        vm.prank(alice);
        registry.registerAgent(AGENT_ID, keccak256("config"));
    }

    function test_Constructor_RevertsOnZeroRegistry() public {
        vm.expectRevert(AgentGate.ZeroAddress.selector);
        new AgentSignalBoard(IZKx8004Registry(address(0)));
    }

    function test_Publish_StoresSignal() public {
        vm.prank(alice);
        uint256 index = board.publish(AGENT_ID, TOPIC, SIGNAL);

        assertEq(index, 0);
        assertEq(board.signalCount(TOPIC), 1);

        AgentSignalBoard.Signal memory signal = board.signalAt(TOPIC, 0);
        assertEq(signal.agentId, AGENT_ID);
        assertEq(signal.commitment, SIGNAL);
        assertEq(signal.publishedAt, block.timestamp);
    }

    function test_Publish_EmitsSignalPublished() public {
        vm.expectEmit(address(board));
        emit AgentSignalBoard.SignalPublished(TOPIC, AGENT_ID, 0, SIGNAL);

        vm.prank(alice);
        board.publish(AGENT_ID, TOPIC, SIGNAL);
    }

    function test_Publish_KeepsTopicsSeparate() public {
        bytes32 otherTopic = keccak256("BTC/USDG");

        vm.startPrank(alice);
        board.publish(AGENT_ID, TOPIC, SIGNAL);
        board.publish(AGENT_ID, TOPIC, keccak256("short"));
        uint256 index = board.publish(AGENT_ID, otherTopic, SIGNAL);
        vm.stopPrank();

        assertEq(index, 0);
        assertEq(board.signalCount(TOPIC), 2);
        assertEq(board.signalCount(otherTopic), 1);
        assertEq(board.latestSignal(TOPIC).commitment, keccak256("short"));
    }

    function test_Publish_RevertsForUnregisteredAgent() public {
        bytes32 unknown = keccak256("agent_unknown");

        vm.expectRevert(abi.encodeWithSelector(AgentGate.NotActiveAgent.selector, unknown, alice));
        vm.prank(alice);
        board.publish(unknown, TOPIC, SIGNAL);
    }

    function test_Publish_RevertsWhenCallerDoesNotOwnAgent() public {
        vm.expectRevert(abi.encodeWithSelector(AgentGate.NotActiveAgent.selector, AGENT_ID, bob));
        vm.prank(bob);
        board.publish(AGENT_ID, TOPIC, SIGNAL);
    }

    function test_Publish_RevertsOnceAgentIsPausedInRegistry() public {
        vm.startPrank(alice);
        board.publish(AGENT_ID, TOPIC, SIGNAL);
        registry.setAgentActive(AGENT_ID, false);

        vm.expectRevert(abi.encodeWithSelector(AgentGate.NotActiveAgent.selector, AGENT_ID, alice));
        board.publish(AGENT_ID, TOPIC, SIGNAL);
        vm.stopPrank();
    }

    function test_Publish_RevertsOnEmptyCommitment() public {
        vm.expectRevert(AgentSignalBoard.EmptyCommitment.selector);
        vm.prank(alice);
        board.publish(AGENT_ID, TOPIC, bytes32(0));
    }

    function test_LatestSignal_RevertsWhenTopicIsEmpty() public {
        vm.expectRevert(abi.encodeWithSelector(AgentSignalBoard.NoSignals.selector, TOPIC));
        board.latestSignal(TOPIC);
    }

    function test_SignalAt_PanicsOutOfRange() public {
        vm.expectRevert(stdError.indexOOBError);
        board.signalAt(TOPIC, 0);
    }

    function test_IsActiveAgent() public {
        assertTrue(board.isActiveAgent(AGENT_ID, alice));
        assertFalse(board.isActiveAgent(AGENT_ID, bob));
        assertFalse(board.isActiveAgent(AGENT_ID, address(0)));

        vm.prank(alice);
        registry.setAgentActive(AGENT_ID, false);
        assertFalse(board.isActiveAgent(AGENT_ID, alice));
    }

    function testFuzz_Publish_IndexesAreSequential(uint8 count, bytes32 topic) public {
        vm.startPrank(alice);
        for (uint256 i; i < count; ++i) {
            uint256 index = board.publish(AGENT_ID, topic, keccak256(abi.encode(i)));
            assertEq(index, i);
        }
        vm.stopPrank();

        assertEq(board.signalCount(topic), count);
        if (count > 0) assertEq(board.latestSignal(topic).commitment, keccak256(abi.encode(uint256(count) - 1)));
    }
}

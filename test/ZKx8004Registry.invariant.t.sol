// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ZKx8004Registry} from "../contracts/ZKx8004Registry.sol";

/// @notice Drives the registry with random sequences of valid calls and mirrors the expected state.
contract RegistryHandler is Test {
    ZKx8004Registry public immutable registry;

    address[] internal _actors;
    bytes32[] internal _agentIds;
    bytes32[] internal _nullifiers;
    uint256 internal _nonce;

    mapping(bytes32 agentId => address) public ownerOf;
    mapping(bytes32 agentId => uint256) public executionsOf;
    mapping(bytes32 agentId => bool) public activeOf;

    constructor(ZKx8004Registry registry_) {
        registry = registry_;
        _actors.push(makeAddr("alice"));
        _actors.push(makeAddr("bob"));
        _actors.push(makeAddr("carol"));
    }

    function anchorProof(uint256 actorSeed) external {
        bytes32 commitment = keccak256(abi.encode("commitment", _nonce));
        bytes32 nullifier = keccak256(abi.encode("nullifier", _nonce++));

        vm.prank(_actor(actorSeed));
        registry.anchorProof(commitment, nullifier, "invariant");
        _nullifiers.push(nullifier);
    }

    function registerAgent(uint256 actorSeed) external {
        address owner = _actor(actorSeed);
        bytes32 agentId = keccak256(abi.encode("agent", _nonce++));

        vm.prank(owner);
        registry.registerAgent(agentId, keccak256(abi.encode("config", agentId)));

        _agentIds.push(agentId);
        ownerOf[agentId] = owner;
        activeOf[agentId] = true;
    }

    function setAgentActive(uint256 agentSeed, bool active) external {
        if (_agentIds.length == 0) return;
        bytes32 agentId = _agentIds[agentSeed % _agentIds.length];

        vm.prank(ownerOf[agentId]);
        registry.setAgentActive(agentId, active);
        activeOf[agentId] = active;
    }

    function recordExecution(uint256 agentSeed, bytes32 capability) external {
        if (_agentIds.length == 0) return;
        bytes32 agentId = _agentIds[agentSeed % _agentIds.length];
        // Paused agents revert by design; that path is covered by the unit tests.
        if (!activeOf[agentId]) return;

        vm.prank(ownerOf[agentId]);
        registry.recordExecution(agentId, capability, keccak256(abi.encode(capability, _nonce++)));
        executionsOf[agentId]++;
    }

    function agentCount() external view returns (uint256) {
        return _agentIds.length;
    }

    function agentIdAt(uint256 index) external view returns (bytes32) {
        return _agentIds[index];
    }

    function nullifierCount() external view returns (uint256) {
        return _nullifiers.length;
    }

    function nullifierAt(uint256 index) external view returns (bytes32) {
        return _nullifiers[index];
    }

    function _actor(uint256 seed) internal view returns (address) {
        return _actors[seed % _actors.length];
    }
}

contract ZKx8004RegistryInvariantTest is Test {
    ZKx8004Registry internal registry;
    RegistryHandler internal handler;

    function setUp() public {
        registry = new ZKx8004Registry();
        handler = new RegistryHandler(registry);
        targetContract(address(handler));
    }

    /// @notice Owner, status and execution count on-chain always equal what the handler expects.
    function invariant_AgentStateMatchesExpectedState() public view {
        uint256 count = handler.agentCount();
        for (uint256 i; i < count; ++i) {
            bytes32 agentId = handler.agentIdAt(i);
            ZKx8004Registry.Agent memory agent = registry.getAgent(agentId);
            assertEq(agent.owner, handler.ownerOf(agentId), "owner");
            assertEq(agent.active, handler.activeOf(agentId), "active");
            assertEq(agent.executions, handler.executionsOf(agentId), "executions");
        }
    }

    /// @notice A nullifier stays spent forever once a proof used it.
    function invariant_AnchoredNullifiersStaySpent() public view {
        uint256 count = handler.nullifierCount();
        for (uint256 i; i < count; ++i) {
            assertTrue(registry.nullifierUsed(handler.nullifierAt(i)));
        }
    }
}

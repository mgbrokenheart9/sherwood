// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ZKx8004Registry
/// @notice Anchors zero-knowledge proof commitments and registers private agents
///         on Robinhood Chain. Only commitments and hashes are stored on-chain;
///         private inputs never leave the client.
contract ZKx8004Registry {
    struct ProofAnchor {
        address owner;
        uint64 anchoredAt;
        bytes32 nullifier;
    }

    struct Agent {
        address owner;
        uint64 registeredAt;
        uint32 executions;
        bool active;
        bytes32 configCommitment;
    }

    mapping(bytes32 commitment => ProofAnchor) private _anchors;
    mapping(bytes32 nullifier => bool) public nullifierUsed;
    mapping(bytes32 agentId => Agent) private _agents;

    event ProofAnchored(bytes32 indexed commitment, bytes32 indexed nullifier, address indexed owner, string circuit);
    event AgentRegistered(bytes32 indexed agentId, address indexed owner, bytes32 configCommitment);
    event AgentStatusChanged(bytes32 indexed agentId, bool active);
    event ExecutionRecorded(bytes32 indexed agentId, bytes32 indexed capability, bytes32 resultHash);

    error EmptyValue();
    error AlreadyAnchored(bytes32 commitment);
    error NullifierAlreadyUsed(bytes32 nullifier);
    error AgentAlreadyRegistered(bytes32 agentId);
    error UnknownAgent(bytes32 agentId);
    error NotAgentOwner(bytes32 agentId, address caller);
    error AgentInactive(bytes32 agentId);

    modifier onlyAgentOwner(bytes32 agentId) {
        address owner = _agents[agentId].owner;
        if (owner == address(0)) revert UnknownAgent(agentId);
        if (owner != msg.sender) revert NotAgentOwner(agentId, msg.sender);
        _;
    }

    /// @notice Anchor a proof commitment. Each commitment and nullifier can be used once.
    function anchorProof(bytes32 commitment, bytes32 nullifier, string calldata circuit) external {
        if (commitment == bytes32(0) || nullifier == bytes32(0)) revert EmptyValue();
        if (_anchors[commitment].owner != address(0)) revert AlreadyAnchored(commitment);
        if (nullifierUsed[nullifier]) revert NullifierAlreadyUsed(nullifier);

        _anchors[commitment] = ProofAnchor(msg.sender, uint64(block.timestamp), nullifier);
        nullifierUsed[nullifier] = true;
        emit ProofAnchored(commitment, nullifier, msg.sender, circuit);
    }

    function getAnchor(bytes32 commitment) external view returns (address owner, uint64 anchoredAt, bytes32 nullifier) {
        ProofAnchor memory anchor = _anchors[commitment];
        return (anchor.owner, anchor.anchoredAt, anchor.nullifier);
    }

    /// @notice Register an agent together with the commitment of its private configuration.
    function registerAgent(bytes32 agentId, bytes32 configCommitment) external {
        if (agentId == bytes32(0) || configCommitment == bytes32(0)) revert EmptyValue();
        if (_agents[agentId].owner != address(0)) revert AgentAlreadyRegistered(agentId);

        _agents[agentId] = Agent(msg.sender, uint64(block.timestamp), 0, true, configCommitment);
        emit AgentRegistered(agentId, msg.sender, configCommitment);
    }

    function setAgentActive(bytes32 agentId, bool active) external onlyAgentOwner(agentId) {
        _agents[agentId].active = active;
        emit AgentStatusChanged(agentId, active);
    }

    /// @notice Record a command execution by hash so it can be audited without revealing its output.
    function recordExecution(bytes32 agentId, bytes32 capability, bytes32 resultHash) external onlyAgentOwner(agentId) {
        Agent storage agent = _agents[agentId];
        if (!agent.active) revert AgentInactive(agentId);
        unchecked {
            agent.executions++;
        }
        emit ExecutionRecorded(agentId, capability, resultHash);
    }

    function getAgent(bytes32 agentId) external view returns (Agent memory) {
        return _agents[agentId];
    }
}

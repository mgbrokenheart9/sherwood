// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IZKx8004Registry
/// @notice Integration interface for the ZKx8004 registry that Sherwood deploys on Robinhood Chain.
/// @dev Mirrors contracts/ZKx8004Registry.sol. The registry itself does not inherit this interface so its
///      source (and the verified mainnet bytecode) stays unchanged; test/RegistryInterface.t.sol keeps the
///      two ABI-compatible selector by selector.
interface IZKx8004Registry {
    struct Agent {
        address owner;
        uint64 registeredAt;
        uint32 executions;
        bool active;
        bytes32 configCommitment;
    }

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

    /// @notice Anchor a proof commitment. Each commitment and nullifier can be used once.
    function anchorProof(bytes32 commitment, bytes32 nullifier, string calldata circuit) external;

    function getAnchor(bytes32 commitment) external view returns (address owner, uint64 anchoredAt, bytes32 nullifier);

    function nullifierUsed(bytes32 nullifier) external view returns (bool);

    /// @notice Register an agent together with the commitment of its private configuration.
    function registerAgent(bytes32 agentId, bytes32 configCommitment) external;

    function setAgentActive(bytes32 agentId, bool active) external;

    /// @notice Record a command execution by hash so it can be audited without revealing its output.
    function recordExecution(bytes32 agentId, bytes32 capability, bytes32 resultHash) external;

    function getAgent(bytes32 agentId) external view returns (Agent memory);
}

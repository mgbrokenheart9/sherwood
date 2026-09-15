// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IZKx8004Registry} from "../interfaces/IZKx8004Registry.sol";
import {AgentGate} from "./AgentGate.sol";

/// @title AgentSignalBoard
/// @notice Registered agents publish commitments to their signals, one append-only list per topic.
/// @dev Only the commitment goes on-chain. The signal itself is sold off-chain over x402 (like /api/x402/premium),
///      so a buyer can check that what they paid for was committed before the market moved.
contract AgentSignalBoard is AgentGate {
    struct Signal {
        bytes32 agentId;
        bytes32 commitment;
        uint64 publishedAt;
    }

    mapping(bytes32 topic => Signal[]) private _signals;

    event SignalPublished(bytes32 indexed topic, bytes32 indexed agentId, uint256 indexed index, bytes32 commitment);

    error EmptyCommitment();
    error NoSignals(bytes32 topic);

    constructor(IZKx8004Registry registry_) AgentGate(registry_) {}

    /// @notice Publish a signal commitment for `topic` on behalf of an active agent you own.
    /// @return index Position of the signal in the topic's list.
    function publish(bytes32 agentId, bytes32 topic, bytes32 commitment)
        external
        onlyActiveAgent(agentId)
        returns (uint256 index)
    {
        if (commitment == bytes32(0)) revert EmptyCommitment();

        Signal[] storage signals = _signals[topic];
        index = signals.length;
        signals.push(Signal({agentId: agentId, commitment: commitment, publishedAt: uint64(block.timestamp)}));
        emit SignalPublished(topic, agentId, index, commitment);
    }

    function signalCount(bytes32 topic) external view returns (uint256) {
        return _signals[topic].length;
    }

    /// @dev Reverts with a panic when `index` is out of range.
    function signalAt(bytes32 topic, uint256 index) external view returns (Signal memory) {
        return _signals[topic][index];
    }

    function latestSignal(bytes32 topic) external view returns (Signal memory) {
        Signal[] storage signals = _signals[topic];
        if (signals.length == 0) revert NoSignals(topic);
        return signals[signals.length - 1];
    }
}

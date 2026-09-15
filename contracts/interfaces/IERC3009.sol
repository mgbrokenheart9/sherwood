// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IERC3009
/// @notice The EIP-3009 subset of Paxos USDG (Global Dollar) that x402 "exact" payments rely on.
/// @dev USDG on Robinhood Chain uses the EIP-712 domain { name: "Global Dollar", version: "1" }.
interface IERC3009 {
    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);

    function DOMAIN_SEPARATOR() external view returns (bytes32);

    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

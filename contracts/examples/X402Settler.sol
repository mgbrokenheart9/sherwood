// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC3009} from "../interfaces/IERC3009.sol";

/// @title X402Settler
/// @notice On-chain counterpart of the self-hosted x402 facilitator in src/lib/chain/facilitator.ts.
///         Anyone may relay a signed USDG `transferWithAuthorization`, but only towards the configured merchant,
///         so a relayer can never redirect a payer's funds.
/// @dev Replay protection comes from the token itself: every EIP-3009 nonce can be used once.
contract X402Settler {
    /// @dev Field names and order follow the x402 "exact" payload (payload.authorization).
    struct Authorization {
        address from;
        address to;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
    }

    IERC3009 public immutable asset;
    address public immutable merchant;

    /// @param resource keccak256 of the x402 resource URL, so receipts can be matched to what was bought.
    event PaymentSettled(
        address indexed payer, bytes32 indexed resource, bytes32 indexed nonce, uint256 value, address relayer
    );

    error ZeroAddress();
    error WrongRecipient(address to);

    constructor(IERC3009 asset_, address merchant_) {
        if (address(asset_) == address(0) || merchant_ == address(0)) revert ZeroAddress();
        asset = asset_;
        merchant = merchant_;
    }

    /// @notice Settle an x402 payment. Reverts with the token's error when the authorization is invalid.
    function settle(bytes32 resource, Authorization calldata authorization, uint8 v, bytes32 r, bytes32 s) external {
        if (authorization.to != merchant) revert WrongRecipient(authorization.to);

        asset.transferWithAuthorization(
            authorization.from,
            authorization.to,
            authorization.value,
            authorization.validAfter,
            authorization.validBefore,
            authorization.nonce,
            v,
            r,
            s
        );
        emit PaymentSettled(authorization.from, resource, authorization.nonce, authorization.value, msg.sender);
    }
}

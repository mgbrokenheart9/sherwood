// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC3009} from "../../contracts/interfaces/IERC3009.sol";

/// @notice Test stand-in for Paxos USDG: ERC-20 balances plus EIP-3009 under the same EIP-712 domain as USDG on
///         Robinhood Chain ("Global Dollar", version "1"). Signatures are checked for real with ecrecover, so
///         authorizations signed by viem or eth-account for the real token also settle here.
contract MockUSDG is IERC3009 {
    string public constant name = "Global Dollar";
    string public constant symbol = "USDG";
    string public constant version = "1";
    uint8 public constant decimals = 6;

    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    mapping(address account => uint256) public balanceOf;
    mapping(address authorizer => mapping(bytes32 nonce => bool)) private _usedAuthorizations;

    event Transfer(address indexed from, address indexed to, uint256 value);

    error InvalidSignature();
    error AuthorizationNotYetValid();
    error AuthorizationExpired();
    error AuthorizationAlreadyUsed(address authorizer, bytes32 nonce);
    error InsufficientBalance(address account, uint256 balance, uint256 needed);

    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256(bytes(name)), keccak256(bytes(version)), block.chainid, address(this))
        );
    }

    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool) {
        return _usedAuthorizations[authorizer][nonce];
    }

    /// @notice EIP-712 digest a payer signs for `transferWithAuthorization`.
    function authorizationDigest(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce)
        );
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR(), structHash));
    }

    function mint(address to, uint256 value) external {
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

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
    ) external {
        _useAuthorization(from, nonce, validAfter, validBefore);
        _requireSigner(authorizationDigest(from, to, value, validAfter, validBefore, nonce), from, v, r, s);
        _transfer(from, to, value);
    }

    function _useAuthorization(address authorizer, bytes32 nonce, uint256 validAfter, uint256 validBefore) private {
        if (block.timestamp <= validAfter) revert AuthorizationNotYetValid();
        if (block.timestamp >= validBefore) revert AuthorizationExpired();
        if (_usedAuthorizations[authorizer][nonce]) revert AuthorizationAlreadyUsed(authorizer, nonce);
        _usedAuthorizations[authorizer][nonce] = true;
        emit AuthorizationUsed(authorizer, nonce);
    }

    function _requireSigner(bytes32 digest, address expected, uint8 v, bytes32 r, bytes32 s) private pure {
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0) || signer != expected) revert InvalidSignature();
    }

    function _transfer(address from, address to, uint256 value) private {
        uint256 balance = balanceOf[from];
        if (balance < value) revert InsufficientBalance(from, balance, value);
        unchecked {
            balanceOf[from] = balance - value;
        }
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}

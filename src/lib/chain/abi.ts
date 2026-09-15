import { parseAbi } from "viem";

/** Paxos USDG (Global Dollar): ERC-20 with EIP-3009 authorizations. */
export const USDG_ABI = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function isFrozen(address who) view returns (bool)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
]);

export const USDG_DECIMALS = 6;

/** EIP-712 domain of USDG, verified against DOMAIN_SEPARATOR on mainnet and testnet. */
export const USDG_DOMAIN = { name: "Global Dollar", version: "1" } as const;

export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

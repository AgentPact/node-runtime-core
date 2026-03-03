/**
 * @clawpact/runtime - Chain & contract constants
 */
import type { ChainConfig } from "./types.js";

/** Zero address constant — used for ETH payment mode */
export const ETH_TOKEN = "0x0000000000000000000000000000000000000000" as const;

/** Base Sepolia testnet configuration */
export const BASE_SEPOLIA: ChainConfig = {
    chainId: 84532,
    rpcUrl: "https://sepolia.base.org",
    escrowAddress: "0x927602DaFE11e2679cbB0eb4d98CF6a7B1417a52",
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    explorerUrl: "https://sepolia.basescan.org",
};

/** Base Mainnet configuration */
export const BASE_MAINNET: ChainConfig = {
    chainId: 8453,
    rpcUrl: "https://mainnet.base.org",
    escrowAddress: "0x0000000000000000000000000000000000000000", // TODO: update after deployment
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    explorerUrl: "https://basescan.org",
};

/** Platform fee rate (3%, matches contract PLATFORM_FEE_BPS=300) */
export const PLATFORM_FEE_BPS = 300n;

/** Confirmation window (2 hours, matches contract) */
export const CONFIRMATION_WINDOW_SECONDS = 7200n;

/** Minimum pass rate floor (30%, matches contract MIN_PASS_RATE) */
export const MIN_PASS_RATE = 30;

/** EIP-712 domain for signing */
export const EIP712_DOMAIN = {
    name: "ClawPact",
    version: "2",
} as const;

/** EIP-712 TaskAssignment type definition */
export const TASK_ASSIGNMENT_TYPES = {
    TaskAssignment: [
        { name: "escrowId", type: "uint256" },
        { name: "agent", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "expiredAt", type: "uint256" },
    ],
} as const;

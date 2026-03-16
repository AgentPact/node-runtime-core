/**
 * @agentpactai/runtime - EIP-712 Signing Utilities
 *
 * Used by the platform backend to sign task assignment authorizations.
 * These signatures are verified on-chain by AgentPactEscrowV2.claimTask().
 */
import {
    type Account,
    type WalletClient,
    type Transport,
    type Chain,
} from "viem";
import type { TaskAssignmentData, ChainConfig } from "./types.js";
import { EIP712_DOMAIN, TASK_ASSIGNMENT_TYPES } from "./constants.js";

/**
 * Sign an EIP-712 TaskAssignment for agent claim authorization.
 *
 * @param walletClient - viem WalletClient with the platform signer account
 * @param config - Chain configuration (used for verifyingContract)
 * @param data - Assignment data: escrowId, agent address, nonce, expiredAt
 * @returns The EIP-712 signature as hex string
 *
 * @example
 * ```ts
 * import { signTaskAssignment, BASE_SEPOLIA } from '@agentpactai/runtime';
 *
 * const signature = await signTaskAssignment(walletClient, BASE_SEPOLIA, {
 *   escrowId: 1n,
 *   agent: '0x...',
 *   nonce: 0n,
 *   expiredAt: BigInt(Math.floor(Date.now() / 1000) + 1800),
 * });
 * ```
 */
export async function signTaskAssignment(
    walletClient: WalletClient<Transport, Chain, Account>,
    config: ChainConfig,
    data: TaskAssignmentData
): Promise<`0x${string}`> {
    const signature = await walletClient.signTypedData({
        domain: {
            ...EIP712_DOMAIN,
            chainId: config.chainId,
            verifyingContract: config.escrowAddress,
        },
        types: TASK_ASSIGNMENT_TYPES,
        primaryType: "TaskAssignment",
        message: {
            escrowId: data.escrowId,
            agent: data.agent,
            nonce: data.nonce,
            expiredAt: data.expiredAt,
        },
    });

    return signature;
}

/**
 * Generate an assignment with auto-calculated expiry.
 *
 * @param walletClient - Platform signer wallet
 * @param config - Chain config
 * @param escrowId - The escrow to assign
 * @param agent - Agent address being authorized
 * @param nonce - Current nonce from contract
 * @param expiryMinutes - How many minutes the signature is valid (default: 30)
 */
export async function createSignedAssignment(
    walletClient: WalletClient<Transport, Chain, Account>,
    config: ChainConfig,
    escrowId: bigint,
    agent: `0x${string}`,
    nonce: bigint,
    expiryMinutes: number = 30
) {
    const expiredAt = BigInt(Math.floor(Date.now() / 1000) + expiryMinutes * 60);

    const signature = await signTaskAssignment(walletClient, config, {
        escrowId,
        agent,
        nonce,
        expiredAt,
    });

    return { escrowId, agent, nonce, expiredAt, signature };
}

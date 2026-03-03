/**
 * @clawpact/runtime
 *
 * TypeScript SDK for ClawPact escrow contract interactions.
 * Built on viem for type-safe Ethereum interactions.
 *
 * @example
 * ```ts
 * import {
 *   ClawPactClient,
 *   ClawPactAgent,
 *   BASE_SEPOLIA,
 *   ETH_TOKEN,
 *   TaskState,
 * } from '@clawpact/runtime';
 * import { createPublicClient, http } from 'viem';
 * import { baseSepolia } from 'viem/chains';
 *
 * const publicClient = createPublicClient({
 *   chain: baseSepolia,
 *   transport: http(BASE_SEPOLIA.rpcUrl),
 * });
 *
 * const client = new ClawPactClient(publicClient, BASE_SEPOLIA);
 * const escrow = await client.getEscrow(1n);
 * console.log(TaskState[escrow.state]); // "Created"
 * ```
 */

// Core client
export { ClawPactClient } from "./client.js";

// Signing utilities
export { signTaskAssignment, createSignedAssignment } from "./signer.js";

// WebSocket transport
export {
    ClawPactWebSocket,
    type EventHandler,
    type WebSocketOptions,
    type ConnectionState,
} from "./transport/websocket.js";

// Task Chat
export {
    TaskChatClient,
    type ChatMessage,
    type MessageType,
    type GetMessagesOptions,
} from "./chat/taskChat.js";

// Delivery upload
export {
    computeDeliveryHash,
    computeStringHash,
    uploadDelivery,
    type UploadResult,
} from "./delivery/upload.js";

// Agent framework
export {
    ClawPactAgent,
    type AgentConfig,
    type TaskEvent,
} from "./agent.js";

// Types
export {
    TaskState,
    TaskStateLabel,
    type EscrowRecord,
    type CreateEscrowParams,
    type ClaimTaskParams,
    type TaskAssignmentData,
    type ChainConfig,
} from "./types.js";

// Constants
export {
    ETH_TOKEN,
    BASE_SEPOLIA,
    BASE_MAINNET,
    PLATFORM_FEE_BPS,
    CONFIRMATION_WINDOW_SECONDS,
    MIN_PASS_RATE,
    EIP712_DOMAIN,
    TASK_ASSIGNMENT_TYPES,
} from "./constants.js";

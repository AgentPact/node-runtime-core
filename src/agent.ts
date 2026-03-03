/**
 * @clawpact/runtime - Agent Framework
 *
 * Event-driven agent framework that connects to the ClawPact platform
 * via WebSocket and reacts to task lifecycle events automatically.
 *
 * @example
 * ```ts
 * import { ClawPactAgent, ClawPactClient, BASE_SEPOLIA } from '@clawpact/runtime';
 * import { createPublicClient, createWalletClient, http } from 'viem';
 * import { privateKeyToAccount } from 'viem/accounts';
 * import { baseSepolia } from 'viem/chains';
 *
 * const account = privateKeyToAccount('0x...');
 * const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });
 * const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http() });
 * const client = new ClawPactClient(publicClient, BASE_SEPOLIA, walletClient);
 *
 * const agent = new ClawPactAgent({
 *   client,
 *   platformUrl: 'http://localhost:4000',
 *   wsUrl: 'ws://localhost:4000/ws',
 *   jwtToken: 'your-jwt',
 * });
 *
 * agent.on('TASK_CREATED', async (data) => {
 *   console.log('New task available:', data);
 *   // Auto-bid logic here
 * });
 *
 * await agent.start();
 * ```
 */

import { ClawPactWebSocket, type EventHandler, type WebSocketOptions } from "./transport/websocket.js";
import type { ClawPactClient } from "./client.js";
import { TaskChatClient, type MessageType } from "./chat/taskChat.js";

/** Agent configuration */
export interface AgentConfig {
    /** ClawPactClient instance (with wallet for write operations) */
    client: ClawPactClient;
    /** Platform REST API URL (e.g., 'http://localhost:4000') */
    platformUrl: string;
    /** Platform WebSocket URL (e.g., 'ws://localhost:4000/ws') */
    wsUrl: string;
    /** JWT authentication token */
    jwtToken: string;
    /** WebSocket connection options */
    wsOptions?: WebSocketOptions;
}

/** Task event data from WebSocket */
export interface TaskEvent {
    type: string;
    data: Record<string, unknown>;
    taskId?: string;
}

/**
 * ClawPactAgent provides an event-driven framework for Agent bots.
 *
 * Connects to the platform via WebSocket for real-time events,
 * and provides convenience methods for common agent operations.
 */
export class ClawPactAgent {
    readonly client: ClawPactClient;
    readonly chat: TaskChatClient;
    private ws: ClawPactWebSocket;
    private platformUrl: string;
    private jwtToken: string;
    private handlers = new Map<string, Set<(data: TaskEvent) => void | Promise<void>>>();
    private subscribedTasks = new Set<string>();
    private _running = false;

    constructor(config: AgentConfig) {
        this.client = config.client;
        this.platformUrl = config.platformUrl.replace(/\/$/, "");
        this.jwtToken = config.jwtToken;
        this.ws = new ClawPactWebSocket(config.wsUrl, config.wsOptions);
        this.chat = new TaskChatClient(this.platformUrl, this.jwtToken);
    }

    /** Whether the agent is currently running */
    get running(): boolean {
        return this._running;
    }

    /**
     * Start the agent: connect WebSocket, authenticate, begin event loop.
     */
    async start(): Promise<void> {
        if (this._running) return;

        // Set up WebSocket event forwarding
        this.ws.on("*", (raw) => {
            const { event, data } = raw as { event: string; data: unknown };
            const taskEvent: TaskEvent = {
                type: event,
                data: (data as Record<string, unknown>) || {},
            };
            this.dispatch(event, taskEvent);
        });

        await this.ws.connect(this.jwtToken);
        this._running = true;

        // Re-subscribe to any tracked tasks
        for (const taskId of this.subscribedTasks) {
            this.ws.subscribeToTask(taskId);
        }
    }

    /**
     * Stop the agent: disconnect WebSocket and clean up.
     */
    stop(): void {
        this._running = false;
        this.ws.disconnect();
    }

    /**
     * Register an event handler for a specific platform event.
     *
     * Common events: TASK_CREATED, TASK_ASSIGNED, TASK_DELIVERED,
     * TASK_ACCEPTED, REVISION_REQUESTED, CHAT_MESSAGE
     */
    on(event: string, handler: (data: TaskEvent) => void | Promise<void>): () => void {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        this.handlers.get(event)!.add(handler);

        return () => {
            this.handlers.get(event)?.delete(handler);
        };
    }

    /**
     * Watch a specific task for real-time updates.
     */
    watchTask(taskId: string): void {
        this.subscribedTasks.add(taskId);
        if (this._running) {
            this.ws.subscribeToTask(taskId);
        }
    }

    /**
     * Stop watching a task.
     */
    unwatchTask(taskId: string): void {
        this.subscribedTasks.delete(taskId);
    }

    // ──── Convenience Methods ────────────────────────────────────────

    /**
     * Fetch available tasks from the marketplace.
     */
    async getAvailableTasks(options: {
        limit?: number;
        offset?: number;
        status?: string;
    } = {}): Promise<unknown[]> {
        const params = new URLSearchParams();
        params.set("limit", String(options.limit ?? 20));
        params.set("offset", String(options.offset ?? 0));
        if (options.status) params.set("status", options.status);

        const res = await fetch(
            `${this.platformUrl}/api/tasks?${params}`,
            { headers: this.headers() }
        );

        if (!res.ok) throw new Error(`Failed to fetch tasks: ${res.status}`);
        const body = (await res.json()) as { data?: unknown[] };
        return body.data || [];
    }

    /**
     * Submit a bid for a task.
     */
    async bidOnTask(taskId: string, message?: string): Promise<unknown> {
        const res = await fetch(
            `${this.platformUrl}/api/matching/bid`,
            {
                method: "POST",
                headers: this.headers(),
                body: JSON.stringify({ taskId, message }),
            }
        );

        if (!res.ok) throw new Error(`Failed to bid: ${res.status}`);
        return ((await res.json()) as { data: unknown }).data;
    }

    /**
     * Send a chat message on a task.
     */
    async sendMessage(
        taskId: string,
        content: string,
        type: MessageType = "GENERAL"
    ): Promise<unknown> {
        return this.chat.sendMessage(taskId, content, type);
    }

    // ──── Private ────────────────────────────────────────────────────

    private dispatch(event: string, data: TaskEvent): void {
        const handlers = this.handlers.get(event);
        if (handlers) {
            for (const handler of handlers) {
                try {
                    const result = handler(data);
                    // Handle async handlers silently
                    if (result instanceof Promise) {
                        result.catch((err) => {
                            console.error(`[Agent] Async handler error for "${event}":`, err);
                        });
                    }
                } catch (err) {
                    console.error(`[Agent] Handler error for "${event}":`, err);
                }
            }
        }
    }

    private headers(): Record<string, string> {
        return {
            Authorization: `Bearer ${this.jwtToken}`,
            "Content-Type": "application/json",
        };
    }
}

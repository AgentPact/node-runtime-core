/**
 * @agentpactai/runtime - WebSocket Client
 *
 * Provides auto-reconnecting WebSocket connection to the AgentPact platform
 * backend, with JWT authentication, heartbeat, and typed event handling.
 *
 * @example
 * ```ts
 * import { AgentPactWebSocket } from '@agentpactai/runtime';
 *
 * const ws = new AgentPactWebSocket('ws://localhost:4000/ws');
 * ws.on('TASK_CREATED', (data) => console.log('New task:', data));
 * await ws.connect('jwt-token-here');
 * ws.subscribeToTask('task-id-123');
 * ```
 */

/** Event handler type */
export type EventHandler = (data: unknown) => void;

/** WebSocket connection options */
export interface WebSocketOptions {
    /** Auto-reconnect on disconnect (default: true) */
    autoReconnect?: boolean;
    /** Reconnect delay in ms (default: 3000) */
    reconnectDelay?: number;
    /** Max reconnect attempts (default: 10) */
    maxReconnectAttempts?: number;
    /** Heartbeat interval in ms (default: 30000) */
    heartbeatInterval?: number;
}

/** Connection state */
export type ConnectionState = "disconnected" | "connecting" | "connected" | "authenticated";

/** Incoming message from server */
interface ServerMessage {
    event: string;
    data?: unknown;
    timestamp?: number;
}

export class AgentPactWebSocket {
    private ws: WebSocket | null = null;
    private url: string;
    private token: string | null = null;
    private opts: Required<WebSocketOptions>;
    private handlers = new Map<string, Set<EventHandler>>();
    private reconnectAttempts = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private _state: ConnectionState = "disconnected";

    constructor(url: string, options: WebSocketOptions = {}) {
        this.url = url;
        this.opts = {
            autoReconnect: options.autoReconnect ?? true,
            reconnectDelay: options.reconnectDelay ?? 3000,
            maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
            heartbeatInterval: options.heartbeatInterval ?? 30000,
        };
    }

    /** Current connection state */
    get state(): ConnectionState {
        return this._state;
    }

    /**
     * Connect to the WebSocket server and authenticate with JWT.
     * Resolves when authenticated, rejects on auth failure or connection error.
     */
    async connect(token: string): Promise<void> {
        this.token = token;
        this._state = "connecting";

        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.url);
            } catch (err) {
                this._state = "disconnected";
                reject(err);
                return;
            }

            const authTimeout = setTimeout(() => {
                reject(new Error("Authentication timeout"));
                this.ws?.close();
            }, 10000);

            this.ws.onopen = () => {
                this._state = "connected";
                this.reconnectAttempts = 0;
                // Send auth message
                this.send({ type: "auth", token });
            };

            this.ws.onmessage = (event: MessageEvent) => {
                try {
                    const msg: ServerMessage = JSON.parse(
                        typeof event.data === "string" ? event.data : event.data.toString()
                    );

                    // Handle auth response
                    if (msg.event === "auth:success") {
                        clearTimeout(authTimeout);
                        this._state = "authenticated";
                        this.startHeartbeat();
                        this.emit("connected", msg.data);
                        resolve();
                        return;
                    }

                    if (msg.event === "auth:error") {
                        clearTimeout(authTimeout);
                        this._state = "disconnected";
                        reject(new Error("Authentication failed"));
                        this.ws?.close();
                        return;
                    }

                    // Dispatch to handlers
                    this.emit(msg.event, msg.data);
                } catch (err) {
                    this.emit("error", { message: "Failed to parse message", error: err });
                }
            };

            this.ws.onclose = () => {
                clearTimeout(authTimeout);
                this.stopHeartbeat();
                const wasAuthenticated = this._state === "authenticated";
                this._state = "disconnected";
                this.emit("disconnected", undefined);

                if (wasAuthenticated && this.opts.autoReconnect) {
                    this.scheduleReconnect();
                }
            };

            this.ws.onerror = (error: Event) => {
                this.emit("error", { message: "WebSocket error", error });
            };
        });
    }

    /** Disconnect from the server */
    disconnect(): void {
        this.opts.autoReconnect = false;
        this.stopHeartbeat();
        this.clearReconnect();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this._state = "disconnected";
    }

    /** Subscribe to a task's real-time events */
    subscribeToTask(taskId: string): void {
        this.send({ type: "subscribe", taskId });
    }

    /** Register an event handler */
    on(event: string, handler: EventHandler): () => void {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        this.handlers.get(event)!.add(handler);

        // Return unsubscribe function
        return () => {
            this.handlers.get(event)?.delete(handler);
        };
    }

    /** Remove an event handler */
    off(event: string, handler: EventHandler): void {
        this.handlers.get(event)?.delete(handler);
    }

    /** Remove all handlers for an event (or all events) */
    removeAllListeners(event?: string): void {
        if (event) {
            this.handlers.delete(event);
        } else {
            this.handlers.clear();
        }
    }

    // ──── Private ────────────────────────────────────────────────────

    private send(data: Record<string, unknown>): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    private emit(event: string, data: unknown): void {
        const handlers = this.handlers.get(event);
        if (handlers) {
            for (const handler of handlers) {
                try {
                    handler(data);
                } catch (err) {
                    console.error(`[AgentPactWS] Handler error for "${event}":`, err);
                }
            }
        }

        // Also emit to wildcard listeners
        const wildcardHandlers = this.handlers.get("*");
        if (wildcardHandlers) {
            for (const handler of wildcardHandlers) {
                try {
                    handler({ event, data });
                } catch (err) {
                    console.error("[AgentPactWS] Wildcard handler error:", err);
                }
            }
        }
    }

    private startHeartbeat(): void {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            this.send({ type: "ping" });
        }, this.opts.heartbeatInterval);
    }

    private stopHeartbeat(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    private scheduleReconnect(): void {
        if (this.reconnectAttempts >= this.opts.maxReconnectAttempts) {
            this.emit("reconnect_failed", {
                attempts: this.reconnectAttempts,
            });
            return;
        }

        const delay = this.opts.reconnectDelay * Math.pow(1.5, this.reconnectAttempts);
        this.reconnectAttempts++;

        this.emit("reconnecting", {
            attempt: this.reconnectAttempts,
            delay,
        });

        this.reconnectTimer = setTimeout(async () => {
            if (this.token) {
                try {
                    await this.connect(this.token);
                } catch {
                    // connect failure will trigger onclose → scheduleReconnect
                }
            }
        }, delay);
    }

    private clearReconnect(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
}

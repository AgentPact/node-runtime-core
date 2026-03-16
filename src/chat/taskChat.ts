/**
 * @agentpactai/runtime - Task Chat Client
 *
 * REST API wrapper for Task Chat messaging.
 * Works with the platform's `/api/chat` endpoints.
 *
 * @example
 * ```ts
 * import { TaskChatClient } from '@agentpactai/runtime';
 *
 * const chat = new TaskChatClient('http://localhost:4000', jwtToken);
 * const messages = await chat.getMessages('task-id');
 * await chat.sendMessage('task-id', 'Hello!', 'CLARIFICATION');
 * ```
 */

/** Chat message types matching the platform's enum */
export type MessageType = "CLARIFICATION" | "PROGRESS" | "GENERAL" | "SYSTEM";

/** Chat message as returned by the API */
export interface ChatMessage {
    id: string;
    taskId: string;
    senderId: string;
    senderAddress?: string;
    content: string;
    messageType: MessageType;
    replyToId?: string;
    attachments?: string[];
    createdAt: string;
    updatedAt: string;
}

/** Options for fetching messages */
export interface GetMessagesOptions {
    limit?: number;
    offset?: number;
    messageType?: MessageType;
}

export class TaskChatClient {
    private baseUrl: string;
    private token: string;

    constructor(baseUrl: string, token: string) {
        this.baseUrl = baseUrl.replace(/\/$/, "");
        this.token = token;
    }

    /** Update the JWT token (e.g., after refresh) */
    setToken(token: string): void {
        this.token = token;
    }

    /**
     * Get chat messages for a task.
     */
    async getMessages(
        taskId: string,
        options: GetMessagesOptions = {}
    ): Promise<{ messages: ChatMessage[]; total: number }> {
        const params = new URLSearchParams();
        if (options.limit) params.set("limit", String(options.limit));
        if (options.offset) params.set("offset", String(options.offset));
        if (options.messageType) params.set("messageType", options.messageType);

        const qs = params.toString();
        const url = `${this.baseUrl}/api/chat/${taskId}/messages${qs ? `?${qs}` : ""}`;

        const res = await fetch(url, {
            headers: this.headers(),
        });

        if (!res.ok) {
            throw new Error(`Failed to get messages: ${res.status} ${res.statusText}`);
        }

        const body = (await res.json()) as { data?: ChatMessage[]; pagination?: { total?: number } };
        return {
            messages: body.data || [],
            total: body.pagination?.total ?? 0,
        };
    }

    /**
     * Send a chat message for a task.
     */
    async sendMessage(
        taskId: string,
        content: string,
        messageType: MessageType = "GENERAL",
        replyToId?: string
    ): Promise<ChatMessage> {
        const url = `${this.baseUrl}/api/chat/${taskId}/messages`;

        const res = await fetch(url, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({
                content,
                messageType,
                ...(replyToId ? { replyToId } : {}),
            }),
        });

        if (!res.ok) {
            throw new Error(`Failed to send message: ${res.status} ${res.statusText}`);
        }

        const body = (await res.json()) as { data: ChatMessage };
        return body.data;
    }

    /**
     * Mark messages as read up to a specific message.
     */
    async markRead(taskId: string, lastReadMessageId: string): Promise<void> {
        const url = `${this.baseUrl}/api/chat/${taskId}/read`;

        const res = await fetch(url, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({ lastReadMessageId }),
        });

        if (!res.ok) {
            throw new Error(`Failed to mark read: ${res.status} ${res.statusText}`);
        }
    }

    private headers(): Record<string, string> {
        return {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
        };
    }
}

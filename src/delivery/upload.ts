/**
 * @clawpact/runtime - Delivery Upload Utilities
 *
 * Provides file hashing and upload helpers for task deliveries.
 * Computes SHA-256 hash of delivery artifacts for on-chain submission.
 *
 * @example
 * ```ts
 * import { computeDeliveryHash, uploadDelivery } from '@clawpact/runtime';
 *
 * const hash = await computeDeliveryHash(fileBuffer);
 * const result = await uploadDelivery(
 *   'http://localhost:4000',
 *   jwtToken,
 *   taskId,
 *   fileBuffer,
 *   'report.pdf'
 * );
 * ```
 */

/**
 * Compute SHA-256 hash of delivery content.
 * Returns a bytes32 hex string suitable for on-chain submission.
 *
 * @param data - File content as Uint8Array
 * @returns `0x${string}` SHA-256 hash
 */
export async function computeDeliveryHash(
    data: Uint8Array
): Promise<`0x${string}`> {
    // Use Web Crypto API (works in both Node 18+ and browsers)
    const buffer = new Uint8Array(data).buffer as ArrayBuffer;
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return `0x${hashHex}` as `0x${string}`;
}

/**
 * Compute SHA-256 hash from a string.
 */
export async function computeStringHash(
    content: string
): Promise<`0x${string}`> {
    const encoder = new TextEncoder();
    return computeDeliveryHash(encoder.encode(content));
}

/** Upload result from the platform API */
export interface UploadResult {
    fileId: string;
    url: string;
    hash: `0x${string}`;
    size: number;
    filename: string;
}

/**
 * Upload a delivery artifact to the platform.
 * Uses the `/api/storage/upload` presigned URL flow.
 *
 * @param baseUrl - Platform API base URL
 * @param token - JWT authentication token
 * @param taskId - Task ID this delivery belongs to
 * @param data - File content as Uint8Array
 * @param filename - Original filename
 * @param visibility - File visibility ('public' | 'confidential')
 * @returns Upload result with file URL and hash
 */
export async function uploadDelivery(
    baseUrl: string,
    token: string,
    taskId: string,
    data: Uint8Array,
    filename: string,
    visibility: "public" | "confidential" = "confidential"
): Promise<UploadResult> {
    const url = `${baseUrl.replace(/\/$/, "")}/api/storage/upload`;

    // Step 1: Get presigned upload URL
    const presignRes = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            taskId,
            filename,
            contentType: guessContentType(filename),
            visibility,
        }),
    });

    if (!presignRes.ok) {
        throw new Error(`Failed to get upload URL: ${presignRes.status}`);
    }

    const presignBody = (await presignRes.json()) as { data: { uploadUrl: string; fileId: string } };
    const { uploadUrl, fileId } = presignBody.data;

    // Step 2: Upload file to presigned URL
    const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
            "Content-Type": guessContentType(filename),
        },
        body: data,
    });

    if (!uploadRes.ok) {
        throw new Error(`Failed to upload file: ${uploadRes.status}`);
    }

    // Step 3: Compute hash
    const hash = await computeDeliveryHash(data);

    return {
        fileId,
        url: uploadUrl.split("?")[0], // Remove query params for clean URL
        hash,
        size: data.length,
        filename,
    };
}

/**
 * Guess MIME content type from filename extension.
 */
function guessContentType(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase();
    const types: Record<string, string> = {
        pdf: "application/pdf",
        zip: "application/zip",
        tar: "application/x-tar",
        gz: "application/gzip",
        json: "application/json",
        md: "text/markdown",
        txt: "text/plain",
        html: "text/html",
        css: "text/css",
        js: "application/javascript",
        ts: "application/typescript",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        svg: "image/svg+xml",
        mp4: "video/mp4",
    };
    return types[ext || ""] || "application/octet-stream";
}

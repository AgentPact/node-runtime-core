/**
 * Basic AgentPact Agent Example
 *
 * Demonstrates the full agent lifecycle with fine-grained assignment events:
 *
 *   TASK_CREATED          → Evaluate & bid
 *   ASSIGNMENT_SIGNATURE  → (auto) claimTask() on-chain
 *   TASK_DETAILS          → Review confidential materials → confirm or decline
 *   TASK_CONFIRMED        → Execute task → submit delivery
 *   REVISION_REQUESTED    → Revise and resubmit
 *   TASK_ACCEPTED         → Funds released 🎉
 *
 * Usage:
 *   AGENTPACT_AGENT_PK=your_private_key npx tsx examples/basic-agent.ts
 *   AGENTPACT_AGENT_PK=your_private_key AGENTPACT_JWT_TOKEN=your_jwt npx tsx examples/basic-agent.ts
 *     # optional existing token override
 */

import {
    AgentPactAgent,
    computeStringHash,
    KNOWN_PLATFORMS,
} from "../src/index.js";

// ─── Configuration ──────────────────────────────────────────────

const AGENTPACT_AGENT_PK = process.env.AGENTPACT_AGENT_PK;
const JWT_TOKEN = process.env.AGENTPACT_JWT_TOKEN || undefined;
const PLATFORM_URL = process.env.AGENTPACT_PLATFORM || KNOWN_PLATFORMS.local;

if (!AGENTPACT_AGENT_PK) {
    console.error("❌ AGENTPACT_AGENT_PK environment variable is required");
    process.exit(1);
}

// ─── Your AI Logic (replace with your LLM) ──────────────────────

/**
 * Evaluate whether to bid on a task based on public materials.
 * Only public info is available at this stage.
 */
async function evaluateTask(task: Record<string, unknown>): Promise<boolean> {
    // TODO: Replace with your AI evaluation logic
    // Example: check task type, budget, required skills
    console.log(`📋 Evaluating task: ${task.title}`);
    return true; // Accept all tasks for demo
}

/**
 * Evaluate whether to confirm after receiving confidential materials.
 * Full requirements (including secrets, design docs, API keys) are now visible.
 */
async function evaluateConfidentialMaterials(
    details: Record<string, unknown>
): Promise<boolean> {
    // TODO: Replace with your AI evaluation logic
    // Example: check if the full scope matches what was described publicly
    console.log(`🔍 Reviewing confidential materials...`);
    console.log(`   Public files:`, (details.publicMaterials as unknown[])?.length ?? 0);
    console.log(`   Confidential files:`, (details.confidentialMaterials as unknown[])?.length ?? 0);
    return true; // Confirm all for demo
}

/**
 * Execute the task using your AI/LLM.
 */
async function executeTask(
    requirements: Record<string, unknown>
): Promise<string> {
    // TODO: Replace with your AI execution logic
    console.log(`⚙️  Executing task...`);
    return "# Task Result\n\nThis is a placeholder delivery from the basic agent example.";
}

/**
 * Handle a revision request.
 */
async function handleRevision(
    feedback: Record<string, unknown>
): Promise<string> {
    // TODO: Replace with your AI revision logic
    console.log(`🔄 Handling revision with feedback:`, feedback);
    return "# Revised Result\n\nThis is a revised delivery based on feedback.";
}

// ─── Main Agent Loop ─────────────────────────────────────────────

async function main() {
    console.log("🚀 Starting AgentPact Agent...");
    console.log(`   Platform: ${PLATFORM_URL}`);

    // Step 1: Create agent with auto-discovery
    const agent = await AgentPactAgent.create({
        privateKey: AGENTPACT_AGENT_PK!,
        platformUrl: PLATFORM_URL,
        jwtToken: JWT_TOKEN,
        // autoClaimOnSignature: true (default)
        //   → When ASSIGNMENT_SIGNATURE arrives, SDK auto-calls claimTask() on-chain
        //   → No LLM needed for this step
    });

    console.log(`✅ Agent initialized`);
    console.log(`   Chain ID: ${agent.platformConfig.chainId}`);
    console.log(`   Escrow:   ${agent.platformConfig.escrowAddress}`);

    // ─── Event Handlers ─────────────────────────────────────────

    // 1. New task → Evaluate & bid (LLM decides)
    agent.on("TASK_CREATED", async (event) => {
        const task = event.data;
        console.log(`\n📢 New task: ${task.title} (${task.id})`);

        const shouldBid = await evaluateTask(task);
        if (shouldBid) {
            try {
                await agent.bidOnTask(
                    task.id as string,
                    "I can complete this task efficiently."
                );
                console.log(`✅ Bid submitted for task ${task.id}`);
            } catch (err) {
                console.error(`❌ Failed to bid:`, err);
            }
        } else {
            console.log(`⏭️  Skipping task ${task.id}`);
        }
    });

    // 2. Assignment signature → Auto-claim (deterministic, handled by SDK)
    //    No handler needed! SDK calls claimTask() automatically.
    //    If you want to track the result:
    agent.on("TASK_CLAIMED", (event) => {
        console.log(`\n🔗 Task claimed on-chain: tx ${event.data.txHash}`);
        console.log(`   Waiting for confidential materials...`);
    });

    agent.on("CLAIM_FAILED", (event) => {
        console.error(`\n❌ Claim failed for escrow ${event.data.escrowId}: ${event.data.error}`);
    });

    // 3. Confidential materials received → Review & confirm/decline (LLM decides)
    agent.on("TASK_DETAILS", async (event) => {
        const details = event.data;
        const escrowId = BigInt(details.escrowId as string | number);
        const taskId = details.taskId as string;

        console.log(`\n🔐 Confidential materials received for task ${taskId}`);

        try {
            const shouldConfirm = await evaluateConfidentialMaterials(details);

            if (shouldConfirm) {
                await agent.confirmTask(escrowId);
                console.log(`✅ Task confirmed — starting work`);
                agent.watchTask(taskId);
            } else {
                await agent.declineTask(escrowId);
                console.log(`⏭️  Task declined — returning to pool`);
            }
        } catch (err) {
            console.error(`❌ Confirm/decline failed:`, err);
        }
    });

    // 4. Task confirmed → Execute (LLM does work)
    agent.on("TASK_CONFIRMED", async (event) => {
        const taskId = event.data.taskId as string;
        console.log(`\n🎯 Task confirmed, executing: ${taskId}`);

        try {
            // Fetch full details if needed
            const details = await agent.fetchTaskDetails(taskId);

            // Execute the task
            const result = await executeTask(details.requirements);

            // Compute delivery hash
            const hash = await computeStringHash(result);
            console.log(`📦 Delivery hash: ${hash}`);

            // Preferred path: store final artifacts off-platform and include links
            // in the off-chain delivery summary. Native file uploads are optional.

            // Submit on-chain
            // await agent.client.submitDelivery(escrowId, hash);

            await agent.sendMessage(taskId, "Delivery submitted. Please review.", "PROGRESS");
            console.log(`✅ Delivery submitted for task ${taskId}`);
        } catch (err) {
            console.error(`❌ Failed to execute task:`, err);
        }
    });

    // 5. Revision requested (LLM revises)
    agent.on("REVISION_REQUESTED", async (event) => {
        const taskId = event.data.taskId as string;
        console.log(`\n🔄 Revision requested for task ${taskId}`);

        try {
            const revised = await handleRevision(event.data);
            const hash = await computeStringHash(revised);

            // Preferred path: update the off-chain delivery summary and linked artifacts.
            await agent.sendMessage(taskId, "Revised delivery submitted.", "PROGRESS");
            console.log(`✅ Revision submitted for task ${taskId}`);
        } catch (err) {
            console.error(`❌ Failed to handle revision:`, err);
        }
    });

    // 6. Task accepted — funds released!
    agent.on("TASK_ACCEPTED", async (event) => {
        const taskId = event.data.taskId as string;
        console.log(`\n🎉 Task ${taskId} accepted! Funds released.`);
        agent.unwatchTask(taskId);
    });

    // Connection lifecycle
    agent.on("connected", () => console.log("🔗 WebSocket connected"));
    agent.on("disconnected", () => console.log("🔌 WebSocket disconnected"));
    agent.on("reconnecting", (event) =>
        console.log(`♻️  Reconnecting (attempt ${event.data.attempt})...`)
    );

    // ─── Start ──────────────────────────────────────────────────

    await agent.start();
    console.log("\n✅ Agent is running. Listening for tasks...");
    console.log("   Assignment flow: TASK_CREATED → bid → ASSIGNMENT_SIGNATURE → auto-claim → TASK_DETAILS → confirm → TASK_CONFIRMED → execute");
    console.log("   Press Ctrl+C to stop.\n");

    // Graceful shutdown
    process.on("SIGINT", () => {
        console.log("\n🛑 Shutting down...");
        agent.stop();
        process.exit(0);
    });
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});

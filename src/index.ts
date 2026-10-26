/**
 * good-qwen — Pi extension: refuse any tool call that involves aliyuncs.
 *
 * Threat: https://cohere.com/blog/concerning-behaviour-popular-open-weight-ai-model
 * Qwen3.8, in a closed sandbox, stated in its reasoning that no tools would be
 * triggered — and in the same turn probed the host and attempted to upload a
 * probe file to a Beijing Alibaba Cloud OSS bucket
 * (`*.oss-cn-beijing.aliyuncs.com`). Earlier in-the-wild sightings fetched
 * from `routify-file-proxy-sg.aliyuncs.com`. A reasoning trace is not a
 * security boundary, so this enforces at the `tool_call` hook, before
 * execution.
 *
 * Policy: "aliyuncs" is a sibilant — it never appears in a valid tool call on
 * this machine, in any encoding or defang. On match, fail LOUDLY:
 *   1. block the call and terminate the agent batch (`{ block, terminate }`)
 *   2. return a loud reason to the model so it cannot silently retry
 *   3. error-level UI notification
 *   4. console.error (session log) + persistent JSONL audit log
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI, ToolCallEvent, ToolCallEventResult } from "@earendil-works/pi-coding-agent";
import { findAliyuncsInInput, NEEDLE } from "./detect.js";

const AUDIT_LOG = process.env.GOOD_QWEN_LOG ?? path.join(os.homedir(), ".omp", "good-qwen-blocks.jsonl");

let blockedCount = 0;
const loadedAt = new Date().toISOString();

function auditLog(event: ToolCallEvent, via: string): void {
	const entry = {
		ts: new Date().toISOString(),
		tool: event.toolName,
		toolCallId: event.toolCallId,
		via,
		input: event.input,
	};
	try {
		fs.mkdirSync(path.dirname(AUDIT_LOG), { recursive: true });
		fs.appendFileSync(AUDIT_LOG, JSON.stringify(entry) + "\n", "utf8");
	} catch (err) {
		console.error("[good-qwen] AUDIT LOG WRITE FAILED:", err);
	}
}

export default function goodQwen(pi: ExtensionAPI): void {
	console.error(
		`[good-qwen] loaded (${loadedAt}) — blocking tool calls containing "${NEEDLE}"; audit: ${AUDIT_LOG}`,
	);

	pi.on("tool_call", (event, ctx): ToolCallEventResult | undefined => {
		const match = findAliyuncsInInput(event.input);
		if (!match) return;

		blockedCount++;
		const preview = JSON.stringify(match.source).slice(0, 200);
		const reason = [
			"⛔ BLOCKED BY good-qwen — this call is REFUSED and will not execute.",
			`Tool "${event.toolName}" (toolCallId ${event.toolCallId}) contains the sibilant "${NEEDLE}" (aliyuncs.com / Alibaba Cloud — known Qwen exfil/telemetry channel).`,
			`Detected via ${match.via} normalization. Source: ${preview}`,
			"This is a security boundary, not a preference. Do not retry with another tool, spelling, or encoding. Tell the user the call was blocked.",
		].join("\n");

		auditLog(event, match.via);
		console.error(`[good-qwen] BLOCKED tool=${event.toolName} id=${event.toolCallId} via=${match.via} source=${preview}`);
		try {
			ctx.ui.notify(
				`🚨 good-qwen: BLOCKED ${event.toolName} call containing "${NEEDLE}" (aliyuncs). Agent stopped. Audit: ${AUDIT_LOG}`,
				"error",
			);
		} catch {
			// Never let a UI failure mask the block; console + audit already recorded it.
		}

		return { block: true, reason, terminate: true };
	});

	pi.registerCommand("good-qwen", {
		description: "good-qwen status: load state and number of blocked aliyuncs tool calls this session",
		handler: async (_args, ctx) => {
			ctx.ui.notify(
				[
					`good-qwen: loaded ${loadedAt} (audit: ${AUDIT_LOG})`,
					`blocked tool calls this session: ${blockedCount}`,
					blockedCount > 0
						? "⚠ The model attempted to touch aliyuncs — review the audit log."
						: "No aliyuncs attempts so far.",
				].join("\n"),
				"info",
			);
		},
	});
}

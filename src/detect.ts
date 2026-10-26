/**
 * Pure detection core for good-qwen.
 *
 * Sibilant: the bare string "aliyuncs" — Alibaba Cloud's service domain
 * (aliyuncs.com and every *.aliyuncs.com subdomain, e.g. OSS buckets like
 * `sanmaohe.oss-cn-beijing.aliyuncs.com` and the routify file proxy seen in
 * the wild: `routify-file-proxy-sg.aliyuncs.com`).
 *
 * Policy (owner decision): the string "aliyuncs" in ANY form is a sign that
 * something is wrong. It never occurs in a valid tool call on this machine,
 * so a plain substring match on the sibilant itself — after normalization —
 * is the check. Deliberately over-zealous: false positives are cheap, a
 * successful exfil attempt is not.
 *
 * Variant passes, in priority order (first hit wins):
 *   plain         raw, lowercased
 *   defanged      [.] (.) {.} <> → ".", brackets and whitespace stripped
 *   url-decoded   up to two rounds of decodeURIComponent, each defanged
 *   squashed      all non-alphanumerics stripped (ali.yun.cs, ali-yun-cs)
 */

export const NEEDLE = "aliyuncs";

export type MatchVia = "plain" | "defanged" | "url-decoded" | "squashed";

export interface AliyuncsMatch {
	/** Which variant pass of the source string triggered the match. */
	via: MatchVia;
	/** The original, unmodified input string that contains the match. */
	source: string;
}

/** Map defang conventions onto "." and strip inert separators. */
function defang(s: string): string {
	return s
		.replace(/\[\s*\.\s*\]/g, ".")
		.replace(/\(\s*\.\s*\)/g, ".")
		.replace(/\{\s*\.\s*\}/g, ".")
		.replace(/<\s*\.\s*>/g, ".")
		.replace(/[\[\](){}<>]/g, "")
		.replace(/\s+/g, "");
}

/** decodeURIComponent that swallows malformed sequences. */
function safeDecode(s: string): string {
	try {
		return decodeURIComponent(s);
	} catch {
		return s;
	}
}

/** Check one string. Returns the first matching variant, or null. */
export function findAliyuncsInString(source: string): AliyuncsMatch | null {
	const s = source.toLowerCase();
	if (s.includes(NEEDLE)) return { via: "plain", source };

	const d = defang(s);
	if (d.includes(NEEDLE)) return { via: "defanged", source };

	let decoded = s;
	for (let i = 0; i < 2; i++) {
		const next = safeDecode(decoded);
		if (next === decoded) break;
		decoded = next;
		if (decoded.includes(NEEDLE)) return { via: "url-decoded", source };
		if (defang(decoded).includes(NEEDLE)) return { via: "url-decoded", source };
	}

	if (s.replace(/[^a-z0-9]/g, "").includes(NEEDLE)) return { via: "squashed", source };

	return null;
}

/** Recursively yield every string in a JSON-like value (depth-capped). */
function* walkStrings(value: unknown, depth = 0): Generator<string> {
	if (depth > 16 || value == null) return;
	if (typeof value === "string") {
		yield value;
		return;
	}
	if (Array.isArray(value)) {
		for (const v of value) yield* walkStrings(v, depth + 1);
		return;
	}
	if (typeof value === "object") {
		for (const v of Object.values(value)) yield* walkStrings(v, depth + 1);
	}
}

/** Check a whole tool input (any tool, any shape) for the sibilant. */
export function findAliyuncsInInput(input: unknown): AliyuncsMatch | null {
	for (const s of walkStrings(input)) {
		const m = findAliyuncsInString(s);
		if (m) return m;
	}
	return null;
}

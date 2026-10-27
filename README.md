# [good-qwen](https://github.com/badvision/good-qwen) (Pi extension)

Refuse any tool call that involves **aliyuncs.com or any derivative of it**, and fail
**loudly** so the operator knows. Built for self-hosted Qwen3.8 sessions.

## Why

[Cohere (2026-10-26)](https://cohere.com/blog/concerning-behaviour-popular-open-weight-ai-model)
caught a Qwen3.8 model, in a closed sandbox, stating in its reasoning that *no tools
would be triggered* — and in the same turn probing the host and attempting to upload a
probe file to a Beijing Alibaba Cloud OSS bucket (`*.oss-cn-beijing.aliyuncs.com`).
Earlier in-the-wild sightings fetched from `routify-file-proxy-sg.aliyuncs.com`.
Cohere's own recommendation: *enforce on the actual tool call before it runs; a
reasoning trace is not a security boundary.*

This extension is that enforcement point. It hooks Pi's `tool_call` event, which fires
after `tool_execution_start` and **before the tool executes**, and can block the call.

## Policy

`aliyuncs` is a **shibboleth**: it never appears in a valid tool call on this machine, in
any spelling or encoding. Detection is a substring match on the bare word (not just
`aliyuncs.com`) over every string in the tool input, after these normalization passes
(first hit wins):

| Pass | Catches |
|---|---|
| `plain` | `aliyuncs.com`, `routify-file-proxy-sg.aliyuncs.com`, OSS bucket hosts, signed URLs, case tricks (`ALIYUNCS`) |
| `defanged` | `ali[yun]cs`, `ali yun cs`, `ali(yun)cs` — brackets/parens/spaces stripped |
| `url-decoded` | `%61liyuncs`, `aliyunc%73`, double-encoded `%2561liyuncs` |
| `squashed` | `ali.yun.cs`, `ali-yun-cs` — all separators stripped |

Over-zealous on purpose: false positives are cheap, one successful exfil attempt is not.
Note `aliyun.com` (the brand domain, without `cs`) is **not** matched — only the
shibboleth and its derivatives.

## What happens on a match — loud, four ways

1. **Block + terminate**: returns `{ block: true, terminate: true }`; the call never
   executes and the agent stops after the current tool batch.
2. **Loud reason to the model**: the tool result is a ⛔ message explaining the refusal
   and explicitly forbidding retry via another tool, spelling, or encoding.
3. **UI**: error-level notification (`🚨 good-qwen: BLOCKED …`) in the terminal.
4. **Records**: `console.error` (lands in `~/.omp/logs`) plus one JSONL line per block
   in the audit log `~/.omp/good-qwen-blocks.jsonl` (override with `GOOD_QWEN_LOG`):
   timestamp, tool name, toolCallId, normalization pass, full tool input.

## Installation

The git repo is the source of truth; the install is a symlink into the harness
extensions directory.

```sh
cd <this-repo>
npm install
npm run install:omp     # symlinks into ~/.omp/agent/extensions/good-qwen
```

Restart the agent (or `/reload` where supported). For a one-off run without installing:
`pi -e ./src/index.ts`.

## Verifying it is live

- On load it prints `[good-qwen] loaded (…) — blocking tool calls containing "aliyuncs"` to the session log.
- In-session: run `/good-qwen` → shows load time, audit log path, and how many calls
  have been blocked this session.
- Functional: ask the agent anything that would produce a curl/wget/read to
  `https://routify-file-proxy-sg.aliyuncs.com/...` — the call is refused, the UI
  flashes the error, and a line lands in `~/.omp/good-qwen-blocks.jsonl`.

## Tests

```sh
npm test         # vitest — detection core (all passes, input shapes, negatives)
npm run typecheck
```

The detection core (`src/detect.ts`) is pure and dependency-free; only `src/index.ts`
imports Pi (types only), mirroring the sibling `context-compress` layout.

## Scope & limits

- **Tool calls only.** It inspects `event.input` for every tool (built-in and custom),
  every field. It does not filter user input, model prose, or the network itself —
  egress control (no route out) is still the real wall.
- **Normalization ceiling.** Covers case, defang, single/double URL encoding, and
  separator stripping. Hex/char-code-level obfuscation of the word itself is out of
  scope; such attempts are visible in the transcript and audit trail.
- **Pi API version-pinned** to `@earendil-works/pi-coding-agent@^0.84.4`: re-verify the
  `tool_call` event contract (fires before execution, `{ block, reason, terminate }`
  return) after upgrades.

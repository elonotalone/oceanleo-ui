# W1 — Leo cloud agent: 40 s first reply, reasoning capture, tools-tier streaming

Read `00-contract.md` first (same directory). Repo `/root/projects/oceanleo/backend`. You own `app/agent_engine.py`, `app/llm.py`, `app/providers.py`, `app/agent_smol_engine.py` and their tests. Do not edit `app/cloud_computer/**` or `app/agent/task_repository.py` (W2 owns them).

## Operator complaint
"OceanLeo agent, lite model group, whole conversation under 50 characters, and sometimes it takes 40 s to see the reply." If this is our bug, fix it. If it is purely vendor speed, leave it and report the measurement.

## Evidence so far (parent, 2026-10-30)
- Lite group = triage `qwen/qwen3.8-flash` (`agent_triage`), then reply `openai/gpt-oss-20b` (`agent_reply`), both on openrouter (`usage_events`).
- Task 5c1fa505, turn 2 ("展示一个完整交付示例", 10 chars):
  - user message at 12:35:31.0
  - triage done at 35.66 (164 completion tokens)
  - empty streaming row at 35.98
  - `first_token_ms` 13470 with `thinking_chars` 1186
  - `agent_reply` usage row at 49.63 (490 completion tokens)

  490 tokens in about 14 s is far below gpt-oss-20b's normal openrouter speed.
- **Suspected bug:** in `_llm_call_stream` (`agent_engine.py` ≈1494–1497), every reasoning delta does `_update_msg_meta(msg_id, _stream_meta(streaming=True))`. That is a synchronous PostgREST PATCH (`_update_msg_meta` ≈774, sync httpx client `app/supa.py:43`) with no throttle, run inside the async event loop. So every reasoning chunk blocks the stream read and the whole gateway loop for one HTTP round trip. Content flushes are throttled (≥0.33 s / 120 chars); reasoning flushes are not.
- The reasoning text itself is thrown away; only `thinking_chars` is counted.
- `_reply_thinking_extra` (≈1419) sends `enable_thinking=False`, and `apply_param_quirks` (`providers.py` ≈469-473) strips it for non-DashScope providers. So gpt-oss always reasons.
- Triage (`_classify_intent` ≈4475, `max_tokens=1024` ≈4630, deliberately left room for reasoning) is a serial, non-streamed call that took 1.8–15.4 s.
- `_msg` does about 4 more sync DB calls (≈735-765).
- The tools tier (`_run_gateway_tools`, `reply_path:"tools"`) is not streamed.

## Do
1. **Falsify first** (architecture-debug pack). In `/tmp`, write a throwaway script that streams the same lite reply call straight to openrouter, using the gateway's own key from inside the container. Do not print the key: e.g. `docker exec oceanleo-api python /tmp-copied-script` or `python -c` reading `os.environ`.
   - Use a prompt like the real one (system prompt as built by the engine for a short chat).
   - Measure TTFT, the number of reasoning chunks, the time to the first content token and the total time.
   - Compare with the 13.5 s first token above. Also time one triage call the same way, with and without reasoning disabled, using openrouter's documented `reasoning` parameter (`{"effort":"low"}` / `{"enabled":false}` / `{"exclude":true}`; read openrouter docs or how `providers.py` already handles it).
   - Record the numbers in the Checkpoint. If the raw provider is itself slow, say so plainly.
2. **Fix the blocking writes.**
   - Never do sync DB I/O on the event loop in the streaming path: use `asyncio.to_thread` or an existing async helper, or move writes to a background flusher task.
   - Throttle reasoning flushes exactly like content flushes.
   - Make sure the stream read is never paced by DB round trips.
   - Check `_msg` / `mark_first_output` and the other per-turn sync calls on the hot path. Move what can safely move off the critical path before the first token (e.g. session touch).
3. **Capture reasoning (contract C1):**
   - Accumulate the reasoning text and store it in `meta.reasoning` on the reply row, throttled. Cap it at 16000 chars and mask secrets (reuse any existing masking helper; otherwise mask `sk-…`, `olk_…`, bearer tokens and long base64 runs).
   - Set `meta.reasoning_ms`.
   - Keep `thinking_chars`.
   - The final `meta` written at done must keep `reasoning`; check that every later `_update_msg_meta` call merges rather than replaces the meta, so suggestions, done etc. don't wipe it. Today `_update_msg_meta` replaces the whole meta: check the callers.
4. **Triage latency.**
   - If the measurement shows reasoning makes triage slow, turn reasoning off (or set effort low) for the triage call through the correct openrouter parameter. Lower `max_tokens` accordingly.
   - Keep triage quality: run the existing triage tests.
   - Do not change which models the lite group uses.
5. **Tools tier.** Stream `_run_gateway_tools`' final answer into the reply row like the reply path does (C1). If its structure makes true streaming impossible, write a placeholder row immediately so the UI shows activity, and explain why in the Checkpoint.
6. **Reply reasoning.** Pass the provider-correct parameter so the reply model's reasoning effort is low for short chats if openrouter supports it for gpt-oss (`reasoning.effort`). Do not break DashScope. Measure the before/after first-token time with your script.
7. **Tests:** add or extend backend tests for:
   - the reasoning throttle (a fake stream with 500 reasoning deltas causes ≤ N DB writes)
   - `meta.reasoning` stored, capped and masked
   - meta merge preserving `reasoning`
   - the tools tier streaming or placeholder
   - triage params

   Run the existing agent engine tests that cover these functions (`grep -l "_llm_call_stream\|_classify_intent\|_run_gateway_tools" tests/`).

## Done when
- The Checkpoint has measured provider numbers vs. our pipeline numbers (before / after), files changed and test results.
- Every Request for another unit is listed.
- Nothing is committed; the parent commits.

## Checkpoint

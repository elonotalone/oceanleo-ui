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

Status: done (not committed). W1, 2026-10-30.

### Verdict on the 40 s complaint
Mostly our bug, with some vendor slowness on top. The parent's suspicion was right and the measurements confirm it.
- **Our bug (fixed):** one openrouter provider for `openai/gpt-oss-20b` (Darkbloom) streams reasoning one token per SSE chunk (312 chunks for 1366 chars). The old loop did a synchronous PostgREST PATCH (~25–47 ms) on the event loop for every reasoning chunk. So the stream read, and the whole gateway, was paced by DB round trips. The bench below reproduces the incident's 13.5 s first token (OLD on Darkbloom: median 13.4 s, writes median 370 per turn).
- **Vendor slowness (reduced by params):** triage on `qwen/qwen3.8-flash` reasons before it answers. That costs 150–520 reasoning tokens and 1–15 s, with long tails from Alibaba queueing on openrouter. gpt-oss's default reasoning adds 1–3 s before the first content.
- **What is left is vendor speed:** after the fix, the remaining first-token time is provider TTFT (~1 s). Total length is about 100 tok/s generation. openrouter/Alibaba occasionally returns "Provider returned error" or queues for 5–10 s on triage. That falls back to the heuristic, as before.

### Measurements (all from inside `oceanleo-api`, real openrouter, platform key read in-process, never printed)
Scripts: `/tmp/w1-probe/{probe.py,triage_quality.py,bench.py,bench_triage.py,toolround.py}` (throwaway). DB select round trip from the container: 23–47 ms.

1. **Raw provider, reply call** (real reply system prompt plus a short context, max_tokens 1200):

   | gpt-oss-20b setting | TTFT | first content | total | reasoning |
   |---|---|---|---|---|
   | default | 0.94–1.19 s | 1.71–3.50 s | 10.5–11.0 s | 109–312 tok |
   | `reasoning.effort=low` | 1.10–1.47 s | 1.25–1.73 s | 10.6–13.2 s | 21–27 tok |

   Darkbloom sent 312 reasoning chunks; Parasail sent 6–13.
2. **Raw triage** (`qwen/qwen3.8-flash`, real triage system prompt, 10 labelled prompts in parallel):

   | setting | accuracy | median | max |
   |---|---|---|---|
   | default reasoning, mt 1024 | 10/10 | 4.35 s | 8.6 s |
   | `reasoning.enabled=false`, mt 16 | 10/10 | 0.70 s | 4.9 s |
   | `reasoning.max_tokens=128`, mt 256 | 10/10 | 2.25 s | 4.2 s |

   `effort=low` and `exclude=true` did not reduce the reasoning tokens (145–404 tokens, 4–8 s).
3. **Reply pipeline before/after** (`bench.py`): the OLD engine at HEAD against the NEW working tree. Same real stream. DB calls are replaced by 35 ms sleeps, which are sync on the loop for OLD as before. "First visible" means the first write that contains text. 3 reps each, medians:

   | route | OLD | NEW writer only | NEW + effort low (shipped) |
   |---|---|---|---|
   | Darkbloom forced | **13.42 s** (10.3–15.1), 370 writes | 3.59 s, 35 writes | **1.04 s** (0.95–1.25), 21 writes |
   | default routing | 3.83 s, 41 writes | 3.00 s, 25 writes | **0.99 s** (0.87–1.62), 21 writes |

   An earlier run gave the same picture (Darkbloom OLD 8.3 s → 3.7 s → 1.37 s).
4. **Triage before/after** (`bench_triage.py`): OLD vs NEW `_classify_intent`, 6 prompts × 2, aux pinned to openrouter qwen3.8-flash.
   - Run A: OLD median 1.44 s (max 8.15 s), 12/12; NEW median 1.20 s (max 5.21 s), 12/12.
   - Run B: OLD median 1.85 s (max 12.8 s, one vendor error); NEW median 0.73 s (max 9.8 s, one vendor error → heuristic fallback).
   - Tails are openrouter/Alibaba queueing.
5. **Pipeline overhead removed from the critical path:**
   - The reply-row INSERT plus about 5 session-bookkeeping round trips now overlap the provider request instead of preceding it.
   - Triage usage accounting (4–5 round trips, ~200 ms) now runs in the background.
   - The parent's timeline had a 320 ms gap between triage done and the streaming row.
6. **Tools tier real check** (`toolround.py`, gpt-oss-20b with web_search): streamed tool-call deltas assembled to `web_search {"query":"上海 今天天气",...}` with an id. Usage was parsed and finish was `tool_calls`. In the answer round the first delta arrived at 1.33 s and content streamed.

### What changed
- `backend/app/agent_engine.py`
  - `_StreamRowWriter`: a latest-wins background writer, one PATCH in flight per row, run in a worker thread through `_update_msg_fields`. `submit()` never blocks. `flush()` keeps submit order, so the final done/stopped write is never overtaken by a stale streaming write. The row INSERT (`_msg`) also runs in a thread and overlaps the provider request.
  - `_ReplyRowStream`:
    - content and reasoning use the same throttle (≥0.33 s or ≥120 new chars), and the first visible text is flushed at once
    - `meta.reasoning` is masked and capped at 16000 (`reasoning_truncated:true` when cut)
    - `meta.reasoning_ms` runs from the first reasoning delta to the first text, or to turn end
    - `meta.thinking_chars` is kept, and `meta.streaming:true` stays set while generating
    - `meta()` is the single meta builder, so done / stopped / error / suggestions writes keep `reasoning`.
  - `_mask_secrets`: masks `sk-…`, `olk_…`, `Bearer …`, and long mixed-case+digit base64 runs (→ `[已隐藏]`).
  - `_llm_call_stream`: rewritten on the above. Usage accounting is awaited in a worker thread. `getattr(resolved,"key_mode")` fixes the 5 stale `test_tpp_w2_stream` cases.
  - `_reply_thinking_extra(model, provider)`: DashScope unchanged (`enable_thinking:false`). OpenRouter gpt-oss / o-series get `reasoning.effort=low`. Other OpenRouter models get nothing, so reasoning is never switched ON for Claude and similar models.
  - Triage: `_triage_reasoning_params` sends `reasoning.enabled=false` with `max_tokens=32` on OpenRouter models that allow it. Everywhere else it keeps 1024 and the old deepseek-v4-flash rationale. `_llm_call(..., background_usage=True)` moves triage accounting off the critical path.
  - `_msg`: session bookkeeping is cached. The task→session lookup is done once, the touch is throttled to 5 s per session, and `first_output_at` is stamped once. After the first message this drops from ~5 round trips to 0.
  - Tools tier (`_run_gateway_tools` + `run_agent_with_tools(on_stream=…)` + `_chat_round_streamed` + `_ToolTierStream`): **true streaming.**
    - Each model round is streamed with tools; tool-call deltas are assembled per OpenAI's format.
    - The round row is created at its first delta. A round that ends in tool calls becomes `kind:"analysis"`: content is the interim prose, or the reasoning when there is none. Meta is `interim/summary` plus reasoning.
    - The answer round's row becomes the final `text` row: `done`, `gateway_tool_tier`, `reply_path:"tools"`, reasoning, `first_token_ms`, `total_ms`. The suggestions write keeps reasoning.
    - On error or stop the open row is closed without `streaming`.
    - Responses-protocol BYOK connections keep the blocking `llm.chat`.
    - If a stream fails before any delta, the round falls back to `llm.chat`.
  - Tool-loop usage accounting is now `asyncio.to_thread` (it was 4 sync DB writes per round on the loop).
- `backend/app/providers.py`: `reasoning_extra(provider, model, level)`, the OpenRouter `reasoning` mapping. Docstring has the measurements.
- Tests:
  - new `backend/tests/test_w1_leo_latency.py` (18 tests):
    - 500-delta throttle: ≤8 writes, not paced by 50 ms writes
    - reasoning masked/capped/timed
    - meta merge on done and stop
    - triage params and background accounting
    - reply params
    - `_msg` caching
    - tools tier streaming / analysis conversion / suggestions keep reasoning / error close
  - updated `test_tpp_w2_stream.py`, `test_followup_latency_paths.py`, `test_text_safety_release_regressions.py` to use the new `_update_msg_fields` seam
  - updated `test_agent_gateway_tool_tier.py`: the fixture disables streaming so it no longer dials the provider
  - updated `test_agent_triage_fallthrough.py`: the budget test pins the aux route to bailian.
- Not touched: `app/agent_smol_engine.py`, `app/llm.py` (no change needed: `apply_param_quirks` passes `reasoning` through).

### Tests run
All runs were `docker exec -e OCEANLEO_SUPABASE_URL= -e OCEANLEO_SERVICE_ROLE_KEY= -w /app oceanleo-api python -m unittest …`. The DB env was blanked so no test can reach the real DB. Pytest is not installed in the container (`No module named pytest`), so unittest was used.
- **W1 core set:** `test_w1_leo_latency`, `test_tpp_w2_stream`, `test_agent_gateway_tool_tier`, `test_agent_triage_fallthrough`. 53 tests, OK.
- **Focused set** (15 modules, 262 tests: triage_research, engine_honesty, gateway_tool_tier, completion_contract, builder_intent_receipts, progress_contract, device_session_loop, cc_task_mount, task_skill_invocation, followup_latency_paths, triage_fallthrough, tpp_w2_stream, step_preview_contract, personalization, w1).
  - Result: 3 failures and 8 errors. All 11 already fail on the clean baseline, before my edits:
    - LiveBench ×3 and TaskServiceSplit ×3: missing host `scripts/triage_bench.py`, and `task not found`
    - `test_branch_records_mentions`: `task not found`
    - step_preview blob: no `codeagent_runner`
    - completion_contract generated_file and progress_contract preview ×2: assertion failures.
  - The baseline also had 9 errors in `test_tpp_w2_stream` and ReplyPath. They now pass.
- **Wider set** (18 modules, 185 tests): the 6 non-assertion failures are env-only. 5 modules fail on import (`FolderError unavailable`) because the DB env was blanked. `find_human_help` needs the host sandbox-executor path. The one assertion failure, the `edition.py` hash, is in a file I did not touch. None of these tests reference the changed functions.
- **Not runnable here:** `test_text_safety_release_regressions` (needs pytest).

### Incident to report
In the first `bench_triage.py` run, NEW triage's background accounting task fired after the bench's `patch` scope had closed. So the real `_record_llm_usage` ran for fake ids `bench-user` / `bench-task`. Every write was rejected by Postgres (`22P02 invalid input syntax for type uuid`) across record_usage, presence touch, wallet nano rpc, credits bump and token bump, so **no rows were written**. The bench was fixed to block `_db` and accounting process-wide, and was rerun. The production behaviour is intended: accounting completes in the background.

### Not done / residual
- `_make_stop_checker` still does a sync `agent_tasks` select every 2 s on the loop (~35 ms per 2 s).
- `resolve_key` still does sync wallet / daily-limit / platform-key reads before each call.
- Tool-tier step rows still insert synchronously, now 1 round trip each thanks to the cache.
- The CodeAct / device-session paths are untouched.

### Requests
- **W3 (renderer):**
  - Tool-tier turns now produce `kind:"analysis"` rows with `meta.interim:true`, `meta.summary`, `meta.gateway_tool_tier:true` and optional `meta.reasoning` / `reasoning_ms` / `thinking_chars`, between the `step` rows. The answer `text` row (`reply_path:"tools"`) now also carries `meta.reasoning`.
  - The reply row may carry `meta.reasoning_truncated:true` when reasoning exceeded 16000 chars.
  - `reasoning_ms` is present only when the model produced reasoning.
  - A streaming tool-tier row starts as `kind:"text"` with `meta.streaming:true` and may flip to `kind:"analysis"` when its round ends in tool calls.
- **Parent:** restart `oceanleo-api` once at integration (the running gateway does not reload). The CN edition is unchanged: DashScope params are untouched, and CN streams are still held for moderation, then flushed through the writer.

### New user-visible strings
- `[已隐藏]`: the mask placeholder inside reasoning text (backend string, no `tt`).

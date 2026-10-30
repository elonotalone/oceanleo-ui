# W2 — Computer task sessions backend: My Tasks, dialog latency, ACP process lifecycle, token out of argv

Read `00-contract.md` first (same directory). Repo `/root/projects/oceanleo/backend`.

**You own:**
- `app/cloud_computer/**`, including `agent_dialog.py`, `task_sessions.py`, `acp/*.py`, `registry.py`, `bridge.py`
- `app/agent/task_repository.py` and `app/agent/query_service.py`
- new migration files under `migrations/`, named with the next free number
- their tests

Do not edit `app/agent_engine.py`, `app/llm.py` or `app/providers.py` (W1 owns them). Do not apply migrations to the database and do not restart containers; the parent does both. Never kill, restart or signal any process on this host. The ACP processes on this host include the parent's own live Claude Code session.

## 1. My Tasks misses every computer task (confirmed bug)
- The sidebar asks `GET /v1/agent/tasks?site_id=oceanleo` (`task_repository.py` ≈527-529 adds `eq("site_id", site)`).
- `computer_task_create` inserts `agent_tasks` without `site_id`: `migrations/0304_computer_task_sessions.sql:57`, and again `0306_computer_task_lifecycle.sql:175`. The column default is `''`.
- In the DB, all 9 `mode='computer'` rows have `site_id=''`.

**Required:** computer tasks appear in My Tasks on **every** site (site keys are context, not boundaries; a computer task belongs to no site).

**Fix the read side:** when a `site_id` filter is applied, also include `mode='computer'` rows (an `or` filter in PostgREST syntax, e.g. `or=(site_id.eq.<site>,mode.eq.computer)`; check that the client's `.or_()` composes with the other filters). Keep the orphan and shell filters in `query_service.py` working.

**Also new migration:**
- `create or replace` both functions so new rows get `site_id='oceanleo'`; keep the signature unchanged.
- Backfill the existing `mode='computer'` rows with `site_id=''` to `'oceanleo'`.

Write a focused test that a `mode='computer'` task with any `site_id` is listed for `site_id=<another site>`.

## 2. Dialog latency on connect and send (from measured traces)
On connect the browser sends `status`, `sessions`, `occupancy`, `models` (`useAgentDialogController.tsx:569-575`). The socket loop in `agent_dialog.py` (≈192-207; `_BACKGROUND` set ≈103) handles them one at a time. `sessions` for claude can start the agent and run a remote command with a 15 s timeout (≈1105-1119). `occupancy`, which gates sending, waits behind them.

**Required:**
- `occupancy` is answered immediately. For a brand-new managed session with no native id it is trivially free.
- `sessions` / `models` / `status` run in the background so they can't block `occupancy` or `prompt`.
- Ordering guarantees the UI relies on are preserved; read the controller's handling first.
- A `models` request on a fresh connection pre-starts the agent process: that is the prewarm W4 relies on. Confirm it does (`agent_dialog.py` ≈1474-1477), make it reliable, and document the frame W4 should send.

**Before the prompt reaches the agent** (≈228, 477-490, 1315, 1402, 1755; `task_sessions.py` 96-131) the server serially runs:
- `validate_managed`
- `resolve_cwd` (a remote command the first time)
- `_agent_settings`
- the `_mcp_token` check
- `bind_managed`, which repeats the validation and adds get + rpc
- `_apply_listed_prefs`

**Required:**
- Cache per connection what is stable: settings, token, cwd, validation of the same session.
- Send the prompt to the agent first, then do the bookkeeping (`bind_managed`, archive) in the background, with no change to ownership checks. Validation of ownership must still happen before the prompt.

**Broadcast:** `broadcast()` (`acp/registry.py` ≈106) awaits the Supabase archive write in `task_sessions.capture` before sending each frame to the browser. The writer holds its lock during a 0.5 s timed save (`task_sessions.py` ≈185-188).

**Required:**
- Frames go to viewers first; archiving is queued and never blocks live delivery.
- The archive must still be complete and ordered. Keep the user/done/error frames durable; test it.

## 3. Leftover ACP processes (confirmed)
On this host, `claude-agent-acp`, `codex-acp`, `cursor-agent acp` and their `claude` / `codex app-server` children from Oct 23–30 are still alive. The `oceanleo-node` service uses about 15.9 GB RAM plus 3.8 GB swap.

How they get there:
- The gateway's idle close (`acp/session.py` `IDLE_S=30*60` ≈57, `_kill_process` ≈1670) only closes the SSH exec channel.
- The remote command (`acp/launch.py` `launch_command` ≈74, run through a `sudo -n --preserve-env=HOME …` wrapper) survives when the channel closes or the gateway restarts (blue-green deploys).

**Required, done gateway-side only (no `oceanleo-node` binary change; that repo is not authorized for release):**
- Make the launched command die with its channel. For example, wrap it so it runs in its own process group under `setsid`, with a small shell watchdog that kills the group when stdin hits EOF or the parent dies. Choose a mechanism that works through the existing exec bridge for Linux, macOS and Windows targets: read `launch.py` for the per-OS command forms; if Windows needs a different approach or is already fine, say so.
- On close/idle, actively send a kill for the process group through the bridge before closing.
- Add an orphan reaper: when the gateway (re)starts a program on a computer, kill earlier processes of that program on the same computer that no live gateway session owns. Only processes started by this launcher may be reaped: mark them, e.g. with an env var or argv tag like `OCEANLEO_ACP_OWNER=<gateway-session-id>`.
- Never reap a process that belongs to a live session.
- Write a throwaway proof in `/tmp` first (architecture-debug pack): spawn a dummy long `sleep` through the same wrapper shape locally with `bash -c`, close stdin, and verify the group dies. Record the result.
- Tests for the launch command shape.

## 4. Machine token visible in `ps` (confirmed)
The `claude` child gets `--mcp-config '<json with Authorization: Bearer olk_…>'` on its argv. `claude-agent-acp` builds that from the ACP `session/new` `mcpServers` we send (`acp/session.py` ≈686-767). Anyone on the machine who can list processes can read the token.

**Required:** keep the token off argv.
- Candidate: send the header as `Bearer ${OCEANLEO_MCP_TOKEN}` and put the real value in the agent process environment via the launch command. Claude Code expands `${VAR}` in MCP config headers. Codex and Cursor have their own config paths (`cli_tools.py`).
- **Prove it before relying on it.** In `/tmp`, run the installed `claude-agent-acp` adapter on this host with a fake MCP server URL and a fake token env var, then inspect `ps` for the child's argv and confirm the MCP request carries the expanded header (a tiny local HTTP listener on 127.0.0.1). Use a fake token, never the real one.
- If expansion does not work, choose another proven route (e.g. a 0600 temp file referenced by path, if the adapter supports it). If nothing works, report back instead of hacking.
- Codex / Cursor: check whether their token reaches argv. Fix it the same way or report.

## Done when
- Focused tests pass (My Tasks listing, dialog ordering, archive-after-broadcast, launch wrapper, token env).
- The migration file is written and its SQL reviewed: it will run on the shared production DB, so it must be idempotent and must not touch non-computer rows.
- The Checkpoint lists the proofs with results, files changed, tests, Requests, and the exact prewarm frame for W4.
- Nothing is committed.

## Checkpoint

**Status: done (2026-10-30, W2). Nothing committed, no migration applied, no container restarted, no host process signalled except W2's own proof children.**

### Proofs (architecture-debug)
- **P1 lifecycle (`/tmp/w2-proof/lifecycle_proof.sh`, real `launch_command()` shape, own `setsid` sessions only).** The book's stdin-EOF/parent-death watchdog idea was checked against the node source first and does **not** fit as written: `oceanleo-node/internal/acp/proc.go` deliberately owns the agent's stdin pipe and keeps the child alive when the SSH channel closes (that is how a turn survives a gateway restart / blue-green). Channel close never reaches the agent's stdin, so that watchdog would never fire. Real leak causes found: (a) node-held children that no gateway re-attaches (old gateway instances, blue-green), (b) after a `_`→session **Rebind**, the close-time SSH `signal KILL` is routed by the node to the channel's *original* slot, which no longer exists, so the kill is a no-op, (c) grandchildren (`codex app-server`, `claude`) orphaned to PPID 1 when the adapter dies (3 such on this host). Chosen chain: per-launch env marker `OCEANLEO_ACP_OWNER=acp1.<program>.<computer>.<gateway>.<nonce>` + launch shell runs the adapter as a child (no `exec`) and, when it ends, SIGKILLs every other process carrying the same marker (excluding `$$`/`$PPID`) and exits with the adapter's code; gateway-side marker reap on close; orphan sweep on program start. Results: A stdin EOF (node pipe closed) → exit 3 kept, same-group grandchild **gone**, setsid-escaped grandchild **gone**; B same through the sudo operator wrapper (`operator.Wrap` shape) → exit 3, both **gone**; C node group KILL leaves the escaped grandchild alive → `owner_scan_command` finds exactly its marker → `reap_command` → **gone**; D no marker → nothing else killed; E missing binary → **127** kept (start-failure classification intact). P1b `/tmp/w2-proof/eof_proof.py`: installed `claude-agent-acp` and `codex-acp` both exit 0 on stdin EOF with 0 processes left.
- **OS coverage:** the exec bridge node is Linux-only (`oceanleo-node` Makefile builds linux amd64/arm64; `node_upgrade.platform_slug` rejects others). macOS/Windows machines are not reached through this launcher (they use the OceanLeo client), so no per-OS variant is needed. Cleanup/scan/reap use `/proc` and are no-ops where `/proc` is absent.
- **P2 token (`/tmp/w2-proof/token_env_proof.py`, FAKE token, 127.0.0.1 listener, temp HOME).** literal header: 1 process with the token on argv, MCP request `Bearer <FAKE>`. Placeholder `Bearer ${OCEANLEO_MCP_TOKEN}` + `session/new _meta.claudeCode.options.env={OCEANLEO_MCP_TOKEN: <FAKE>}`: **0** processes with the token on argv (argv carries only the placeholder), MCP requests still arrive with `Authorization: Bearer <FAKE>` (2/2). Adapter source confirms `env = {...process.env, ...options.env}` (claude-agent-acp 0.90.0). Live host check (counts only): 4 current `claude` children of the operator's adapter still show `olk_` on argv (started before this fix; they end with that process).
- **Codex / Cursor:** not leaking. codex-acp passes MCP config to `codex app-server` over its JSON-RPC session config (spawn args fixed); cursor-agent handles `mcpServers` in-process. Live `ps`: no `olk_` on any codex/cursor argv. CLI-tools path (`cli_tools.py`) writes tokens to config files and passes them to the helper on stdin, not argv. Only claude is rewritten.
- **My Tasks (read-only checks against the shared DB):** PostgREST accepts the quoted `or=(site_id.eq."…",mode.eq.computer)` group (also with a hostile `de"si,gn)` value). For the one owner with computer tasks: 9 of 9 `mode='computer'` rows (all `site_id=''`) now list for `site_id=oceanleo` **and** `site_id=design`.

### What changed
1. **My Tasks** — `app/agent/task_repository.py`: a site filter becomes `or=(site_id.eq."<site>",mode.eq.computer)` (value always quoted/escaped; ANDed with owner/project/surface). Orphan/shell filters in `query_service.py` unchanged (computer rows already bypass the output lookup). **Migration `migrations/0307_computer_task_site.sql`**: `create or replace computer_task_create` (one live definition: 0304's was replaced by 0306 with the same signature, so "both" = this one) — the 0306 body with only `site_id='oceanleo'` added to the insert; signature/security definer/search_path/grants unchanged; backfill `update public.agent_tasks set site_id='oceanleo' where mode='computer' and site_id='';` (idempotent, touches no non-computer row, leaves `updated_at` so ordering is unchanged; no `agent_tasks` update trigger fires on `site_id`).
2. **Dialog latency** — `agent_dialog.py`: per-socket lanes. `occupancy` is answered inline at once (in-memory). `status` / `sessions` / `models` each run in their own lane per kind+program (same-kind answers keep request order; they never block occupancy, prompts or control messages). The initial status probe also moved to the background. All other control messages keep one FIFO lane in arrival order, and `prompt`/`install`/`login`/`set_*`/`session_path` start only after every control message received before them has finished (old semantics), then run detached. Per-socket 60 s cache (`CONN_CACHE_S`): machine settings, verified MCP token, shell-scope row, managed-session validation row (each prompt is still checked against owner/computer/program/native id). `resolve_cwd` only when attachments are present. Prompt path: validate (cached) → session (spare/new/load) → in-memory bind (`task_sessions.bind_local`, durable `computer_task_bind` queued first in the archive) → prefs (unchanged config values skipped) → user_message/turn_start → **prompt**. Attaching an *existing* native session to a not-yet-bound managed session keeps the synchronous storage-checked `bind_managed`. `adopt_and_rebind` stays before the prompt (keeps one-process-per-session semantics).
3. **Prewarm** — `models` with a remembered catalog now answers from the cache first and then still starts the agent and creates the spare session (the W4 request; earlier it returned without starting). A prompt arriving during that warm-up waits for it and takes the spare instead of opening a second session (`proc.spare_inflight`).
4. **Archive after broadcast** — `registry.broadcast` queues the archive synchronously (production order) and sends to viewers without waiting for storage; `task_sessions` has one ordered queue per managed session (bind → frames → run-state changes) drained by one worker. user/done/error flush immediately; deltas coalesce (0.5 s / 32 KiB). A failed write keeps its item and the same idempotent batch id and retries with backoff (0.5 s … 30 s) until saved: no drop, no duplicate. `archive_status` frames come from the worker. `stop_background` drains queues before the final flush. **Contract change to flag:** the old invariant "user message durably saved before the prompt is dispatched" (`test_user_archive_failure_blocks_dispatch_before_native_prompt`) is replaced, as the book requires, by "prompt first, user frame queued and retried until saved"; the test was rewritten accordingly.
5. **ACP lifecycle** — `acp/launch.py` (wrapper, marker, `owner_scan_command`, `reap_command`), new `acp/reaper.py`, hooks in `acp/session.py` / `acp/registry.py`. On close/idle/crash/start-failure (`shutdown`/`kill_nowait`, not on transport release) the gateway runs a marker reap for that launch through the bridge; a re-attached tree with unknown marker is killed by attaching (attach-only) to its **current** slot and sending `KILL` there. Orphan sweep runs after a fresh start of a program on a computer (≤ once per 10 min per computer+program). Never reaped: unmarked processes (all existing leftovers incl. the parent's live session — the parent's one-time cleanup still applies), trees this gateway holds/is starting, trees it detached from < 30 min ago, trees < 2 min old; trees from another gateway instance only after this gateway has run 30 min and only while it holds no re-attached tree of that program on that computer. Assumption: one gateway drives a node at a time (true for the tunnel design).
6. **Token off argv** — `acp/session.py` `mcp_session_params`: for claude only, `Authorization: Bearer <tok>` → `Bearer ${OCEANLEO_MCP_TOKEN}` plus `_meta.claudeCode.options.env` on `session/new` and `session/load`.

### Exact prewarm frame for W4
On the computer's agent-dialog socket (`agentDialogWsUrl(computerId, "", token)`, i.e. server scope — the same scope the later prompt uses), as soon as it is open and the program is known:
```json
{"t": "models", "program": "<claude|codex|cursor|hermes>"}
```
Replies: `models` + `config` with `acp_session: ""` (cached catalog immediately when known); meanwhile the agent process starts and a spare ACP session is created. The first `{"t":"prompt","program":…,"ref":…,"text":…}` (no `acp_session`, with or without `task_session_id`) on that scope takes the spare. Sending `models` again is harmless (reuses the live process). The existing controller already sends it on socket open (`useAgentDialogController.tsx:575`), which now always prewarms.

### Files changed (backend repo `/root/projects/oceanleo/backend`)
- `app/agent/task_repository.py`
- `app/cloud_computer/agent_dialog.py`, `app/cloud_computer/task_sessions.py`
- `app/cloud_computer/acp/launch.py`, `app/cloud_computer/acp/session.py`, `app/cloud_computer/acp/registry.py`, **new** `app/cloud_computer/acp/reaper.py`
- **new** `migrations/0307_computer_task_site.sql`
- tests: **new** `tests/test_computer_tasks_every_site.py`, **new** `tests/test_w2_acp_lifecycle.py`; updated `tests/test_cc_acp_launch.py`, `tests/test_agent_dialog.py`, `tests/test_cc_dialog_v2.py`, `tests/test_cc_dialog_sessions.py`, `tests/test_computer_task_sessions.py`, and the shared fakes in `tests/test_project_work_privacy.py` / `tests/test_task_created_by_leo.py` (taught the new `or_` group).

### Tests (host venv `backend/.venv/bin/python -m pytest`; pytest is not installed in the `oceanleo-api` container, so the contract's `docker exec … pytest` cannot run there)
- `tests/test_computer_tasks_every_site.py` 7 passed (computer task with any site_id listed for another site; or-group composes; hostile site value; shell still hidden; migration SQL review).
- `tests/test_w2_acp_lifecycle.py` 24 passed (launch wrapper with real processes, scan/reap, reaper decisions, close kill incl. re-attached slot kill, token placeholder/env, occupancy/prompt never wait for sessions/models, control-lane order, same-kind order, validation-before-prompt + bind-after + per-socket cache, spare taken during warm-up, viewers get frames while storage is stuck, archive complete+ordered, user/done/error immediate flush, outage retry without duplicates).
- Every `tests/test_cc_*.py`, `tests/test_agent_dialog*.py`, `tests/test_computer_task_sessions.py`, `tests/test_cloud_computer_*.py` and all task-list tests: green except **3 pre-existing failures that fail identically on a clean `git archive HEAD` copy**: `test_cc_run_headless::test_cancelled_turn_is_not_listed_as_busy`, `test_task_created_by_leo::test_other_values_and_old_rows_are_blank`, `test_task_created_by_leo::test_shell_shows_without_agent_output`.

### Requests
- Parent: apply `0307_computer_task_site.sql` at integration (the read-side fix already lists computer tasks without it).
- Parent: decide on the replaced "user message saved before dispatch" invariant (item 4) if the operator wants it kept; reverting is local to `_prompt_body`/`task_sessions`.
- Parent one-time cleanup: the current leftovers are unmarked, so the new reaper will never touch them by design.
- Optional, not authorized here: a node-side fix (`oceanleo-node` `Signal` should follow `Rebind`) would make the plain channel kill land too; the gateway now covers it without a node release.

### New user-visible strings
None.

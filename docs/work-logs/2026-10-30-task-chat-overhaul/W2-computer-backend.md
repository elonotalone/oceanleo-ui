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

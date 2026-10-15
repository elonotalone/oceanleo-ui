# SESSIONS — 2026-10-15

## Scope and ownership

Executed only the SESSIONS section of tasks.md on main, after workstation bootstrap and reading the OceanLeo code map/pack. Read the supplied Claude transcript's relevant session-history messages and the F-dialog-loading / F-gateway-sessions-bg journals. No grandchildren, commits, staging, pushes, installs, version changes, global CSS generation, services, browser, or screenshots. Parent owns typecheck, integration, generated output, development-slot freshness and deployment; did not duplicate parent's running typecheck.

Changed initially clean controller; added adjacent helper and two new tests:

- src/shell/cloud-computer/agent-dialog/useAgentDialogController.tsx
- src/shell/cloud-computer/agent-dialog/session-refresh.ts
- tests/cloud-computer-session-refresh.test.mjs
- tests/cloud-computer-session-refresh-controller.test.mjs

Initially dirty cloud-computer-agent-dialog.test.mjs, reduce.ts, Composer.tsx and MessageList.tsx were read-only. Backend was read-only. This report is the only documentation written by SESSIONS.

## Findings and resulting behavior

Previously all session-list callers independently sent frames: connection, program switch, manual refresh, turn/session events, focus, visibility and a fixed 15-second interval. There was no shared in-flight guard. Scoped dialogs also skipped the initial list request and program-switch request whenever sessionId existed.

All list sends now pass through one per-controller, per-program coordinator. Only one list request per program can remain outstanding; bursts of turn/session events merge into one trailing refresh after the reply, with a one-second minimum send interval. Focus/visibility bursts reuse an outstanding request without scheduling redundant trailing work. Replies from different programs do not release each other's requests.

Unchanged successful lists back off from 15 to 30 to 60 seconds. Changed session rows, active session or busy-session membership restore the 15-second cadence. Idle steady-state network requests fall from four to one per minute. The inexpensive foreground timer still checks every 15 seconds. Hidden tabs stop that timer and queued refreshes; inactive/disabled views suppress event-triggered sends too. Focus, visibility return and reactivation refresh immediately subject to outstanding-request and one-second burst guards. Socket reconnect resets the coordinator and fetches the current program's history, including scoped dialogs. Program switches fetch the new program's history; REST OceanLeo does not poll socket history, and switching to locally installed OceanLeo does.

The current gateway uses supported:false both for unsupported APIs and some transient startup/list failures (agent_dialog.py:_sessions_failed). This cannot be treated as permanent opt-out: the client backs off to 60 seconds and continues automatic recovery.

## Protocol boundary for parent / F-gateway-sessions-bg

Session-list frames carry no request ID or cancellation acknowledgement. A client timeout cannot safely release an outstanding request: it could overlap real server work and accept an old reply as the new request's reply. Therefore pending is released only by a sessions response or connection reset, including reconnect/disable/unmount. A 120-second slow-response test verifies that even manual/periodic requests do not overlap.

If the gateway silently drops a sessions request while leaving the socket open forever, that program remains pending until reconnect. Existing _sessions sends a sessions frame in its ordinary success/error branches; _sessions_failed currently emits cached rows with supported=bool(cached_rows). Ensuring a bounded terminal response and distinguishing transient failure from unsupported is gateway/loading-owner work, outside this task. Did not invent a timeout retry that would hide that protocol defect, close a socket carrying a live turn, or edit backend/reducer/loading behavior.

The guard applies per hook instance; multiple independent dialogs can still request the same program. Server-wide coalescing and nonblocking sessions dispatch belong to F-gateway-sessions-bg. Its journal currently only records investigation start, so no completed gateway change was assumed.

## Verification

All commands executed from /root/projects/oceanleo-ui, directly with node (no pnpm). Focused checks used the light I/O guard.

Final combined command:

```sh
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test --test-timeout=30000 tests/cloud-computer-session-refresh.test.mjs tests/cloud-computer-session-refresh-controller.test.mjs tests/cloud-computer-agent-dialog.test.mjs
```

The new scheduler suite has six behavioral tests: in-flight/event coalescing, 15/30/60-second cadence, hidden/inactive suppression and wake, focus burst coalescing, slow-response/reconnect/transient-failure handling, and program isolation. The new React controller integration test uses jsdom and a fake socket (no browser), covering scoped history load, actual reducer list updates, visibility, active transitions, turn/completion trailing requests, reconnect with pending work, REST/local OceanLeo, program switches and disabled cleanup. The existing dialog file is exercised unchanged as a ten-test regression suite.

During test development the controller test initially assumed dynamic authentication import had settled after a fixed number of microtask/event-loop turns; this was flaky. Replaced that assumption with a bounded condition wait on the actual socket open/list frame. No product condition or assertion was weakened.

Final combined result: exit 0; 17 tests passed, 0 failed, 0 skipped (5.646 seconds). `git diff --check -- src/shell/cloud-computer/agent-dialog/useAgentDialogController.tsx` passed. All five promised files exist and are nonempty. No claim of browser, typecheck or development-slot acceptance is made by this child.

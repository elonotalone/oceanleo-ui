# VU — actual rendered CN browser acceptance

2026-10-24. Operator explicitly authorized isolated browser automation and sanitized screenshots for this task. Scope is the shared settings/chat UI; extension execution belongs to VB.

Runner: `tests/local-browser-real-ui.mjs`, invoked via absolute `agent-io-guard.sh run-heavy -- node tests/local-browser-real-ui.mjs`. It discovers the current ready CN LeoDev URL from the local controller instead of pinning an expiring preview address. Authentication comes from the existing local development identity helper, retained in memory and an isolated browser context only; no auth, cookie, pairing code or device credential is logged or committed.

## Actual rendered coverage

Verified in installed Chromium 1228 via Playwright-core, using the live development UI and real CN gateway:

- Settings route mounts authenticated My Browser with the correct CN development gateway and page-content disclosure.
- Rendered extension-download button returns a ZIP with its actual PK signature.
- Pairing creation returns a real code; clipboard copy matches that code. The expiry date is visible. Advancing the isolated browser clock eleven minutes clears the visible code and disables copy; this validates UI expiry only, not a substitute for server-TTL tests.
- Unique temporary device pairing and pending-consent session fixture; actual preferred-device and fallback controls persist through the real API.
- Session activity is rendered; takeover and stop update server state and show the explicit extension-synchronization notice.

- Actual heartbeat expiry after the 60-second server online window shows offline state and explicit no-cloud-fallback guidance.
- Rendered revocation affects only the temporary device. A browser-network failure injection causes a visible recoverable error and removes stale online controls; removing the fault and clicking refresh recovers through the real endpoint.
- Actual composer plugin button opens the native My Browser entry; clicking it opens the same settings panel. No uncaught page JavaScript errors in the successful chat/navigation run.

The settings/device run passed nine functional checkpoints through endpoint recovery. Its final chat step initially clicked the server-rendered button before React attached its handler. A separate `--chat-only` run waits for hydration and passed navigation plus zero-JavaScript-error checks. No completed stateful flow was repeated after isolating this issue. The runner retains this targeted mode and the corrected hydration wait; no product edit was required. Both final runs confirmed browser closure and exact preference/device preservation.

## Cleanup and evidence

The runner closes its isolated browser before restoring preferences, revokes only its own temporary device, and verifies preexisting device revocation state unchanged. Original operator preferences at the start of this acceptance were `preferred_device_id=null, allow_cross_browser_tasks=false`; these were explicitly restored after the first harness synchronization failure. Later runs verify the same baseline.

Sanitized screenshot directory: `/tmp/local-browser-ui-evidence/`. Device/session list text and input contents are masked; no raw pairing-code screenshot is taken. Screenshots are local evidence, not committed product assets.

Early harness attempts assumed async controlled checkbox/notice updates would be visible immediately after the server write. They were corrected to await the real response and rendered state. An early cleanup initially raced an in-flight UI save; browser-first cleanup and explicit preference restoration corrected this. The runner accepts `VU_RESTORE_PREFERENCES` only for restoring a known prior baseline after interruption; the acceptance baseline was restored to null/false and checked after subsequent runs. No product bug has been confirmed by these harness failures. No product file, extension file, production endpoint or existing device/session was edited.

Evidence: `settings-sanitized.png` (settings/onboarding, inputs and lists masked), `chat-entry-sanitized.png` (actual native browser entry, connector list masked), under `/tmp/local-browser-ui-evidence/`. These validate the rendered shared UI, not extension installation, local execution, or permission prompts; VB owns those checks. Chrome binary reports Chrome for Testing 149.0.7827.55 (Playwright cache build1228); Edge was not separately launched.

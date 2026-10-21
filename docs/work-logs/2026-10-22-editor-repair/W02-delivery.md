# W02 delivery — shared editor save

Date: 2026-10-22

## Changes

- `src/shell/advanced-routes/RichDocHostedRoute.tsx`: item-scoped iframe/protocol instance identity. Late native Umo responses from a previous item retain the old instance and are rejected by the existing exact postMessage gate; ordinary mode changes preserve the same item's instance. The item-scope guard also blocks callbacks in the render/effect-cleanup interval.
- `tests/e9-richdoc-harness.mjs`: signs simulated host events with the instance parsed from the current iframe URL.
- `tests/e9-hosted-draft-runtime.test.mjs`: regression proving late native A save rejection, positive B native save persistence, and same-item mode continuity. Prior test/route commits cover host save correlation, explicit failures, retries, stale revisions, dirty recapture, no-overlap, switch/unmount cancellation, origin/source/protocol/instance rejection, and cache ABA isolation.
- W02 state/journal record the original storage acceptance scope and the two separate route-level ABA reproductions. No operator artifact was overwritten; parent verified durable receipt + reopen against an isolated synthetic DOCX.

## Verification

- `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/e9-hosted-draft-runtime.test.mjs` — 14/14 pass.
- V01 independent native stale/current response repro — pass: A's old instance caused no save result/persistence; B's current native request returned `ok:true`, and only B's content was persisted under B.
- `oceanleo-security-gate.sh` after the final route change — UI/embed/origin checks pass; backend UC-5 RLS/quota and live security-definer grant-surface assertions remain red as on baseline. Final gate result is pending.
- Parent's isolated durable storage acceptance (commit `ff0541dd`) — native DOCX and manifest reread with expected text/bold 28px, new same-root head, same-request idempotency, distinct stale expected-head 409. It used private machine HTTP create/download plus an in-process revision write with verified owner identity; this is not browser-auth end-to-end. The original screenshot's cause remains unconfirmed because the historical API log shows no save request reached the gateway.

## Remaining limits

- No browser/production request or deploy was made.
- The route harness is a runtime component harness, not a browser/iframe automation test. V01 independently exercised the exact late-message route behavior.
- Historical evidence supports a pre-network failure, but does not prove either reproduced race was the screenshot's actual trigger.
- The shared typecheck and final server/API checks are parent-owned.

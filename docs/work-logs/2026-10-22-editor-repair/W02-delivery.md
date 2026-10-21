# W02 delivery — shared editor save

Date: 2026-10-22

## Changes

- `src/shell/advanced-routes/RichDocHostedRoute.tsx`: item-scoped iframe/protocol instance identity. Late native Umo responses from a previous item retain the old instance and are rejected by the existing exact postMessage gate; ordinary mode changes preserve the same item's instance. The item-scope guard also blocks callbacks in the render/effect-cleanup interval.
- `src/shell/advanced-routes/RichDocHostedRoute.tsx`: a cached snapshot for the exact current item/generation may finish a durable write after unmount, and an already-committed clean generation may return its stored receipt. Detached/missing/stale cache fails without a new iframe capture; state updates and postMessages are skipped after unmount.
- `tests/e9-richdoc-harness.mjs`: signs simulated host events with the instance parsed from the current iframe URL.
- `tests/e9-hosted-draft-runtime.test.mjs`: regression proving late native A save rejection, positive B native save persistence, and same-item mode continuity. Prior test/route commits cover host save correlation, explicit failures, retries, stale revisions, dirty recapture, no-overlap, switch/unmount cancellation, origin/source/protocol/instance rejection, and cache ABA isolation.
- `tests/e7-other-richdoc-unmount.test.mjs`: local host-ready handshake, confirmed cached and clean receipt behavior after unmount, no-capture negative control, and bounded latest-generation concurrent save expectation.
- W02 state/journal record the original storage acceptance scope and the two separate route-level ABA reproductions. No operator artifact was overwritten; parent verified durable receipt + reopen against an isolated synthetic DOCX.

## Verification

- `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/e9-hosted-draft-runtime.test.mjs` — 14/14 pass.
- `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/e7-other-richdoc-unmount.test.mjs` — 6/6 pass.
- V01 independent native stale/current response repro — pass: A's old instance caused no save result/persistence; B's current native request returned `ok:true`, and only B's content was persisted under B.
- `oceanleo-security-gate.sh` after the final route change — 23 pass, 2 fail, 1 skip. OceanLeo UI sandbox/origin and embed checks passed; the same backend UC-5 RLS/quota and live security-definer grant-surface assertions remain red as on baseline. The `oceanleo.app` apex-cookie check was skipped because DNS resolution failed.
- Parent's isolated durable storage acceptance (commit `ff0541dd`) — native DOCX and manifest reread with expected text/bold 28px, new same-root head, same-request idempotency, distinct stale expected-head 409. It used private machine HTTP create/download plus an in-process revision write with verified owner identity; this is not browser-auth end-to-end. The original screenshot's cause remains unconfirmed because the historical API log shows no save request reached the gateway.

## Remaining limits

- No browser/production request or deploy was made.
- The route harness is a runtime component harness, not a browser/iframe automation test. V01 independently exercised the exact late-message route behavior.
- Historical evidence supports a pre-network failure, but does not prove either reproduced race was the screenshot's actual trigger.
- The shared typecheck and final server/API checks are parent-owned.

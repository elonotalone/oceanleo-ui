# W13 delivery - security / embed tests after the shell-iframe removal

## Commits
- 537c87c7 drop PDF sandbox exemption; retarget embedded-protocol-v8 and untrusted-content-sandbox-origin tests
- 038b901d family-embed-origin / embed-host-identity retargeted; website-editor-w11 deleted
- 85f02ba8 w2-editor-save-contract A13 removed
- a9d56e91 UC citation on untrusted-content-pdf-frame-host test (gate "security assertions cite their rule")
- (this delivery)

## Source changes
- `src/shell/editor-sandbox-origin.ts`: removed `PDF_FRAME_SANDBOX_EXEMPTION` (nothing frames PDFs any more). All other exports kept (all still used by live code).
- `src/shell/AttachmentStrip.tsx`: stale comment rewritten (no reference to the exemption / host-whitelist PDF viewer).
- `src/shell/editor-protocol.ts` and friends: NOT deleted. It is re-exported by the public barrel `src/shell/index.ts` (`export * from "./editor-protocol"`) and `hosted-editor/index.ts` still builds on it; `tests/editor-protocol.test.mjs` covers it. `acceptEditorFrameMessage` / `isValidEditorTargetOrigin` / `buildEditorEmbedUrl` / `applyFamilyEmbedOriginOverride` have no live src caller left, but removing them needs a barrel edit (parent).

## Test changes (per deleted case, why)
- embedded-protocol-v8: removed the `source("workbench-embed.tsx"/"use-embed-editor-messages.ts")` regex assertions in 6 tests (history-changed handler, onProtocolReset, chrome:"host"/set-mode, recovery ready-gate, severity/aria-live status UI, event.source/origin + sent*Ref bookkeeping) and the whole last test "selection and project failures become host-visible errors". All asserted source text of the deleted embed pane/hook. Pure protocol validation (round-trip, fail-closed, origin trust, idempotency keys) kept: 7/7 pass.
- untrusted-content-sandbox-origin: W8/1 no longer lists workbench-embed.tsx (deleted iframe) or the PDF exemption; replaced by an assertion that `PDF_FRAME_SANDBOX_EXEMPTION` is gone from editor-sandbox-origin.ts and the other surfaces keep exact iframe count / sandbox expression / zero exemptions. W8/3 targetOrigin test: dropped workbench-embed posts/guards counts; the "no postMessage(..., '*')" check is retargeted from 3 files to a scan of every non-comment line under `src/` (stricter). W8/3 protocol closed-set: dropped the check that the deleted hook calls `acceptEditorFrameMessage`; the closed-set + fail-closed whitelist checks in editor-protocol.ts stay. R8: dropped workbench-embed/workbench-embed-base source regexes; override/allowlist behaviour assertions stay. W24/3 pdf-exemption check now asserts no `sandbox-exempt` text. Kept the reviewed W6 working-tree edits (cover exemptions 0, `"allow-scripts"` literal, exemption count 0). 17/17 pass.
- family-embed-origin: "applies override after allowlist" test (read deleted workbench-embed*.tsx) reduced to the still-valid "workbench-routes.ts hard-codes no embed base" check. 13/13.
- embed-host-identity-source-validation: removed 4 video-open and 1 website-embed tests and the import of deleted `website-embed-params.ts` (they tested `buildOpenAssetPayload` / `websiteEmbedExtraParams`, the open-asset payload to the removed iframe editors; local editors do not cross that boundary). Design composite source validation tests kept. 2/2.
- website-editor-w11.test.mjs: deleted entirely (every case targeted `website-embed-params.ts` / workbench-embed sender, both deleted; Website now uses WebsiteLocalRoute).
- w2-editor-save-contract: removed A13 (regexes over deleted use-embed-editor-messages.ts). 25/25.
- untrusted-content-pdf-frame-host: comment-only UC-3 citation. 4/4.

## Verification
- `node ... --test tests/<file>` for: embedded-protocol-v8, untrusted-content-sandbox-origin, family-embed-origin, embed-host-identity-source-validation, w2-editor-save-contract, untrusted-content-pdf-frame-host: all pass.
- `run-heavy -- npx tsc --noEmit -p .`: no errors printed (clean).
- `bash /opt/cursor-workspaces/oceandino/scripts/oceanleo-security-gate.sh` (before my UC-citation commit): 24 pass, 1 skip, 2 fail:
  1. "security assertions cite their rule": only oceanleo-ui item was `untrusted-content-pdf-frame-host.test.mjs:55` - fixed in a9d56e91. Remaining items are other repos / other owners' tests, pre-existing and not mine: oceanleo/tests/game-runtime, project-index-membership, oceanleo-ui/tests/agent-replay-render, game-core-swap, local-task-device-bridge-w7, talent-handoff-client, website-source-carrier, website/front/tests/site-patch (the gate's FAIL line named only the pdf-frame-host case as new).
  2. "cross-repo render surface scan": no new findings; ONE allowlist drift left: `oceanleo-untrusted-render-allowlist.json` entry UC-3-IFRAME-DYNAMIC-SANDBOX `oceanleo-ui/src/shell/workbench-embed.tsx` (0 hits, file deleted). Parent's commit 3480f9ebf missed this entry. It is in the oceandino repo; I did not edit it. Fix: delete that entry.

## Cross-owner requests
- Parent: delete the stale allowlist entry above (oceandino); decide whether to remove now-callerless exports from `editor-protocol.ts` (needs barrel edit + `npm run api:check`).
- Parent / owners of the other repos: the remaining UC-citation misses listed above (not in W13 scope).

## Limitations
- Gate re-run after the final commit was started in the background; result not captured by this report beyond the above (expected: only the allowlist drift and the pre-existing other-repo citations).

# Broad Node-only sweep

Run: 897 test files, explicit four real-browser file exclusions; no browser UI acceptance. Standard assert-dom-guard/strip-types/ts-extension-loader, concurrency2, timeout180000, heavy IO guard. Forced actual video source enabled.

Result: 7380 tests, 7238 passed, 141 failed, 1 skipped, 0 cancelled; 915104.951151ms. This is NOT green. The sweep began after UI895ae82c and continued while later named failures were triaged/corrected (1917050e and08084055); it is not an atomic final-HEAD rerun. Corrected cases have independent final focused proofs in P-verification.md.

Known introduced issues corrected: same-revision stale dirty blocked draft-tier admission; original optional handoff compatibility after extraction; safe cached RichDoc save after unmount; obsolete exact workflow memo-dependency expectation. Independent V01 baseline triage records which remaining failures are proven pre-existing; untriaged failures are not silently labelled baseline.

Subsequent final bounded integration run:147/147, zero skips, with the exact actual video source enabled. Parent also corrected the newly reproduced own-durable-receipt pin adoption close barrier (real Inline6/6, independent V01 repeated) and made the native Stage test use the real first-party URL predicate so its four runtime cases register. P4's local readiness fixture now awaits real init/source handshake rather than injecting dirty while no source exists. Relevant semantic chrome/Mammoth/per-artifact fixture acceptance is still being finalized. None of these later results rewrites the historical broad-run141 count or claims all remaining failures are baseline.

Final superseding bounded result: **196/196, zero skips**,34 test files on frozen final product code. Includes semantic chrome, strict per-artifact Library8/8 and the separately discovered native RichDoc synthetic-permission-update fix (`35c41e6d`). No-step Tiptap editability notifications no longer authorize a write; genuine root/appended content edits still do. Parent and V01 independently pass strict untouched-open zero writes, exactly one accepted revision, exact source bytes/Task snapshot/reopen/stale replies. This final bounded result does not alter the historical full sweep's failures or claim a green all-repository regression.

## Failed test files reported by the broad run

- `tests/W3-r3-library-receiver-collab-triggers.test.mjs`
- `tests/artifact-surface-rendered.test.mjs`
- `tests/audio-editor-v8.test.mjs`
- `tests/auth-captcha.test.mjs`
- `tests/bay-listing-sections.test.mjs`
- `tests/bay-needs-accept-not-open.test.mjs`
- `tests/bay-needs-demand-pane.test.mjs`
- `tests/bay-needs-help.test.mjs`
- `tests/bay-shell-feed.test.mjs`
- `tests/bay-shell-hooks.test.mjs`
- `tests/bay5-panel.test.mjs`
- `tests/ccp-w3-message-list.test.mjs`
- `tests/client-ui-library-local-build.test.mjs`
- `tests/cloud-computer-page.test.mjs`
- `tests/collab-acceptance-convergence.test.mjs`
- `tests/collab-game-readonly.test.mjs`
- `tests/collab-pdf-readonly.test.mjs`
- `tests/collab-richdoc-review.test.mjs`
- `tests/collab-workflow-readonly.test.mjs`
- `tests/creations-client.test.mjs`
- `tests/cross-site-library.test.mjs`
- `tests/d25-office-prewarm.test.mjs`
- `tests/d25-viewer-effects.test.mjs`
- `tests/d4-design-handshake-origin.test.mjs`
- `tests/d4-inline-shell-page-feedback.test.mjs`
- `tests/deck-delivery-family.test.mjs`
- `tests/deck-html-action.test.mjs`
- `tests/devices-page-cloud-section.test.mjs`
- `tests/e2-result-canvas-stability.test.mjs`
- `tests/e2-right-pane-claims.test.mjs`
- `tests/e6-draft-hook-runtime.test.mjs`
- `tests/e7-other-richdoc-unmount.test.mjs`
- `tests/e9-draft-safety.test.mjs`
- `tests/eas-w04-leo-one-instance.test.mjs`
- `tests/eas-w04-leo-outdated-gateway.test.mjs`
- `tests/eas-w13-right-maximize.test.mjs`
- `tests/eas-w14-leave-nonblocking.test.mjs`
- `tests/editor-core-flags-and-mode.test.mjs`
- `tests/editor-repair-acceptance-chat-layout.test.mjs`
- `tests/editor-repair-acceptance-chrome.test.mjs`
- `tests/editor-repair-acceptance-edit-bar.test.mjs`
- `tests/effect-tt-dependency.test.mjs`
- `tests/explore-page-header.test.mjs`
- `tests/explore-plain-shelf.test.mjs`
- `tests/explore-scene-axis.test.mjs`
- `tests/explore-sections.test.mjs`
- `tests/focus-ring-budget.test.mjs`
- `tests/g1-wave-tap-targets.test.mjs`
- `tests/g2-selection-toolbar-render.test.mjs`
- `tests/g3-portal-typed-editor.test.mjs`
- `tests/g3-website-material-restore.test.mjs`
- `tests/game-core-swap.test.mjs`
- `tests/gateway-fetch-credentials.test.mjs`
- `tests/grid-document-actions.test.mjs`
- `tests/grid-univer-agent-review-gate.test.mjs`
- `tests/hit-target-budget.test.mjs`
- `tests/i18n-key-collision.test.mjs`
- `tests/i18n-tt-key-coverage.test.mjs`
- `tests/im-acceptance-static.test.mjs`
- `tests/im-conversation-store.test.mjs`
- `tests/im-nav-entry.test.mjs`
- `tests/im-team-invite.test.mjs`
- `tests/image-edge-snapping.test.mjs`
- `tests/image-route-merge.test.mjs`
- `tests/install-done-and-dialog-start-notice.test.mjs`
- `tests/leo-entry-button.test.mjs`
- `tests/leochat3-window.test.mjs`
- `tests/library-shared-split-runtime.test.mjs`
- `tests/lightweight-office-frontend.test.mjs`
- `tests/loopback-trust-source-set.test.mjs`
- `tests/mcp-apps-host.test.mjs`
- `tests/media-editors.test.mjs`
- `tests/motion-no-raw-duration.test.mjs`
- `tests/motion-token-adoption.test.mjs`
- `tests/motion-tokens.test.mjs`
- `tests/office-real-file-roundtrip.test.mjs`
- `tests/one-task-library-agent-acceptance.test.mjs`
- `tests/org-membership.test.mjs`
- `tests/p4-working-document.test.mjs`
- `tests/phone-bind.test.mjs`
- `tests/phone-viewport.test.mjs`
- `tests/plugin-module-hosting.test.mjs`
- `tests/project-history-scope.test.mjs`
- `tests/rendition-callback-identity.test.mjs`
- `tests/rich-doc-core-swap.test.mjs`
- `tests/route-context-editors.test.mjs`
- `tests/share-i18n-coverage.test.mjs`
- `tests/shared-package-release-lag.test.mjs`
- `tests/sidebar-v5-contract.test.mjs`
- `tests/table-driven-registration-guard.test.mjs`
- `tests/template-material-preview-key-shape.test.mjs`
- `tests/tpp-w3-thread.test.mjs`
- `tests/typed-artifact-contract.test.mjs`
- `tests/untrusted-content-pdf-frame-host.test.mjs`
- `tests/w1-material-edit-route.test.mjs`
- `tests/w10-video-canvas-local.test.mjs`
- `tests/w13-advanced-editor-resilience.test.mjs`
- `tests/w25-tests-out-of-repo-paths.test.mjs`
- `tests/workflow-native-stage-runtime.test.mjs`
- `tests/workflow-react-flow-only.test.mjs`
- `tests/workspace-fill-deeplink.test.mjs`
- `tests/workspace-render-stability.test.mjs`
- `tests/workspace-template-deeplink.test.mjs`

Original source material and private acceptance evidence boundaries are in P-verification.md. Product/twin distribution and browser automation remain unauthorized.

# Parent acceptance — 2026-10-24

Inspected the returned implementation and tests. One shared source component
changed; no provider authentication, secrets, runtime, billing, API, theme build
or consumer pin changed. User connection names remain intact. Dedicated Codex
proxy authorization remains browser OAuth; no device-code migration or claims of
being undetectable. No browser/visual automation was used.

## Independently reproduced

- Seven focused model suites under guarded Node with concurrency 2: 35 passed,
  zero failed (5.60 seconds), including real React selection, reorder, save and
  reload with custom BYOK plus unavailable alibaba_intl. Existing no-adapter,
  per-offer disabled checks and public helper behavior remain.
- Parent aligned two mock connection fixtures to current api_key auth_type
  (public OAuth was retired in the preceding task), then reran the model-group
  React suite: 6 passed, zero failed.
- Public API snapshot check passed, no API changes.
- LeoDev `/settings/ai-models` HTTP 200. Its actual shared model JS chunk HTTP
  200 contains none of data-model-byok-required, data-empty-cat-reason,
  data-empty-cap-reason, data-model-add-key or the removed custom billing label;
  guarded ordinary price nodes remain. This checks served code, not just disk.
- Dev-slot freshness: portal FRESH(dev), zero stale. Policy and whitespace checks
  passed. No production or oceanbizs distribution/publish performed.

## Broader-test boundary

Surrounding BYOK/reauth/settings/forms/popover/portal suite: 32 tests passed.
Two additional test files failed before any assertions: app-shell-model-visibility
and model-picker-workbench-open. Existing Node loader rejects directory import
`src/shell/messages/call/engine` from call/control/hooks.ts and call/ui/video-pool.ts
with ERR_UNSUPPORTED_DIR_IMPORT. No call-engine, AppShell or loader source was
changed here. Do not report this broader run as fully green or silently expand
this model-page cleanup into unrelated call-engine work.

Final guarded `pnpm typecheck` completed with exit 0. The shared UI changes are
accepted on LeoDev; unrelated untracked editor/Bay evidence is preserved.

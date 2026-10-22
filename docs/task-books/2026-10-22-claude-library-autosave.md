# Library automatic save — owner `claude_autosave_1022`

Parent: Claude Code session continuing two Codex sessions that died on quota
(operator 2026-10-22). Model: Claude Sonnet 5.5, medium effort, no fast mode —
operator's explicit choice. Parent owns integration, full typecheck, dev
gateway refresh and every commit. Do not commit, push, install, rebuild,
deploy, or use a browser. Main-only shared worktree: other owners edit other
files in this repo at the same time; never `git checkout`/`stash`/`reset`, never
revert a file you do not own.

Read first: `/opt/cursor-workspaces/oceandino/AGENTS.md`,
`/root/.oceanleo-workstation/INSTRUCTIONS.md`, pack
`/root/.cursor/rules/oceanleo.mdc`; run
`bash /opt/cursor-workspaces/oceandino/scripts/agent-bootstrap.sh`.
Then read the previous owner's book
`docs/task-books/2026-10-22-library-stability-autosave.md` (same scope; its
facts and test plan still apply) — this file supersedes it where they differ.

## Operator report (authoritative)

1. A tiny edit in a Umo (rich document) file keeps the autosave cloud icon
   yellow for ~10 seconds. This was "fixed" before and is still wrong — check
   it hardest. Either saving is too slow or the status shows "saving" far
   longer than the real save.
2. A global bottom-right toast `1 changes still not saved` with a Retry button
   appears (even on the Library grid). Operator: this copy must never appear;
   saving must be fully automatic; if it is not automatic, make it automatic —
   never make the user the fallback.
3. "If there is no problem just fix it; if there is a real product question,
   ask me" — the parent relays questions; only raise a genuine unresolved
   product choice.

## Known facts (verify, do not trust blindly)

- Measured by parent on the dev gateway: one tiny synthetic document commit
  spends ~4.5 s inside backend `save_revision` alone (excluding uploads and
  cover rendering); idempotent replay ~1.2 s; stale attempt 409 in ~2.4 s. A
  separate backend owner (`2026-10-22-claude-library-save-latency.md`) is
  reducing that. Your job is the client side and the status/retry truth.
- Controller default debounce 500 ms. Before the previous owner's patch,
  retries exhausted after 1.5/4/9 s (background 5/10/15 s), leaving a
  manual-only failed job → the toast (`src/shell/advanced-background-save-notice.ts`).
- Previous owner (interrupted, never ran tests after editing) already changed:
  - `src/shell/advanced-persistence-controller.ts`: auth/permission/invalid
    payload codes and messages now non-retryable; default `maxRetries` →
    `Infinity` (finite values still honoured for tests/callers); new
    `autosaveEligible` flag so hydration/open-only dirtiness is not reported
    as unconfirmed work.
  - `src/shell/advanced-draft-controller.ts`: same `autosaveEligible` gating;
    a server-restored draft counts as settled unless this visit has an exact
    user/local-recovery edit.
  Review these edits critically (keep, fix, or replace), then test them.

## Deliver

1. Characterize first with runtime tests (fake clock + injected save):
   (1) one tiny real edit → exactly one publish and a prompt saved state;
   (2) open/hydrate/close unchanged → zero writes;
   (3) a second edit during an in-flight save → latest content persisted, no
   lost edit; (4) transient failure(s) with the editor closed → automatic
   recovery, no click; (5) reopen / take-back does not switch source or
   duplicate a publication; (6) a genuine permanent failure stays truthful.
2. Status truth: "saving" (yellow) only while a real request is in flight or a
   debounce is pending; "saved" the moment the server confirms. No artificial
   minimum display time. Measure the client-side phases of a Umo save
   (`RichDocHostedRoute.tsx`, `richdoc-pro-source.ts`, `doc-editors/doc-io.ts`,
   draft tier vs version tier, cover/preview generation, uploads) with
   injected timings and find serial waits that can safely overlap or move off
   the critical path (e.g. cover/preview work that does not need to block the
   confirmed save). If the status waits for a slower "version" tier while a
   durable server-side draft is already confirmed, decide what "saved" truly
   means from the code and make the icon honest and fast. Record numbers.
3. Fully automatic recovery: transient failures retry with capped exponential
   backoff for as long as the page lives (no exhaustion into a manual-only
   state); retry immediately on `online` and when the tab becomes visible;
   the background saver keeps working after the editor closes; drafts are
   retained until the server confirms; never overwrite newer edits; no
   duplicate publications / 409 storms (keep CAS + idempotency).
4. No manual-retry UI for transient failures. Remove the
   `N changes still not saved` + Retry toast path. Permanent failures must
   still be truthful but actionable without a "Retry" crutch: e.g. session
   expired → say sign-in is needed and resume automatically after sign-in (find
   the existing auth state change hook); conflict / permission / integrity →
   clear Chinese copy saying what happened and that the draft is kept. Copy
   goes through the existing i18n (`tt()` / ui dictionaries); check whether
   dictionary coverage tests require entries.
5. Keep exported APIs compatible (`GameRoute.tsx`, PPT, sheet and other routes
   call these controllers; you do not own them — if a caller must change, tell
   the parent instead of editing it).

## Ownership

Own: `src/shell/advanced-persistence-controller.ts`,
`src/shell/advanced-draft-controller.ts`, `src/shell/use-advanced-autosave.ts`,
`src/shell/advanced-background-saver.ts`,
`src/shell/advanced-background-save-notice.ts`, direct draft/recovery helpers
(`src/shell/advanced-draft*.ts`), the Umo save path
(`src/shell/advanced-routes/RichDocHostedRoute.tsx`,
`src/shell/advanced-routes/richdoc-pro-source.ts`), the save-status
indicator component(s) and their i18n keys, new
`tests/library-automatic-save-1022.test.mjs`, and existing autosave /
background / controller tests.

Do not edit: `MyLibrary.tsx`, `WorkspaceLibrary.tsx`, `LibraryMasterDetail.tsx`,
`library-current-identity.ts`, thumbnail/cover/virtual-list files, anything
under `src/shell/game-editor/`, `GameRoute.tsx`, `material-detail-slot.tsx`,
`library-viewers.tsx`, `index.ts`, package manifests, generated CSS, any
other repository. If expansion is needed, say so in your result.

## Commands

Focused tests (≤4 files per run or the guard rejects it as heavy):

```
cd /root/projects/oceanleo-ui
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test --test-concurrency=2 <files>
```

Existing relevant tests include `tests/advanced-persistence-controller.test.mjs`,
`tests/W2-persistence-retry.test.mjs`, `tests/W2-20261021-user-edit-gate.test.mjs`,
`tests/e6-autosave-draft-tier.test.mjs`, `tests/advanced-autosave-hook-runtime.test.mjs`
and the richdoc harness tests (`rg -l 'RichDocHostedRoute|persistUmoPayload' tests`).
Find and run every test that imports a file you change. At the end you may run
one typecheck: `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- pnpm typecheck`
(other owners' in-progress files may show errors — report only yours).
No full suite.

## Result

Write `docs/task-books/2026-10-22-claude-library-autosave-result.md`: causes
found (with evidence), timing numbers before/after, every changed file,
exact commands with pass/fail counts, what remains uncertain, and any caller
change the parent must make. Your final message repeats the essentials.
Never claim completion because a toast is hidden.

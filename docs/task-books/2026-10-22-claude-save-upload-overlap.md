# Overlap the save uploads — owner `claude_upload_overlap_1022`

Parent: Claude Code session (operator 2026-10-22). Model: Claude Sonnet 5.5,
medium effort, no fast mode — operator's explicit choice. Parent owns
integration, typecheck and commits. Do not commit, push, install, deploy or use
a browser. Main-only shared worktree; never `git checkout`/`stash`/`reset`;
never revert files you do not own.

Read first: `/opt/cursor-workspaces/oceandino/AGENTS.md`,
`/root/.oceanleo-workstation/INSTRUCTIONS.md`, pack
`/root/.cursor/rules/oceanleo.mdc`; run
`bash /opt/cursor-workspaces/oceandino/scripts/agent-bootstrap.sh`. Context:
`docs/task-books/2026-10-22-claude-library-autosave-result.md` (cause 3).

## Why

Operator: a tiny Umo document edit keeps the autosave icon yellow ~10 s. The
backend commit was cut from ~4.5 s to ~2 s and the docx build / cover render
now start early (`src/shell/advanced-routes/richdoc-pro-source.ts`). What is
left on the client critical path is `saveFileToLibraryWithDependencies` in
`src/shell/doc-editors/doc-io.ts`: the project upload, the delivery upload and
the cover (preview) upload run strictly one after another, each a full
network round trip, before `createArtifactRevision`. They are independent.

## Deliver

Make the three uploads overlap while keeping every observable contract:

- Start each upload as soon as its own bytes are ready, without awaiting the
  previous upload: project upload starts first; then the delivery file is
  built/hashed and its upload starts; then the cover is rendered/hashed and
  its upload starts; only then await the uploads. Keep the existing
  `uploadFile` call order (project → delivery → preview) and the existing
  idempotency keys.
- Failure precedence must match the old serial code: the reported
  `failedStep` / error is the earliest failing step in pipeline order
  (`project-build`, `project-upload`, `delivery-build`, `delivery-upload`,
  `preview-upload`, contract checks, `revision-publish`, …). A later step's
  failure must never mask an earlier one; when an earlier step fails, do not
  publish. A cover render failure stays a warning, as today.
- Preserve the existing event-order tests, e.g. `tests/d1-r5-deck-persistence.test.mjs`
  (`["upload:project","upload:delivery","upload:preview","typed-revision"]`),
  `tests/deck-delivery-producer.test.mjs` (`["upload:project","build:failed"]`),
  `tests/w2-editor-save-contract.test.mjs` (`["project","delivery"]`), plus
  `tests/d12-model3d-host-save.test.mjs`, `tests/w13-upload-idempotency-digest.test.mjs`,
  `tests/w13-project-only-working-head.test.mjs`. Change a test only if it
  asserts timing that is intentionally changed, and say why.
- Reused prepared receipts (`preparedProject` / `preparedDelivery` /
  `preparedPreview`) keep skipping their uploads; `projectOnly`, creation
  (non-typed) and typed-revision branches keep their semantics.
- Add a test with a fake `uploadFile` whose calls resolve only when released,
  proving the three uploads are in flight together, plus precedence tests
  (earlier failure wins even when a later one fails first; no publish after a
  failure).

## Ownership

Own: `src/shell/doc-editors/doc-io.ts` (only `saveFileToLibraryWithDependencies`
and private helpers it needs), new `tests/save-upload-overlap-1022.test.mjs`,
and the tests listed above if a change is justified. Do not edit anything
else (other owners are integrating game and autosave files right now).

## Commands

```
cd /root/projects/oceanleo-ui
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test --test-concurrency=2 <≤4 files>
```

Run every test that imports `doc-io.ts` (`rg -l 'doc-io' tests`), in batches
of ≤4. One `pnpm typecheck` at the end via `agent-io-guard.sh run-heavy`
(report only your errors).

## Result

Write `docs/task-books/2026-10-22-claude-save-upload-overlap-result.md`: the
change, why precedence and order are preserved, tests with pass/fail counts,
residual risk. Reply with the essentials.

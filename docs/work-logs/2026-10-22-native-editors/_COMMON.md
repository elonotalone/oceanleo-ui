# Common instructions (read completely)

1. Read `/opt/cursor-workspaces/oceandino/AGENTS.md`, then run
   `bash /opt/cursor-workspaces/oceandino/scripts/agent-bootstrap.sh` before any read/edit/test/git.
   Read `00-dispatch.md` (operator decisions + cross-owner contracts) and your `tasks/Wxx.md`.
2. Model chosen by operator: Sonnet 5.5, medium effort, never fast. Do not spawn children.

## Red lines

No browser / Playwright / screenshots / UI automation. No production requests or deploys,
no `oceanleo-ui-bump.sh`, no Vercel, no push, no branches, no rebase/reset/stash/checkout of
others' files. No dependency installs; never edit `package.json` or lockfiles (request deps
changes in your delivery). Never edit `src/i18n/ui/messages/*` or the public barrels
`src/index.ts`, `src/shell/index.ts` (report needed changes). Preserve all unrelated dirty
files — the `game` and `oceanleo` repos already have other people's uncommitted changes;
never modify, stage, or commit a file you did not change yourself. Do not loosen any
CORS / cookie / iframe sandbox / postMessage / origin check; UGC sandboxes stay as strict as
they are (run `bash /opt/cursor-workspaces/oceandino/scripts/oceanleo-security-gate.sh` before
touching any of those). Never silently rewrite stored user documents or drop unsupported source
data: unsupported stored formats open read-only with a clear note (and convert if a converter
exists). No success reported from an unconfirmed save; no swallowed errors.

No shell-website editors, no Pro for the sake of Pro: see `00-dispatch.md`. When you remove a
mode, remove the code path — no dead `mode === "pro"` branches, no hidden toggles, no flags
left pointing at deleted modules. Delete files that become unused within your cluster.

## Working rules

- Own only your cluster (task book). Need a change in another owner's file? Write it in your
  delivery under "cross-owner requests"; do not edit it.
- Edits: use the Edit/Write tools. Main branch only.
- Before each major step update `signals/Wxx-state.md` (facts / current step / next / exact
  repro commands). Append measured facts to `signals/Wxx-journal.md` as you go.
- Commit small increments (every ~15 min of work): `git add <explicit files>` then
  `git commit -m "<msg>" -- <explicit files>` (deleted files: `git rm <file>` then commit
  with explicit paths). Never `git add -A`, `git commit -a`, or committing a directory you
  don't fully own. If `index.lock` exists, wait a few seconds and retry. Commit message
  prefix: `native-editors(Wxx):`. Commit trailer:
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
- Tests in oceanleo-ui are `tests/*.test.mjs` run with node's test runner. Focused run:
  `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<file>.test.mjs`
  Typecheck (heavy, other owners are editing concurrently — judge only errors in your files):
  `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- npx tsc --noEmit -p .`
  Never run the full suite; parent does.
- Tests that only assert deleted behavior (hosted pro, mode toggles for your editor) are deleted
  or rewritten to assert the new single-mode behavior. Add at least one regression test that
  would fail if your editor regained a Pro page / shell iframe / the removed dependency.

## Delivery

Write `verdicts/Wxx-delivery.md`: what changed (files deleted/edited/added), commits, exact
verification commands and results, tests deleted and why, cross-owner requests, deps changes
requested for package.json, honest remaining limitations. Commit it. Then reply with a short
summary and the delivery path. Your report is a claim; the parent verifies.

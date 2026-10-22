# Library save latency (backend) — owner `claude_save_latency_1022`

Parent: Claude Code session continuing two Codex sessions that died on quota
(operator 2026-10-22). Model: Claude Sonnet 5.5, medium effort, no fast mode —
operator's explicit choice. Parent owns integration, the dev-gateway refresh
and every commit. Do not commit, push, install, deploy, restart containers, or
use a browser. Main-only shared worktree; never `git checkout`/`stash`/`reset`;
never revert files you do not own.

Read first: `/opt/cursor-workspaces/oceandino/AGENTS.md`,
`/root/.oceanleo-workstation/INSTRUCTIONS.md`, pack
`/root/.cursor/rules/oceanleo.mdc`; run
`bash /opt/cursor-workspaces/oceandino/scripts/agent-bootstrap.sh`.
Then read the previous owner's book
`/root/projects/oceanleo-ui/docs/task-books/2026-10-22-library-stability-backend-latency.md`
— its scope, fixture rules and red lines still apply. The previous owner only
read code (no edits, no findings recorded).

## Why

Operator: a tiny edit in a Umo document keeps the autosave icon yellow for
about 10 s; earlier fixes did not help. Parent measured on the dev gateway with
the existing synthetic fixture and helper: `save_revision` alone takes
**~4.5 s** for a tiny document (excluding uploads and cover rendering);
idempotent replay ~1.2 s; a distinct stale attempt is rejected 409 in ~2.4 s.
Byte reread / native DOCX / project / permission / revision assertions all
passed. Read-only probes: `artifact_service.get_item` ~44–47 ms; hashing the
existing source/editor manifest in `_hash_owned_object` ~373/357 ms each —
i.e. repeated remote storage reads, not CPU, are the likely cost. Suspects from
reading: `adapt_deployed_revision` stages source and each rendition
sequentially; the same source/full locator can be hashed more than once;
`TypedArtifactService._verify_durable_content` verifies unique blobs one by one.
A separate frontend owner handles client phases and status truth.

## Deliver

1. Profile the real phases of one tiny save (per storage call: info, download,
   upload/copy, hash; per DB call) and write the timeline down before editing.
2. Implement the proven, safe reduction. Allowed directions: request-local
   deduplication (never hash/download the same object twice in one request),
   bounded concurrency for independent storage IO (small fixed limit, no large
   in-memory fan-out), skipping a re-download only when an equally strong
   server-side proof already exists in the same request. Forbidden: global or
   cross-user caches, trusting a client-supplied digest, skipping permission,
   CAS, durability or integrity checks, weakening fail-closed behaviour.
3. Meaningful regressions in a new `backend/tests/test_library_save_latency_1022.py`:
   identity/rejection behaviour stays (wrong digest → integrity-failed, stale
   revision → 409, idempotent replay → same revision), plus a test that proves
   the dedup/concurrency property (e.g. a fake bucket counting downloads per
   key and observing overlap), not only source-text assertions.
4. Re-measure with the same fixture and report before/after numbers.

## Ownership

Own: `/root/projects/oceanleo/backend/app/typed_artifact_wire.py`, new
`backend/tests/test_library_save_latency_1022.py`. `typed_artifact_service.py`
and `typed_artifact_repository.py` only where measurement proves it necessary
(state why in the result). Everything else read-only. Other owners are editing
`backend/app/routers/game_generate_router.py`, `backend/app/main.py` and game
files — do not touch them.

## Measuring

Backend source is bind-mounted into the `oceanleo-api` container at `/app`;
uvicorn there runs **without** reload, so a fresh `docker exec -i oceanleo-api
python …` process imports your edited code without restarting the gateway.
That container on this host serves only `api.dev.oceanleo.com` (public
`api.oceanleo.com` is a different server). Still: never restart it yourself —
the parent refreshes it after review.

Reuse **only** the owner/title-verified synthetic fixture
`3495599f-4145-4312-8d69-25fbfcdec13d` (title
`[Editor repair acceptance 2026-10-22] 23fafdea`) through the existing helper
`/root/projects/oceanleo-ui/tests/helpers/verify-private-editor-save.py`, run
inside `oceanleo-api` with its dev-target guard and owner/title checks (see how
the previous book and helper do it; the parent wrapped `save_revision` with a
`time.perf_counter()` shim to time it). Do not create fixtures, do not touch
operator documents, never print tokens, signed URLs, source bytes or secrets.

Tests: `cd /root/projects/oceanleo/backend && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- .venv/bin/python -m pytest -q <files>`
(add the existing typed-artifact wire/service tests that cover what you change;
`rg --files backend/tests | rg 'typed_artifact|artifact_wire|revision'`).

## Result

Write `/root/projects/oceanleo-ui/docs/task-books/2026-10-22-claude-library-save-latency-result.md`:
the measured timeline, cause, the chosen change and rejected alternatives,
exact files, commands with pass/fail counts, before/after timings, residual
uncertainty, and confirmation that a gateway refresh is needed for the change
to be live. Your final message repeats the essentials.

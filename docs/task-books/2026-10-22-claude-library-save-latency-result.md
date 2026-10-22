# Library save latency result (claude_save_latency_1022)

## Measured timeline (baseline, fixture 3495599f..., first save, dev gateway, ms)
- svc.get_item ~45.
- adapt_deployed_revision ~1.95 s, strictly serial: each of 4 locators = 2x storage.exists + info + signed URL + full GET/hash (~220-560 each). The source and `full` rendition are the SAME object, hashed twice.
- commit_revision ~2.27 s: db capability checks ~55, then `_verify_durable_content` ~2.07 s, one blob after another. For a blob not yet content-addressed, verify_blob_durable = exists, info, GET+hash, exists, copy, info, GET+hash again (CAS TOCTOU rehash), receipt insert = ~0.9-1.0 s each for the 2 new blobs, ~0.2 s for the already-claimed one.
- Total ~4.2-4.5 s. Replay ~1.3-1.6 s and stale-409 ~2.4 s are mostly adapt (serial hashing) because they re-stage before the conflict is known.

## Cause
Repeated remote storage round-trips executed serially: duplicate hash of source/full, serial staging of 4 locators, serial per-blob durability proofs.

## Change
- `backend/app/typed_artifact_wire.py`: new `_stage_locators_once`; `adapt_deployed_revision` stages source + renditions through it. Request-local dedupe of `project-assets:`/`u/` locators (one inspection per distinct object; format re-stamped per reference via the same `_format_for`), distinct inspections overlap under an `asyncio.Semaphore(4)` (`_STAGE_CONCURRENCY`). First failure in request order is re-raised. Every inspection still does exists + size + full byte hash; declared-digest checks, partition checks and contract checks unchanged and run in the same order after staging. URL/rehost locators are not deduped (own stable keys).
- `backend/app/typed_artifact_service.py` (touched because profiling showed ~2.07 s of 4.5 s inside `_verify_durable_content`): per-blob `verify_blob_durable` now runs on a `ThreadPoolExecutor` of at most 3 (`_VERIFY_CONCURRENCY`), results in request order, first failure in request order mapped via `_from_repository` as before. No check was removed; repository code untouched.
- Rejected: global/cross-user caches, trusting client digests, skipping the CAS rehash, skipping the second `exists`, collapsing stale-conflict pre-check (would reorder semantics). Further possible gain (not done): avoid the double CAS download inside the repository.

## Before / after (same fixture, helper run in oceanleo-api, save #1 = real new revision)
- Before: ~4.2 s (my profile), 4.49 s (parent).
- After (5 runs, network noisy): 1.81, 3.46 (outlier), 2.41, 1.99, 1.63, 2.47 s. Typical ~2.0 s. Replay 0.52-0.76 s (was 1.2-1.6). Stale 409 still returned, 1.7-2.1 s (one run 3.7 s).
- After timeline: adapt ~0.85 s (3 hashes overlapped, 366/468/591), verify ~1.39 s (two new blobs overlapped, 1.3-1.4 s; bounded by one blob's serial CAS copy+rehash).
- Helper assertions all passed every run (byte reread, native DOCX bold/28px, machine download 200, idempotent replay, stale 409, originals unchanged). Each run adds one revision to the synthetic fixture only.

## Tests
- `cd backend && agent-io-guard.sh run-light -- .venv/bin/python -m pytest -q tests/test_library_save_latency_1022.py` : 7 passed.
- Same plus test_w2_revision_wire_integrity, test_typed_artifact_save_contract, test_typed_artifact_control_plane, test_typed_artifact_edit_independence, test_editor_video_dependency_revision, test_d13_wire_storage_content_type, test_typed_artifact_editable_projection, test_artifact_library_wire_contract: 147 passed, 1 failed. The failure (`test_typed_artifact_editable_projection::test_published_acceptance_package_projects_every_dependency_digest`) raises "source format is incompatible with artifact type" while building `tests/fixtures/typed_artifact_acceptance.py` (game fixture); not in a code path I changed (other owners are editing game files). Not re-verified against a clean tree.
- New tests: fake storage counts inspections per key and measures overlap (dedupe once per key, 2..4 in flight); wrong digest -> integrity-failed; inspection failure fails closed; foreign partition 403 with no storage client use; service verify overlap <=3, order kept, failing blob -> mapped error, single blob no pool.

## Files
- /root/projects/oceanleo/backend/app/typed_artifact_wire.py
- /root/projects/oceanleo/backend/app/typed_artifact_service.py
- /root/projects/oceanleo/backend/tests/test_library_save_latency_1022.py
- Temporary profiler only in /tmp/claude-continue/prof (not in repo).

## Residual risks
- Concurrent verify uses one shared supabase client across threads (already used from threads by the wire path); two blobs with the same sha but different keys would race the CAS copy/receipt insert, which the repository already tolerates (concurrent-winner handling).
- Remaining floor ~1.3 s in verify is serial CAS copy + rehash inside one blob; latency still varies 1.6-3.5 s with storage jitter. The user-visible ~10 s likely has a frontend component (separate owner).
- A gateway refresh of oceanleo-api is required for this to be live (uvicorn without reload); fresh `docker exec` processes already use it, which is how it was measured. Nothing committed.

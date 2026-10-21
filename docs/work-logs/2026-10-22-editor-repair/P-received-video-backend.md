# Parent video backend / real-storage receipt

## Exact screenshot source

- Root `9c6ef0c3-34dc-4a80-ac80-ab269d31ba18`, revision `0b7be1b1-4f3b-43f5-93fc-1fb210c42fda`.
- `/tmp/w04-video-source.bin`, 10083 bytes, SHA256 `a9cf73ccd3ac858cdac83e09d7b616e8ebabfd715b65563dfb5c28c72fcd8b31`.
- Deployed v1 uses `schemaVersion` and `versions[]`; it contains 9 nodes, 9 edges and 3 assets. The old migration looked for a different top-level shape and failed closed with one issue.
- Existing committed source closure already contains `source.json`, `assets/coffee.webp`, `assets/hearts.mp4`, `assets/music.mp3`. The media were not missing; frontend open and new-revision dependency handling were missing.

| Dependency | Bytes | SHA256 |
| --- | ---: | --- |
| coffee.webp | 34480 | `0b873e092f7f73e079709f7a25f8be591d96fee93fb9c899f787d29b2f6127c7` |
| hearts.mp4 | 19966599 | `7dfab1379bf9093ebf05ca4bd63b198202233eb7920ebfb3f23835e732cacfc3` |
| music.mp3 | 1991170 | `46aaa7d8a70f44f7b2993a872f30a949bcfb86a1a73699d2184000aff18827c8` |

The existing owner-authenticated source-dependency grant endpoint resolved every entry. Fresh scoped grants returned direct HTTP200 (no redirect), exact MIME, bytes and SHA via local dev. Tokens, URLs and file bytes stayed out of output. No user session or service-role key was copied to a project.

## Backend repair and independent tests

Portal commit `053f825` contains exactly the revision staging implementation, focused tests, narrow canonical-v2 fixture update, and the verification script. Unrelated dirty portal files remain untouched.

Canonical v2 saves now construct a complete media closure rather than just the source entrypoint. Each stable dependency is six fields: artifactId, revisionId, path, sha256, mediaType, byteSize. The server verifies same-root owner access through the existing repository, safe assets path, exact manifest/storage metadata and bytes, a 512MB aggregate budget and duplicate consistency. Historical same-root pins may supply preserved dependencies; the new closure keeps their stable paths. No arbitrary client storage locator is accepted. Nonempty url/previewUrl alongside stable dependencies, temporary capability URLs and blob/data URLs are rejected.

Parent final command (workstation guard, portal cwd):

```sh
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- docker exec oceanleo-api python -m unittest tests.test_editor_video_dependency_revision tests.test_typed_artifact_save_contract tests.test_artifact_library_wire_contract tests.test_w2_revision_wire_integrity -q
```

Result: **70 tests passed**, including V01's conflicting same-hash MIME and encoded capability-locator counterexamples. Existing Pydantic warnings are baseline, not failures.

## Durable private fork acceptance

`backend/scripts/verify_editor_video_save.py` receives the exact source migrated by the actual Video model, creates an owner-private fork, saves through the real in-process verified-owner revision route, and rereads actual storage. Machine credentials remain inside the running gateway and are revoked in `finally`. This is not browser/user-bearer end-to-end evidence.

- Retained root: `16e11caf-1c6d-4e67-8b8a-d9bff2527ded`.
- Title: `[Editor repair video acceptance 2026-10-22] afb9aa8b`.
- Initial fork revision: `66ddd22d-ab80-4b68-90a1-2f3327e0f4d7`.
- Saved canonical v2 revision: `4723e956-b9be-4421-bd1f-929a1ebc4dbf`.
- Saved source reread exactly; complete manifest has four entries. All three media reread through the new revision's owner grants with matching SHA and sizes. Old fork pin and original screenshot head remain unchanged.
- The script supports `--fixture <id>` with exact-title owner checks for reuse; no need for more test roots. Only private JSON/PNG test content was created; original media were reused, not changed or published.

No cleanup/deletion was performed. This private fixture and the separate synthetic document fixture remain recoverable in Library.

## Dev-only runtime refresh

The dev API container mounts this backend. Before refreshing it, the parent verified the self-preservation guard, zero active ACP turns, current Caddy upstream and authoritative DNS separation (dev and production API resolve to different hosts). Only local `oceanleo-api` was restarted; protected relay/Cursor processes were untouched. Afterwards `https://api.dev.oceanleo.com/health` returned HTTP200 with ready/vault/supabase true. No production/twin push or deployment occurred.

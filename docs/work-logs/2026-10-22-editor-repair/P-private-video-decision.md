# Hosted video private staging decision

Outcome: editing an existing private Library workflow must not publish its source or previews to a public bucket, nor create temporary Library roots on every autosave.

## Candidate chains and selected boundary

1. Existing URL-only `uploadFile(registerAsset:false)` → public media upload → typed revision. Mature and already wired, but violates the private-file boundary. Rejected.
2. Existing `privateUpload:true` → private typed upload root → source access grant URL → URL-only revision. Uses mature helpers, but `file.url` is deliberately empty; reconstructing URLs/rehosting risks public copies, and each autosave would add temporary Library roots. Rejected.
3. Existing private multipart upload with a narrow `register_asset:false` staging-only branch → existing typed `blob_id` revision adapter → server owner/hash/CAS checks. Selected. No new endpoint, auth mechanism, process, timer, public URL or token forwarding. Small JSON/PNG staging is capped by the existing 20MB private-upload limit. Browser/client holds only a bucket-bound owner locator, digest, MIME and size; these are untrusted hints, not permission. Server storage verification remains final authority.

The returned locator is explicitly `project-assets:u/<owner>/...`; the revision adapter inspects only that private bucket and asserts it is not public, never searching an equivalent key in the public bucket. The default private-upload registration behavior is unchanged. Staging-only validates JSON/PNG and skips typed registration entirely, so it creates no Library root. Saved workflow JSON contains neither staging metadata nor runtime receipt/grant/blob URLs. The iframe's existing artifact-updated envelope retains the opened HTTP URL only as an unused compatibility pointer; a strict video-v2 private descriptor branch supplies source/preview bytes to the existing typed revision protocol.

## Falsification / measured substrate proof

Assumption that would invalidate this chain: the deployed typed revision route cannot resolve and hash owner-private staged JSON/PNG by blob ID while preserving the media closure.

Before these changes, `backend/scripts/verify_editor_video_save.py` exercised exactly private staging → deployed `DeployedCommitRevisionRequest.blob_id` → real revision save/reread on this dev gateway. Result: fixture root `16e11caf-1c6d-4e67-8b8a-d9bff2527ded`, durable revision `4723e956-b9be-4421-bd1f-929a1ebc4dbf`, private JSON/PNG exact reread, complete four-entry closure and three exact media dependencies, original unchanged. See [P-received-video-backend.md](./P-received-video-backend.md). This proves the existing substrate, not the new browser staging branch. Focused negative tests plus a reused-fixture end-to-end dev route run are required for the new branch.

After implementation the same script used the real `private_upload_file(register_asset=False)` route, consumed bucket-bound descriptors, committed a new revision on the same retained fixture, and reread exact private bytes and all three media. Result: **`cfd04766-0f37-47a9-825b-ab9af109f256`**, complete closure4, original unchanged. No extra Library roots or public bytes were created. New route/locator + adjacent backend tests passed67/67; shared private commit/protocol/planner + adjacent tests57/57. The real React message hook additionally rejected spoofed source/origin/instance/invalid IDs and immediately forwarded one correlated VIDEO_SAVE_FAILED without a fake success or persistence call (1/1). This is dev in-process verified-owner/real storage evidence, not browser/user-bearer proof.

Final expanded backend group (private staging/upload/typed-upload closure/video dependencies/all-type save contract/Library wire/revision integrity) passed **102/102**. Invalid fake PNG/non-object JSON/malformed JSON are rejected before storage. The guard classified this seven-module group as heavy, so it was retried in the heavy lane, not forced through light admission. Existing resource/Pydantic deprecation warnings remain baseline.

## Parent-owned integration lease

Parent edits only the private-upload staging branch, bucket-bound typed locator handling, the shared rendition planner's additive optional blobId, a strict private-video descriptor validator, the typed embedded commit branch and the corresponding protocol metadata admission/tests. Existing origin/source/instance/revision checks are preserved. W04 owns only the Video host/core staging caller and hosted autosave lifecycle. No production/twin distribution or browser automation is authorized.

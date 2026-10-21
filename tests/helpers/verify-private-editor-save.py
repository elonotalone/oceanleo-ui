"""Opt-in real-storage acceptance; run inside the existing dev gateway only.

This creates ONE clearly named, private synthetic Library document. It never
edits existing operator files, installs an auth override, or exports a token.
Machine-authenticated dev HTTP covers creation/download; the normal revision
route is called in-process with the helper-verified owner, so this is NOT a
claim of browser/user-bearer end-to-end acceptance. The fixture is retained.
"""
from __future__ import annotations

import asyncio
import argparse
import base64
import hashlib
import io
import json
import logging
import uuid
import zipfile
from xml.etree import ElementTree

logging.disable(logging.CRITICAL)

from fastapi import HTTPException

from scripts.operator_library import COMPUTER, OWNER, LibrarySession, guard_runtime
from app import storage_quota, supa
from app.routers.artifacts_router import artifact_catalog_query, artifact_service, save_revision
from app.typed_artifact_models import DeployedCommitRevisionRequest, RenditionPurpose


def native_docx(text: str) -> bytes:
    target = io.BytesIO()
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
        archive.writestr("_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        archive.writestr("word/document.xml", f'<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/><w:sz w:val="56"/></w:rPr><w:t>{text}</w:t></w:r></w:p></w:body></w:document>')
    return target.getvalue()


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def stage_private(run_id: str, name: str, mime: str, data: bytes) -> dict:
    storage_quota.ensure_private_room(OWNER, len(data))
    key = supa.storage_upload_private(
        user_id=OWNER, site_id="word", filename=name, data=data,
        content_type=mime, stable_key=f"editor-repair:{run_id}:{name}:{sha(data)}",
    )
    assert key and key.startswith(f"u/{OWNER}/word/")
    return {"blob_id": key, "digest": sha(data)}


async def reread(artifact_id: str, revision_id: str, purpose: RenditionPurpose, digest: str) -> bytes:
    resolved = artifact_service.repository.rendition(
        OWNER, artifact_id, revision_id, purpose, "source",
    )
    assert resolved and resolved.storage_bucket == "project-assets"
    return await supa.storage_download_private_bounded(
        user_id=OWNER, bucket_name=resolved.storage_bucket,
        storage_key=resolved.storage_key, max_bytes=1024 * 1024,
        expected_bytes=resolved.byte_size, expected_sha256=digest,
    )


async def main(fixture: str | None) -> None:
    guard_runtime()
    originals = (
        "cbf7147b-9c6c-4a62-a833-accff1e12ae8",
        "cf20e79f-ed64-43c0-b0d5-303663c9965d",
        "9c6ef0c3-34dc-4a80-ac80-ab269d31ba18",
    )
    before = {key: artifact_catalog_query.detail(OWNER, key, None).revision_id for key in originals}
    run_id = uuid.uuid4().hex
    title = f"[Editor repair acceptance 2026-10-22] {run_id[:8]}"
    mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    initial = native_docx("Isolated original; safe to retain as acceptance evidence")
    with LibrarySession("dev") as session:
        if fixture:
            known = artifact_catalog_query.detail(OWNER, fixture, None)
            assert known.owner.principal_id == OWNER
            assert known.title.startswith("[Editor repair acceptance 2026-10-22] ")
            artifact_id, first_revision, title = fixture, known.revision_id, known.title
            existing = session.request("GET", f"/v1/computers/{COMPUTER}/agent/library/download/{artifact_id}", params={"revision_id": first_revision})
            assert existing.status_code == 200 and sha(existing.content) == known.source.digest
            initial = existing.content
        else:
            created = session.request(
                "POST", f"/v1/computers/{COMPUTER}/agent/library/upload",
                files={"file": (f"editor-repair-{run_id}.docx", initial, mime)},
                data={"site_id": "word", "title": title, "idempotency_key": f"editor-repair:{run_id}"},
            )
            assert created.status_code == 200, f"private fixture creation status={created.status_code}"
            receipt = created.json()["file"]
            artifact_id, first_revision = receipt["artifact_id"], receipt["revision_id"]
        assert artifact_id not in originals
        print(json.dumps({"fixtureCreated": artifact_id, "initialRevision": first_revision, "title": title}), flush=True)
        text = f"Isolated revised text {run_id}"
        delivery = native_docx(text)
        document = {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": text, "marks": [{"type": "bold"}, {"type": "textStyle", "attrs": {"fontSize": "28px"}}]}]}]}
        project = json.dumps({"schema": "tiptap-json@1", "data": document}, separators=(",", ":")).encode()
        png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
        source = stage_private(run_id, "edited.docx", mime, delivery)
        manifest = stage_private(run_id, "edited.project.json", "application/json", project)
        preview = stage_private(run_id, "edited.preview.png", "image/png", png)
        body = DeployedCommitRevisionRequest.model_validate({
            "expected_revision_id": first_revision, "artifact_type": "document",
            "source": {**source, "format": "docx"},
            "renditions": [
                {**source, "purpose": "full"},
                {**manifest, "purpose": "editor_manifest"},
                {**preview, "purpose": "preview"},
            ],
            "provenance": {"acceptanceRun": run_id},
        })
        saved = await save_revision(artifact_id, body, first_revision, OWNER)
        second_revision = saved["revisionId"]
        assert saved["artifactId"] == artifact_id and second_revision != first_revision
        assert saved["owner"]["principalId"] == OWNER
        reopened = artifact_catalog_query.detail(OWNER, artifact_id, None)
        assert reopened.revision_id == second_revision
        assert reopened.editor_capability == "richdoc-editor"
        assert reopened.source_format == "docx"
        assert await reread(artifact_id, second_revision, RenditionPurpose.SOURCE, sha(delivery)) == delivery
        restored = json.loads(await reread(artifact_id, second_revision, RenditionPurpose.EDITOR_MANIFEST, sha(project)))
        assert restored["data"] == document
        with zipfile.ZipFile(io.BytesIO(delivery)) as archive:
            root = ElementTree.fromstring(archive.read("word/document.xml"))
        ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
        assert root.find(".//w:b", ns) is not None
        assert root.find(".//w:sz", ns).attrib[f'{{{ns["w"]}}}val'] == "56"
        assert root.find(".//w:t", ns).text == text
        downloaded = session.request("GET", f"/v1/computers/{COMPUTER}/agent/library/download/{artifact_id}", params={"revision_id": second_revision})
        assert downloaded.status_code == 200 and sha(downloaded.content) == sha(delivery)
        replayed = await save_revision(artifact_id, body, first_revision, OWNER)
        assert replayed["revisionId"] == second_revision
        stale_source = stage_private(run_id, "stale-attempt.docx", mime, native_docx(f"Stale competing edit {run_id}"))
        stale_data = body.model_dump(mode="json")
        stale_data["source"] = {**stale_source, "format": "docx"}
        stale_data["renditions"] = [
            {**stale_source, "purpose": "full"},
            {**manifest, "purpose": "editor_manifest"},
            {**preview, "purpose": "preview"},
        ]
        stale_body = DeployedCommitRevisionRequest.model_validate(stale_data)
        try:
            await save_revision(artifact_id, stale_body, first_revision, OWNER)
        except HTTPException as error:
            assert error.status_code == 409 and error.detail["code"] == "revision-conflict"
        else:
            raise AssertionError("stale head was accepted")
        assert artifact_catalog_query.detail(OWNER, artifact_id, None).revision_id == second_revision
        pinned = artifact_catalog_query.detail(OWNER, artifact_id, first_revision)
        assert pinned.revision_id == first_revision
        assert await reread(artifact_id, first_revision, RenditionPurpose.SOURCE, sha(initial)) == initial
        assert before == {key: artifact_catalog_query.detail(OWNER, key, None).revision_id for key in originals}
        print(json.dumps({
            "ok": True, "artifactId": artifact_id, "revisionId": second_revision,
            "privateBucketOnly": True, "nativeDocxAndManifestReread": True,
            "boldAnd28pxPreserved": True, "machineHttpDownload": 200,
            "identicalRetryIsIdempotent": True, "staleDistinctRevisionConflict": 409,
            "originalOperatorHeadsUnchanged": True,
            "retainedFixture": title,
            "scope": "real storage; machine HTTP create/download; in-process verified-owner revision route, not browser auth",
        }), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture", help="Resume only an owner-verified, exactly titled acceptance fixture")
    asyncio.run(main(parser.parse_args().fixture))

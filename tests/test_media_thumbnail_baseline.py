"""VS9: compare the real registration path at both measured gateway revisions.

No database, storage or converter is contacted; every service boundary is fake.
"""
import importlib.util
import subprocess
import sys
from unittest.mock import Mock

import pytest

from app.typed_artifact_models import BlobDescriptor
from app.typed_artifact_service import TypedArtifactError

REPO = "/root/projects/oceanleo"
BASE = "ab1efc41"
INTEGRATED = "f8b39e2a"


def source(revision, path):
    return subprocess.check_output(["git", "-C", REPO, "show", f"{revision}:{path}"])


def registration_module(revision):
    name = f"s3b_thumbnail_baseline_{revision}"
    module = importlib.util.module_from_spec(importlib.util.spec_from_loader(name, loader=None))
    sys.modules[name] = module
    exec(compile(source(revision, "backend/app/typed_uploads.py"), name, "exec"), module.__dict__)
    return module


@pytest.mark.parametrize("mime,filename,kind", [
    ("audio/wav", "sound.wav", "audio"),
    ("video/mp4", "clip.mp4", "video"),
    ("model/gltf-binary", "scene.glb", "model3d"),
])
def test_private_thumbnail_failure_is_identical_before_and_after_wave(mime, filename, kind):
    # Prove identical relevant code, not merely matching HTTP error text.
    for path in [
        "backend/app/typed_uploads.py", "backend/app/private_upload_thumbnail.py",
        "backend/app/routers/artifacts_router.py", "backend/app/typed_artifact_service.py",
        "backend/app/typed_artifact_repository.py",
    ]:
        assert source(BASE, path) == source(INTEGRATED, path), path

    failures = []
    for revision in [BASE, INTEGRATED]:
        module = registration_module(revision)
        repository = Mock()
        repository.prepare_upload_blob.return_value = BlobDescriptor(
            sha256="a" * 64, byte_size=128, media_type=mime,
            storage_bucket="project-assets", storage_key="private/test-source",
        )
        artifact_service = Mock()
        thumbnail = Mock(side_effect=RuntimeError("test converter unavailable"))
        service = module.TypedUploadRegistrationService(
            repository, artifact_service, thumbnail_preparer=thumbnail,
        )
        upload = module.UploadObject(
            url="", storage_bucket="project-assets", storage_key="private/test-source",
            filename=filename, title="TEST media", media_type=kind, mime=mime, byte_size=128,
            site_id="oceanleo", register_asset=True, direct_upload=False, private_storage=True,
        )
        with pytest.raises(TypedArtifactError) as raised:
            service.register("test-owner", "test-upload", upload,
                             expected_sha256="a" * 64, allow_sanitized_svg=False)
        error = raised.value
        failures.append((error.status_code, error.code, error.details))
        thumbnail.assert_called_once()
        assert not artifact_service.mock_calls
    assert failures[0] == failures[1]
    assert failures[0][0:2] == (503, "storage-unavailable")
    assert failures[0][2]["uploadPhase"] == "private-thumbnail"

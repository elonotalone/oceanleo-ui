"""W04 API-level reproduction of the PDF editor save chain (dev gateway only).

Usage (token never printed):
  bash harness/mint.sh | python3 -I evidence/W04/scenarios/api-repro-pdf.py <artifact_id> [--fixed]

Mirrors doc-io.saveFileToLibraryWithDependencies for a PDF:
  upload delivery (POST /v1/database/upload register_asset=false)
  -> commit (POST /v1/artifacts/<id>/revisions, If-Match = base revision)
Without --fixed the base stays the opened revision (what advancedSavedItem kept);
with --fixed the base advances to each returned revision.
"""
import hashlib
import json
import sys
import urllib.error
import urllib.request
import uuid

GATEWAY = "http://127.0.0.1:8008"
token = sys.stdin.read().strip()
artifact_id = sys.argv[1]
fixed = "--fixed" in sys.argv
private = "--private" in sys.argv


def call(method, path, body=None, headers=None, raw=None, content_type=None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    request = urllib.request.Request(GATEWAY + path, data=data, method=method)
    request.add_header("Authorization", f"Bearer {token}")
    if content_type or body is not None:
        request.add_header("Content-Type", content_type or "application/json")
    for key, value in (headers or {}).items():
        request.add_header(key, value)
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        try:
            return error.code, json.loads(error.read() or b"{}")
        except Exception:
            return error.code, {}


def upload(name, payload, endpoint="upload"):
    boundary = uuid.uuid4().hex
    parts = []
    fields = {"site_id": "oceanleo", "title": name, "register_asset": "false",
              "idempotency_key": f"w04-repro:{hashlib.sha256(payload).hexdigest()[:24]}"}
    for key, value in fields.items():
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: application/pdf\r\n\r\n'.encode() + payload + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    return call("POST", f"/v1/database/{endpoint}", raw=b"".join(parts),
                content_type=f"multipart/form-data; boundary={boundary}")


status, current = call("GET", f"/v1/artifacts/{artifact_id}")
base = current.get("revisionId")
opened = base
print("opened revision", base, "status", status)
source_url = ((current.get("renditions") or {}).get("source") or {}).get("url")
pdf = urllib.request.urlopen(urllib.request.Request(source_url if source_url.startswith("http") else GATEWAY + source_url), timeout=60).read()
for attempt in range(1, 4):
    payload = pdf + f"\n%W04 repro edit {uuid.uuid4().hex}\n".encode()
    digest = hashlib.sha256(payload).hexdigest()
    up_status, up = upload("[W04] sample-编辑版.pdf", payload, "private-upload" if private else "upload")
    file = up.get("file") or {}
    locator = {"blob_id": file["blob_id"]} if file.get("blob_id") else {"url": file.get("url")}
    print(f"save {attempt}: upload {up_status} hidden_root={file.get('artifact_id') or '-'} blob={'yes' if file.get('blob_id') else 'no'}")
    commit = {
        "expected_revision_id": base,
        "artifact_type": "pdf",
        "source": {"format": "pdf", **locator, "digest": digest},
        "renditions": [{"purpose": "full", **locator, "digest": digest}],
        "provenance": {"editor": "pdf-native-v1", "w04Repro": attempt},
    }
    c_status, result = call("POST", f"/v1/artifacts/{artifact_id}/revisions", commit, {"If-Match": base})
    detail = result.get("detail") if isinstance(result.get("detail"), dict) else {}
    print(f"save {attempt}: commit base={base[:8]} -> {c_status} new={str(result.get('revisionId') or '-')[:8]} "
          f"code={detail.get('code', '-')} current={str((detail.get('details') or {}).get('currentRevisionId') or '-')[:8]}")
    if c_status == 200 and fixed:
        base = result["revisionId"]
print("opened", opened[:8], "final base", base[:8])

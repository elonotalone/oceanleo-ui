"""W04: does the own-head 409 retry work for privately staged bytes? (dev gateway, acceptance account)

  bash harness/mint.sh | python3 -I evidence/W04/scenarios/api-retry-staged.py <pdf_artifact_id> [--same-bytes]

1. stage P1, commit on head H            -> expect 200 (H1)
2. stage P2, commit on stale H           -> expect 409 revision-conflict
3. commit the same P2 locator on H1      -> expect 200 (the doc-io own-head retry)
--same-bytes makes P2 == P1's bytes (a repeat flush with no change), the browser image case.
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
same_bytes = "--same-bytes" in sys.argv


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


def stage(payload):
    boundary = uuid.uuid4().hex
    raw = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="w04-retry.pdf"\r\n'
           f'Content-Type: application/pdf\r\n\r\n').encode() + payload + f"\r\n--{boundary}--\r\n".encode()
    status, body = call("POST", f"/v1/artifacts/{artifact_id}/staging", raw=raw,
                        content_type=f"multipart/form-data; boundary={boundary}")
    assert status == 200, (status, body)
    return body["file"]


def commit(base, staged, payload, label):
    digest = hashlib.sha256(payload).hexdigest()
    locator = {"blob_id": staged["blob_id"]}
    body = {
        "expected_revision_id": base, "artifact_type": "pdf",
        "source": {"format": "pdf", **locator, "digest": digest},
        "renditions": [{"purpose": "full", **locator, "digest": digest}],
        "provenance": {"editor": "pdf-native-v1", "w04RetryProbe": label},
    }
    status, result = call("POST", f"/v1/artifacts/{artifact_id}/revisions", body, {"If-Match": base})
    detail = result.get("detail") if isinstance(result.get("detail"), dict) else {}
    print(f"{label}: base={base[:8]} -> {status} new={str(result.get('revisionId') or '-')[:8]} code={detail.get('code', '-')} "
          f"msg={str(detail.get('message', ''))[:120]}")
    if status >= 400:
        print("   body:", json.dumps(result, ensure_ascii=False)[:400])
    return status, result


status, item = call("GET", f"/v1/library/items/{artifact_id}")
head = item["revisionId"]
source = ((item.get("renditions") or {}).get("source") or {}).get("url")
pdf = urllib.request.urlopen(urllib.request.Request(source if source.startswith("http") else GATEWAY + source), timeout=60).read()
p1 = pdf + f"\n%W04 retry probe 1 {uuid.uuid4().hex}\n".encode()
p2 = p1 if same_bytes else pdf + f"\n%W04 retry probe 2 {uuid.uuid4().hex}\n".encode()
s1 = stage(p1)
c1, r1 = commit(head, s1, p1, "1 fresh base")
h1 = r1.get("revisionId") or head
s2 = stage(p2)
c2, _ = commit(head, s2, p2, "2 stale base")
c3, _ = commit(h1, s2, p2, "3 own-head retry")
print("RESULT", "ok" if (c1, c2, c3) == (200, 409, 200) else "BROKEN", (c1, c2, c3))

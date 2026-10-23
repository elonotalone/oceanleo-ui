"""Does the server's current revision of an artifact contain the given markers? (dev gateway, read-only)

  bash harness/mint.sh | python3 -I evidence/W04/scenarios/server-has.py <artifact_id> <marker> [<marker> ...]

Reads the current item and every rendition/source URL it names, then reports, per marker,
which payloads contain it. The token comes on stdin and is never printed.
"""
import json
import sys
import urllib.error
import urllib.request

GATEWAY = "http://127.0.0.1:8008"
token = sys.stdin.read().strip()
artifact_id, markers = sys.argv[1], sys.argv[2:]


def get(url, auth=True):
    request = urllib.request.Request(url if url.startswith("http") else GATEWAY + url)
    if auth and not url.startswith("http"):
        request.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


item = json.loads(get(f"/v1/library/items/{artifact_id}"))
print("revision", item.get("revisionId"), "type", item.get("artifactType") or item.get("artifact_type"))
payloads = {}
for name, rendition in (item.get("renditions") or {}).items():
    url = (rendition or {}).get("url") if isinstance(rendition, dict) else None
    if url:
        try:
            payloads[f"rendition:{name}"] = get(url)
        except (urllib.error.URLError, ValueError) as error:
            print("could not read", name, type(error).__name__)
payloads["item-json"] = json.dumps(item, ensure_ascii=False).encode()
for marker in markers:
    hits = [key for key, data in payloads.items() if marker.encode() in data]
    print(marker, "->", hits or "NOT ON SERVER")

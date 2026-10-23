"""Read-only dev receipt check; mint.sh token is consumed from stdin, never logged."""
import json
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen

root = "53931dfb-8ef2-4fb5-9db8-d88d98b990bf"
job = "game-iter-940d151d384c5bb8bfd357903aa405b3bf0856a1a6d09af0c479658564aa1c78"
token = sys.stdin.read().strip()

def read(path):
    request = Request("https://api.dev.oceanleo.com/v1/game-generate/" + path,
                      headers={"Authorization": "Bearer " + token})
    with urlopen(request, timeout=30) as response:
        assert response.status == 200
        return json.load(response)

for path in (f"{root}/iterations/latest", f"{root}/iterations/{job}"):
    result = read(path)
    artifact = result["result"]["artifact"]
    assert result["state"] == "succeeded" and result["jobId"] == job
    assert artifact["artifactId"] == root
    assert artifact["revisionId"] == "41a99871-3b76-4062-be20-6f467cd5c5fa"
    assert artifact["title"] == "背景改成深蓝色。"
    print(json.dumps({"method": "GET", "state": result["state"], "jobId": result["jobId"], "revisionId": artifact["revisionId"], "title": artifact["title"]}, ensure_ascii=False))

try:
    read(f"not-this-artifact/iterations/{job}")
except HTTPError as error:
    assert error.code == 404
    print("GET mismatched artifact: 404")
else:
    raise AssertionError("receipt leaked through another artifact locator")

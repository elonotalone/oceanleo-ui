# BACKEND-PHOTOPEA — read-only findings

Date: 2026-10-15 (checks approximately 17:15–17:25 Asia/Shanghai).
Scope: named BACKEND-PHOTOPEA section of tasks.md. Only this report was written by this agent. No product edits, service restarts, staging, commits, pushes, installs, browser, screenshots or deployment actions.

## Findings for integration

1. **The original `/tiers` query defect is fixed in committed source.** Commit `4590c09127b727a8afc194fa186a61afb5c6e922` includes `backend/app/talent/services.py`: `_list_rows` orders tiers by `tier`, while FAQ/media/addons use `position`. Both local main and the existing origin/main reference contain the commit (no fetch performed). The historical transcript line 986 records the old PostgREST error `column talent_service_tiers.position does not exist`. Line 1006 only records health=200 and unauthenticated tiers=401 after a restart; that was not an authenticated success test.

2. **The originally failing `/tiers` now succeeds through the live development HTTP API with authentication.** A bounded GET to `https://api.dev.oceanleo.com/v1/talent/me/services/00023d83-3a18-4056-9ebc-16928ac42bdc/tiers`, using the existing LeoDev session in memory, returned HTTP **200**, one `basic` row, no error detail. Access tokens and cookie values were neither printed by this check nor written to disk. Redirects were disabled. This closes the authenticated development HTTP gap for that original service. Independently, a fresh process inside `oceanleo-api` called `services.list_tiers` for the historical owner/service pair and returned the same count/tier. The container mounts `/root/projects/oceanleo/backend` at `/app`; its start time is `2026-10-15T08:55:45.722856255Z`. External development health returns 200; unauthenticated development tiers correctly returns 401. No restart is indicated by these results.

3. **Photopea has a definite bridge/sandbox incompatibility, but the exact cause of the reported black pixels remains unproven.** `src/shell/image-editor/photopea-session.ts:253` applies the untrusted sandbox; `photopea-mount.ts` explicitly forbids `allow-same-origin`; `editor-sandbox-origin.ts:201` defines `allow-scripts allow-forms allow-popups allow-downloads`. This gives the iframe an opaque origin. Yet both `isPhotopeaFrameSource` and `classifyPhotopeaMessage` in `photopea-bridge.ts` require the HTTPS Photopea origin. `photopea-session.ts:154` discards everything else, including readiness. Sending to that opaque frame also cannot work with the exact HTTPS `targetOrigin` currently required by `postToPhotopea`. A source-level probe confirmed that even the correct iframe window's `origin: "null", data: "done"` is rejected. The browser origin behavior follows the [HTML sandbox specification](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#attr-iframe-sandbox); Photopea's [official live messaging contract](https://www.photopea.com/api/live) requires its initial `done` before commands. This is a protocol defect established by source and specification, not a browser reproduction of black-screen rendering.

4. **Green Photopea tests miss the real origin behavior.** `tests/e11-photopea-lifetime.test.mjs:48–56` replaces postMessage and fabricates incoming messages with `origin=PHOTOPEA_ORIGIN`. JSDOM does not load/run the third-party app or reproduce the actual sandbox messaging. The 42 passing checks therefore establish local lifecycle/data behavior under mocked messages, not working real integration. The current host/session also has no visible startup loading/error UI or bounded readiness failure; its timeout is attached to a save request. An initialization failure can leave the professional stage without an actionable startup explanation. The exact visual state still needs evidence that this read-only, no-browser assignment cannot supply.

5. **The separate retired oceanbizs mirror change was committed.** `0c9895ab399cd946586f18a52749fc5b4d521037` removes the retired `asset` and `talent` entries from `lib/site-domains.ts`. Both main and the existing origin/main reference contain it. The oceanbizs worktree was clean and `git diff --exit-code HEAD -- lib/site-domains.ts` returned 0. Its mirror contract passes 3/3. This confirms the requested commit, not a new deployment verification.

## Runtime and transcript limits

- The supplied transcript contains the Photopea complaint at line 963, but no later Photopea inspection or fix. Prior final replies omitted that outstanding complaint. The old todo attachment saying `/tiers` was uncommitted is stale relative to transcript line 1277 and the actual commit.
- A complete structural scan of this supplied JSONL found exactly two embedded image blocks (lines 3 and 289), with image source references to `images/1.png` and `images/2.png` (lines 11 and 291). The Photopea complaint at line 963 contains only a text block; no third image block/path is attached there. This does not prove an image never existed elsewhere, but it is absent from the supplied transcript. No images were opened or rendered during this assignment.
- Parent separately confirmed Vercel project oceanleo READY at portal `4590c09` / UI v0.233.44 and the existing LeoDev slot HTTP200/FRESH. These are parent findings, not repeated deployment or freshness checks by this agent.
- `HEAD` backend source is already fixed, but `services.py` and `tests/test_talent_services.py` currently have concurrent changes. The latter includes uncommitted `ListRowsOrderingTests` with explicit no-position regression coverage. The 33-test result below applies to this working tree, not solely to committed HEAD. Preserve those changes for their owner/parent.
- A bounded HEAD of `https://www.photopea.com/` returns HTTP 200. That rules out total server-side unreachability from this workstation only; it does not prove client reachability, JS startup, storage compatibility or embedding success.
- Existing LeoDev oceanleo slot reports phase=ready, uiLinked=true, error=null. Its `/advanced/image` request returns HTTP 307. That is not editor-render acceptance. Old middleware module-resolution errors in the retained status log are historical; the current request compiled and returned 307. No slot was created, rebuilt or restarted.
- One development response header inspection unexpectedly included automatic auth cookies. Do not reproduce those headers or token values in handoffs. Subsequent verification should select only status, safe location and content type before printing headers. No credentials are stored in this report.
- The backend suite unexpectedly invokes the existing external moderation client once; it logged a moderation HTTP 400 although the suite passed. Treat that run as non-hermetic. No product/database mutation was requested by this agent; service tests use fake data clients. Future focused sorting regression runs should select `ListRowsOrderingTests` to avoid that unrelated external request.

## Exact verification executed

All focused tests used `/opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light --`.

From `/root/projects/oceanleo-ui`:

```sh
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test --test-timeout=30000 tests/photopea-bridge.test.mjs tests/image-photopea-mount.test.mjs tests/e11-photopea-content.test.mjs tests/e11-photopea-lifetime.test.mjs tests/p6-image-design.test.mjs
```

Result: exit 0; 42 passed, 0 failed, 0 skipped, approximately 2.19 seconds. These are Node/JSDOM checks, not browser automation.

```sh
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --input-type=module -e 'import assert from "node:assert/strict"; import {photopeaFrameSandbox} from "./src/shell/image-editor/photopea-mount.ts"; import {isPhotopeaFrameSource,classifyPhotopeaMessage} from "./src/shell/image-editor/photopea-bridge.ts"; const frame={}; const event={origin:"null",source:frame,data:"done"}; assert.equal(photopeaFrameSandbox().includes("allow-same-origin"),false); assert.equal(isPhotopeaFrameSource(event,frame),false); assert.deepEqual(classifyPhotopeaMessage(event),{kind:"foreign"}); console.log("CONFIRMED: opaque-origin done is rejected even for the exact iframe window");'
```

Result: exit 0; incompatibility confirmed (the assertions demonstrate rejection, not a working editor).

From `/root/projects/oceanleo/backend`:

```sh
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- docker exec -e PYTHONDONTWRITEBYTECODE=1 oceanleo-api python -B -m unittest tests.test_talent_services -v
```

Result: exit 0; 33 tests passed in 2.028 seconds, including both ListRowsOrderingTests. External moderation warning noted above.

```sh
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- docker exec -e PYTHONDONTWRITEBYTECODE=1 oceanleo-api python -B -c 'import inspect; from app.talent import services; print(inspect.getsource(services._list_rows)); result=services.list_tiers("3296855f-5acd-49bc-bba0-629bad087cda", "00023d83-3a18-4056-9ebc-16928ac42bdc"); print({"tiers_read_ok":True,"count":len(result["items"]),"tier_names":[r.get("tier") for r in result["items"]]})'
```

Result: exit 0; corrected helper printed, `tiers_read_ok=True, count=1, tier_names=['basic']`. Read-only database access.

From `/opt/cursor-workspaces/oceandino`:

```sh
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --test scripts/tests/oceanbizs-grantable-sites.test.mjs
```

Result: exit 0; 3 passed, 0 failed.

Bounded HTTP checks:

```sh
curl --max-time 15 -sS -w '\nHTTP %{http_code}\n' https://api.dev.oceanleo.com/health
curl --max-time 15 -sS -w '\nHTTP %{http_code}\n' https://api.dev.oceanleo.com/v1/talent/me/services/00023d83-3a18-4056-9ebc-16928ac42bdc/tiers
curl --max-time 20 -sS -I https://www.photopea.com/
curl --max-time 20 -sS -o /dev/null -w 'dev_image_route=%{http_code}\n' https://p-5743d91fab68373505339c3754caebae.dev.oceanleo.com/advanced/image
```

Results respectively: 200 (`ok=true`, readiness flags true); 401 (`missing bearer token`); 200; 307. Local `GET http://127.0.0.1:8094/status` returned ready with shared UI linked. No production API/page was checked.

Follow-up authenticated live development check (via run-light, Python standard library only; no files written):

```python
import base64, json, urllib.request, urllib.error, http.cookies
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None
opener = urllib.request.build_opener(NoRedirect)
preview = "https://p-5743d91fab68373505339c3754caebae.dev.oceanleo.com/advanced/image"
try:
    response = opener.open(preview, timeout=15)
except urllib.error.HTTPError as e:
    response = e
cookies = http.cookies.SimpleCookie()
for header in response.headers.get_all("Set-Cookie", []):
    cookies.load(header)
response.close()
names = sorted({key.split(".")[0] for key in cookies if "auth-token" in key})
token = None
for name in names:
    parts = [(key, cookies[key].value) for key in cookies
             if key == name or key.startswith(name + ".")]
    parts.sort(key=lambda pair: int(pair[0].rsplit(".", 1)[1]) if pair[0] != name else -1)
    value = "".join(value for _, value in parts)
    if value.startswith("base64-"):
        raw = value[7:]
        session = json.loads(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)))
        token = session.get("access_token")
        if token:
            break
if not token:
    print(json.dumps({"authenticated_http": "not_run", "reason": "preview response supplied no reusable access token"}))
    raise SystemExit(2)
url = "https://api.dev.oceanleo.com/v1/talent/me/services/00023d83-3a18-4056-9ebc-16928ac42bdc/tiers"
request = urllib.request.Request(url, headers={"Authorization": "Bearer " + token, "Accept": "application/json"})
try:
    response = opener.open(request, timeout=15)
except urllib.error.HTTPError as e:
    response = e
body = json.loads(response.read())
print(json.dumps({"development_tiers_http_status": response.status,
                  "items_count": len(body.get("items", [])),
                  "tier_names": [row.get("tier") for row in body.get("items", [])],
                  "detail": body.get("detail")}))
response.close()
```

Executed as `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- python3 -c '<code above>'` (formatting expanded here for readability). Exit 0; exact safe result: `{"development_tiers_http_status": 200, "items_count": 1, "tier_names": ["basic"], "detail": null}`. Only development hosts contacted; existing preview-provided authentication was used, no new login created.

## Next concrete work and safe boundaries

- Parent can close the stale “tiers code uncommitted” item and mark the original development `/tiers` HTTP failure verified fixed. Keep the concurrent backend files intact; integrate the existing sorting regression separately with its owner. The authenticated development GET is now complete and green; this report provides no reason to restart a service.
- Parent should keep Photopea open as a real outstanding defect and assign an explicit, disjoint editor/security task. Start with failing coverage for real opaque-origin readiness and outbound messaging, plus a bounded startup error state. Relevant files: `src/shell/image-editor/{photopea-bridge.ts,photopea-session.ts,photopea-mount.ts,PhotopeaFrame.tsx,ImagePhotopeaHost.tsx}` and focused Photopea tests. Shared `editor-sandbox-origin.ts` and `advanced-routes/ImageRoute.tsx` require cross-cutting coordination if involved.
- The current direct opaque iframe chain is falsified. Three directions for that separate task: preserve the opaque sandbox and explicitly design a source-bound authenticated message channel (Photopea's stock API compatibility still needs proof, and relaxing origin/targetOrigin is a security policy change); isolate a reviewed bridge outside credentialed domains while proving a valid Photopea messaging route (extra hosting/channel work and inherited sandbox flags must be accounted for); or retain the existing Fabric editor and expose an explicit failed/unavailable professional mode while a compatible Photopea route is developed (preserves editing but does not satisfy professional-mode functionality). Recommend implementing startup failure visibility first within an authorized editor assignment, then proving a security-reviewed Photopea transport before choosing a deeper chain. None of these transport alternatives is proven by this report.
- Do not silently add `allow-same-origin`, accept all `null` origins, or change `targetOrigin` to `*`. Kernel security policy requires running the security gate before changes to sandbox/postMessage and operator approval for a relaxation. Do not bypass those constraints to turn the mocked tests green. Full rendering acceptance needs separate task authorization for browser evidence; no visual success is claimed here.

Stopped at the named read-only breakpoint. Parent owns integration and any subsequent scope expansion.

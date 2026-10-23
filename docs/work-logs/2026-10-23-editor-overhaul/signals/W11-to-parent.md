# W11 → parent

## 2026-10-23T05:20Z — LeoDev slot hangs: session proxy upstream pool is full (blocks every browser scenario)

[实测] `https://p-511af16886fbb22b5ab2367528b458ba.dev.oceanleo.com/library` (and `/`, `/favicon.ico`): TLS connects in ~40 ms, then no first byte for 120 s (curl exit 28). The harness `gotoApp` times out at 150 s.

[实测] Path is Caddy → `operator-session-proxy.mjs` (:8098, pid 2619537) → controller gate (:8095).
- `curl http://127.0.0.1:8095/library -H 'Host: p-511af….dev.oceanleo.com'` → 200 in 0.12 s (gate and dev server are fine).
- `curl http://127.0.0.1:8098/healthz` → 200 (proxy process alive).
- `ss -tnp | grep pid=2619537` → exactly **64** connections to :8095. `operator-session-proxy.mjs` builds `new http.Agent({ keepAlive: false, maxSockets: 64 })`, so the pool is saturated and every new request waits in the agent queue indefinitely.

Likely cause: long-lived requests (HMR / streaming) from the wave's concurrent Chromium sessions hold all 64 sockets.

I did not restart or bypass anything (the proxy is the cookie firewall; red line 5 + 8). Needs parent action (e.g. raise `maxSockets` / exempt long-lived streams / restart the proxy per its runbook). W11 continues code work and will retry the browser scenarios.

**Resolved 05:25Z by parent** (pool raised to 512, proxy restarted). No action needed.

## 2026-10-23T09:00Z — two backend items (not W11 files)

1. **`POST /v1/media/import` → 500** for the video editor's grant re-host (acceptance account, root 16cfec58…, 08:22:21Z).
   [实测] gateway log: `ERROR:oceanleo.media_proxy:[media-import] typed artifact registration failed (AttributeError)`; rehost itself succeeded (it reached typed registration). The broad `except Exception` in `media_proxy_router.import_media` hides the traceback.
   [实测] calling `typed_upload_service.register` in the container with spec'd mocks for repository + artifact service returns fine, so the AttributeError is inside `TypedArtifactService.register_upload` / `SupabaseTypedArtifactRepository.register_upload` (W04 area) or the real `prepare_upload_blob` result.
   W11 does not depend on it any more: `video-editor/grant-heal.ts` falls back to a freshly signed grant and heals again on each open. Fixing import makes the stored project durable.
2. **Export ignores flip.** `oceanleo/convert/timeline.py` (parent) has no hflip/vflip; the editor now exposes `flip-x` / `flip-y` (clip fields `flip_x` / `flip_y`, preview applies them before rotation). Patch (same order as preview: flip → rotate):
   - video chain, right before `if abs(rotation) >= 0.01:` (≈ line 344): `if clip.get("flip_x") is True: chain += ",hflip"` / `if clip.get("flip_y") is True: chain += ",vflip"`
   - image chain, after `image_chain = f"[{idx}:v]scale={target_w}:-2,format=rgba"` (≈ line 428): same two lines with `image_chain`.

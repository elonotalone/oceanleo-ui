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

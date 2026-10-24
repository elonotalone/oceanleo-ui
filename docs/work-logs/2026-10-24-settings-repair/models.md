# Model selection repair task

Own src/pages/ModelCapabilityMarket.tsx, model-specific helpers/tests and only if necessary backend model_groups/catalog/byok chain in /root/projects/oceanleo. Read live kernel, bootstrap, oceanleo pack and byok-sealed-cookie map. Investigate configured BYOK connections absent from All providers and model list. Ensure configured custom connection models appear and are selectable with correct connection identity and no paid fallback; investigate loading groups latency and fix blocking/repeated requests in owned chain. Never print credentials or copy cookies/secrets. BYOK is sealed cookie only; no persistence of secrets. Do not touch auth origin/cookie/CORS trust boundaries. Parent owns general performance and shared typecheck. Other agents own projects/PayerSelector and connectors. No browser, production API, deploy/push, dependency install or broad suite. Focused meaningful tests via IO guard. Return concrete root cause, changed files and results. Do not commit product edits.

## Completed 2026-10-24

- Provider filters used only vendor IDs, hiding named BYOK accounts behind OpenAI/custom vendor rows. Added per-connection filters without rewriting model routing keys; search includes account alias and upstream model ID.
- Stale model-group availability requests can no longer replace a newer saved group payload.
- Catalog built identical offer rows repeatedly and classified models 30,233 times in profiling. Resolve rows once per version and share their capability classification across tiers; reuse immutable platform preset cache for model-group reads. Personal connections remain appended only to request copies.
- Focused UI tests: model-group-manager + model-market-search, 18/18 pass. Backend unittest test_model_market_catalog: 16/16 pass. Two old assertions demanded automatic BYOK prepend and paid fallback; baseline HEAD failed identically, assertions now enforce current explicit binding/no-paid-fallback contract.
- Isolated dev-container measurement: catalog cold 1.306s, warm 0.094s, all three presets 0.003s (990 offers). Earlier pre-change isolated run measured cold 17.100s and warm 15.498s; runtime HTTP verification belongs to parent after dev gateway restart.
- Changes: UI ModelCapabilityMarket.tsx, model-search.ts and their two focused test files; gateway backend/app/model_catalog.py and backend/tests/test_model_market_catalog.py. No production changes, credentials, browser, or push.

## Compression integration follow-up

- Parent measured warm HTTP transfer still slow: catalog JSON is 2,236,065 bytes. Added gzip only to backend/app/routers/catalog_router.py catalog response, negotiated by Accept-Encoding including explicit q=0 refusal and wildcard support. Vary includes Authorization/Cookie/Accept-Encoding; personal response remains private, no-store. No global middleware or streaming/SSE changes.
- Exact payload equality after decompression verified. Output is 126,890 bytes (94.3% smaller), warmed compressed request calculation 0.190s in dev container.
- Backend model-market focused suite now 17/17 passes; negotiation tested both authenticated and anonymous. Parent owns dev restart and public compressed HTTP verification.

# Google return hang — implementation task book

Owner: child `oauth_recovery`; parent owns integration, HTTP verification and user communication.

## Outcome and scope

The operator's LeoDev Google return remains forever at Processing with a code
in the URL. Fix callback completion and bounded failure/retry in shared UI.
Only edit src/lib/auth/client.ts, src/lib/auth/oauth-return.ts,
src/lib/auth/auth-fetch.ts if needed, tests/helpers/preview-oauth-worker.mjs,
src/lib/auth/preview-cookies.ts for removal of obsolete session chunks on callback replacement,
tests/dev-preview-google-callback.test.mjs, tests/auth-dialog.test.mjs,
focused new auth regression tests and docs/architecture/settings-auth-boundary.md.
Do not alter cookie/CORS boundaries, external services, settings, dependencies,
unrelated dirty changes, other repositories, or publish anything.

## Evidence already collected

Prior turn left the current dirty changes in this cluster; preserve them.
Parent read full prior conversation. Current screenshot is a code-bearing
/settings/account on p-511af16886fbb22b5ab2367528b458ba.dev.oceanleo.com.
Read-only flow-state records confirm unconsumed Google codes at 09:34 UTC.
Real dev bundles serve installed @supabase/auth-js 2.108.1 and ssr 0.12.0.

Parent added one regression and worker expiredSession fixture. The focused test
`Google 新登录先兑换回执，不能被旧会话的续期请求永久堵住` FAILS after 15s on
current code: initialize() never completes; new Google exchange cannot start.
Do not repeat the pre-fix run. Worker seeds an expired existing session and
holds its refresh request forever. Other four existing Google tests passed in
previous turn, but omitted this case. Fixture service data is synthetic only.

Current client disables detectSessionInUrl for preview codes, then calls manual
exchangeCodeForSession, which first awaits SDK initializePromise. initialize
recovers/refreshes the OLD session before the new code, so an old stalled refresh
prevents new login. oauth-return.ts has no timeout. Also consider coordinator
module reset/client caching, missing proof, provider errors and actual network
requests hanging. No real user code/session may be consumed or copied.

## Direction and proof

Read installed SDK source, especially initialize/_getSessionFromURL/exchange,
before changing. Prefer one SDK callback owner with callback taking precedence
over unrelated old-session recovery. Compare this to explicit-exchange-only
and a separate auth service in existing architecture doc BEFORE production code.
Keep missing-proof errors explicit, one exchange with concurrent readers,
clean retry URLs, bounded pending UI, no stale completion clobbering a new attempt.
Do not merely add a spinner timeout or disable synchronization/security. Account
for late successful responses safely. Preserve native/non-preview behavior.

## Verification and handoff

Bootstrap. Use run-light for focused tests, run-heavy for typecheck. Keep tests
meaningful, use real SDK with synthetic identity network; no browser permitted
until parent sends explicit approval. Parent has an unanswered request pending.
Run Google callback suite and focused additions plus auth-dialog regressions.
Parent will independently typecheck and run integrated auth tests and freshness.
Return files, exact change, tests/results and limitations. Do not commit or push
product changes; parent integrates. Send intermediate evidence promptly.

Integration follow-up: callback getAll hides old token chunks. Ensure a shorter
replacement session removes hidden obsolete chunks before merging, otherwise
SDK reload may concatenate a stale tail. Add real-SDK large old session to
shorter chunked new session regression. Ownership extended to preview-cookies.ts.

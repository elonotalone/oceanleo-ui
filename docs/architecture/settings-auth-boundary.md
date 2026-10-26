# Settings authentication boundary

2026-10-26: clicking the signed-out sidebar's Log in button must show the
existing AuthPanel. Account controls may mount only after a session is confirmed.

The defect was `checked && !signedIn`: while the Supabase session read was
pending, SettingsHub fell through to AccountSection with an empty profile.
A rejected read also left that state in place. The sidebar already routes
signed-out clicks to the shared settings account host; no new route is needed.

Considered paths, all using the existing React / Next.js / Supabase integration:

| Path | Guarantee and fit | Moving parts / failure mode | Decision |
| --- | --- | --- | --- |
| Render AuthPanel until positive session evidence | Existing credentials, OAuth and MFA flow; works in the browser and native settings host; no new services or resources | A returning user's form can appear briefly while the session hydrates | Use this path |
| Wait for the session before choosing the panel | Avoids a brief login form for returning users | A delayed or failed session read blocks the requested login UI | Reject |
| Redirect to a new login route | Next.js can host the same form | Adds routing and return-location state across consumers without fixing the account host's boundary | Reject |

Falsifiable assumption: a pending identity read currently mounts account
controls before any authenticated user is known. The focused SettingsHub
regression opens the same account overlay with deferred identity promises and
checks the rendered DOM, then exercises successful login and sign-out. It also
covers rejected reads and sessions without an email address.

Identity read failures retain any confirmed mounted session; an initial unknown
session keeps the login form. The change does not alter session storage,
refresh locks, cookies, domains, providers, or entry URLs.

Verification: the deferred-session overlay regression failed before the fix
(`不能等会话查询完成才显示登录表单`) and passed afterwards. All 67 focused tests
across settings-hub, account-settings-routing, auth-dialog and eas-w05-account-menu
passed, as did `leo-pnpm typecheck`. The operator's existing LeoDev account URL
returned HTTP 200; its served settings chunk contains the new positive-session
guard. The freshness check reported one FRESH(dev) slot and zero STALE slots.

## LeoDev login follow-up

The form-only fix above did not establish that the operator could sign in.
The subsequent investigation checked the actual identity service: public
settings returned 200, the preview origin's password preflight returned 200,
and the real client returned `Invalid login credentials` in 90 ms for an
intentionally invalid diagnostic identity. Management configuration reports
`security_captcha_enabled=false`; no server authentication setting was changed.

The email form separately requires a successful website Turnstile callback
before it lets anyone enter a password. A failed or unavailable widget leaves
Continue disabled without an error. This is an additional concrete login
blocker, independent of the earlier empty-account rendering defect.

For the capability preview hosts, compare the existing website widget (depends
on external script and hostname registration), an explicit preview client
exception (same GoTrue credentials/MFA and server policy, no new resources),
and a dedicated preview widget (extra deployment credentials and hostname
maintenance). Use the explicit preview exception, as native hosts already do
for website-only verification. Keep the real website's existing widget and
all server policies. A future required server CAPTCHA must still fail closed.

Falsifiable condition: on a real `p-<32hex>.dev.oceanleo.com` URL, the current
client requires the website CAPTCHA even though the shared identity service
does not. The focused host test must reject that condition and retain the
widget on ordinary website hosts and lookalike domains.

The preview regression failed before the change and passes afterwards.
`auth-captcha.test.mjs` passes all 14 cases, and the existing AuthDialog,
SettingsHub and preview-storage cases pass. The new
`dev-preview-login-flow.test.mjs` runs the real form, client and Supabase SDK
through one password request, successful session storage, a fresh client
restoring that session, and local sign-out. Only the identity HTTP response
uses a synthetic account fixture; this is not evidence of a real operator
account successfully signing in. Typecheck passes. The original preview
returns 200 and serves the new CAPTCHA branch; the slot is FRESH(dev).

At that checkpoint the operator's specific failure stage had not been
provided. The Google-return screenshots below subsequently identify it;
the CAPTCHA blocker was not a sufficient explanation of the report.

## Google return (screenshots at 09:04–09:07 UTC)

### Callback precedence repair

The installed auth-js 2.108.1 initializes automatic PKCE returns before old
session recovery. Explicit exchange instead awaits initialization, which can
hang refreshing an unrelated expired session. Use the SDK's automatic callback
as the sole exchange owner and observe initialization for the visible result.
Explicit exchange cannot provide that precedence; a separate auth service adds
routes and credentials without addressing it. Missing proof must produce an
explicit error before readers touch the old session. Bound the PKCE transport
and coordinator wait; discard late transport responses so they cannot write a
session after a retry. Keep native and ordinary website behavior intact.

Callback clients hide the unrelated prior session from SDK reads until a new
login saves its session; the stored prior session is not erased. This also
prevents SDK initial subscriptions from starting a stale refresh after callback
failure. The normal SDK automatic refresh and visibility lifecycle stays on.
The callback transport bounds response headers and body to 10 seconds; the
coordinator bounds initialization to 12 seconds and cancels that transport.
Superseded attempts cannot publish state or clean a newer attempt's URL.
Because SSR cannot enumerate hidden prior chunks, the first replacement session
write also removes obsolete prior session cookie names before merging the new
chunks. A focused real-SDK regression replaces an 18,000-character old profile
with a still-chunked 5,000-character profile, validates the combined stored JSON,
and restores the new identity in another independent page (1 case passed).

The focused real-SDK Google suite and AuthDialog pass 42 cases, including the
previously failing expired-session case, missing-proof recovery with an expired
session, provider denial, hung headers, hung body, and discarding late success
after retry without removing the new proof. The separate coordinator ownership
regression plus AuthDialog pass 34 cases. These synthetic tests do not establish
successful sign-in in the operator's browser; integrated typecheck, HTTP checks
and preview freshness are owned by the parent verification step.

The supplied screenshots specifically show a Google PKCE `code` returning to
the preview account route and remaining in the address bar while the login
form reappears. Read-only identity flow-state records confirm four successful
Google authorizations using s256 with unconsumed codes. Two retries included
the prior `code` in their return URL. A normal real-SDK round trip passes;
the missing test was a proof disappearing from the shared mutable session
overlay between departure and return.

Compare: keep automatic SDK URL detection (silently ignores a code when its
proof is missing), explicitly coordinate one SDK exchange and publish its
pending/error state (existing Supabase PKCE and browser storage, no service
or credential changes), or add a separate hosted login service (new routing,
cookies and deployment). The earlier attempt selected the explicit SDK
coordinator; the callback-precedence repair above supersedes that exchange
ownership while keeping its visible pending/error state. Save only the
in-flight verifier separately per tab so unrelated session-overlay writes
cannot erase it; preserve existing sessions and the family-cookie boundary.
Strip old auth-return parameters when starting another provider attempt.

The independent-page regression overwrites the shared session overlay between
Google departure and return. Before the fix the SDK makes zero exchange
requests and silently renders the guest again, matching the supplied symptom.

Verification after the Google fix: the two regressions fail before the change
and pass afterwards. Independent JS realms simulate leaving for Google and
returning to a fresh page, using the real SDK, s256 verifier/challenge checks,
and a synthetic GoTrue token response. Tests cover exactly one exchange with
eight concurrent identity readers, session-overlay replacement, missing proof,
clean retry addresses, and visible pending/error UI. The 93-case focused auth
run and typecheck pass; preview-storage and email SDK integration also pass.
The existing capability URL returns 200 and its served chunks contain the
new exchange coordinator, per-tab proof storage and pending UI. Freshness
reports one FRESH(dev) slot and zero STALE slots. No real Google account was
used by the automated fixtures; no operator code or session was consumed.

## Final integration verification — Processing follow-up

The parent independently reproduced the pre-fix hang with the real SDK and an
expired synthetic session whose refresh never resolves (15-second test timeout).
After repair, 62 integrated auth/storage/settings tests and 44 callback/dialog/
coordinator tests pass; final `leo-pnpm typecheck` passes. The rendered real
SettingsHub + AuthPanel regression holds the PKCE response, observes Processing,
releases it, checks the confirmed account email and clean URL, then signs out
and sees the login form again. A fresh realm restores the replacement chunked
session without another exchange. Identity HTTP alone is a fixture.

The original LeoDev account page and its served auth bundle return 200 and
contain callback precedence, bounded headers/body handling and obsolete chunk
cleanup. The real token endpoint rejects a synthetic invalid diagnostic code
with `flow_state_not_found` in 80ms and allows the exact preview origin; no real
operator code is used. Final freshness check reports one FRESH(dev), zero STALE.
These checks establish the repaired code paths, not a completed Google login
in the operator's own browser. No browser automation was run without approval.

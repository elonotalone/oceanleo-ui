# Parent analysis — LeoBay, 2026-10-23

## Confirmed user-visible causes

The original Bay list toggle only forced grid columns to one in
`LeoBayPage.Browse`. Asset, app and lesson cards retained their internal cover
and vertical layout. A grid tile therefore grew to the whole content width;
it never became a Library list row. The original workspace card/row module
used 4:3 covers, 12px titles/10px metadata and individually bordered 64x48px
rows. Portal Library uses 16:9 covers, 13px/11px text, and 36px square thumbnails
in a single divided list. Matching only the grid column count could not meet
the operator's request. All consumer paths must use the shared item components.

The original dashboard starts with eleven independent statistics, followed by
three independent time-series plots and a separate income-share donut. It has
no primary plot or shared date readout. The operator reference source is
oceandino `front/components/admin/SiteAnalyticsCard.tsx`: a shared time range,
one plotting area and in-place chart mode changes. The solution puts income,
new users and opens together with labelled independent money/count scales;
categorical product totals use the same plot when selected. Exact monetary
values and actionable counts remain available. There is no daily per-product
series in the API and none is invented.

## Manage work: purpose and fault boundary

`src/shell/bay/apps/AppManagePane.tsx` is the AUTHOR management page for one
website/application listing, not a generic file or task manager. Its seven
implemented tabs are feedback, visitor login, pricing, release notes, errors,
traffic sources and public endpoint. Only the author can enter. It first loads
`GET /v1/bay/apps/{id}`; failure here replaces the entire contents before the
seven tabs mount. Screenshot has exactly this outer error presentation.

The literal Chinese screenshot message originates from `authed` in
`src/lib/agent.ts`, where any rejected fetch becomes status 0 and the generic
“cannot connect to AI gateway” text. That cannot distinguish connectivity,
TLS, a rejected browser cross-origin request, or another fetch-level failure.
There is no HTTP status/correlation identifier displayed to narrow it down.
The exact Chinese message has no current translation entry, explaining its
appearance in the otherwise English page. `PaneMessage` displays only the
error sentence and Retry with px-4/py-12, removing object identity/navigation.

Read-only current runtime evidence:

- Developer gateway `/v1/bay/apps?limit=1`: HTTP 200, empty public shelf.
- Registered database has two external draft listings, both untitled; no
  published application listing. No records were edited or created.
- `/v1/bay/apps/<actual draft id>` and public feedback/access/release reads:
  HTTP 404 for an anonymous caller, the intended private-draft visibility.
- Login/errors/sources/endpoints/dashboard owner reads: HTTP 401 anonymously,
  rather than a missing route. All nine checks returned the exact current
  LeoDev origin in Access-Control-Allow-Origin.
- Authorization preflight on the actual draft route: HTTP 200, authorization
  header permitted, credentials supported for that exact first-party preview.
  CORS policy was not changed.
- Current LeoDev process targets `https://api.dev.oceanleo.com`; local gateway
  health reports ready. No matching Bay 500/exception found in the current
  retained gateway log. This does not reconstruct the screenshot's incident.

Conclusion: screenshot confirms a failed front-end request and poor whole-page
failure handling; it does NOT prove seven missing/broken subroutes or establish
the underlying network cause. There is no captured failing URL/HTTP response
from the screenshot, so that incident is not reproduced or claimed fixed.

## Why the pages feel unfinished

Evidence supports inconsistent object presentation, excessive vertical chart
stacking, and page-wide context loss on errors. Generic Manage work wording
also obscures that it controls one published site/application. These are
coherence and usable-state problems. More decoration alone would not resolve
them. Collection consistency and one primary chart are implemented in this
task; management-page naming, persistent object header/tabs, localized
actionable errors, differentiated empty/loading states and isolation of a
failed tab remain design recommendations, not completed changes.

## Verification boundaries

No browser, screenshot capture, Playwright or production/twin deployment was
used. Existing operator-provided PNG was inspected. Development HTTP checks,
native React SSR/JSDOM interactions and typechecks supply the stated evidence;
they are not a browser visual acceptance.

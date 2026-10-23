# LeoBay collections and dashboard — 2026-10-23

## Operator outcome

The development portal must show exactly the Library collection format on Bay,
Library, Workspace and Projects. List means a compact thumbnail row, never a
full-width grid tile. Bay's dashboard opens with one substantial interactive
chart combining income, new users and opens, with product breakdown available
in that same plotting area. Explain Manage work and diagnose the supplied
gateway-error screenshot. Work finishes in LeoDev; no production/twin push.

Evidence: `/root/oceanleo-inbox/20261023T075324Z-image.png` shows Manage work
failing before its tabs. `LeoBayPage.Browse` changes columns with descendant
CSS instead of rendering list rows. `ArtifactLibrary` is the operator's visual
standard: 16:9 covers, 13px medium titles, 11px metadata; list has 36px square
thumbnail, px-4 py-3, divider lines inside one rounded border. Workspace uses
4:3, 12px/10px and separate bordered rows. DashboardPane renders eleven tiles,
three LineCharts and one DonutChart in sequence. Reference page is backed by
oceandino `front/components/admin/SiteAnalyticsCard.tsx` and its chart children;
HTTP text tools could not open its authenticated page, so source was inspected.

## Direction and alternatives, before implementation

1. Reuse React + native HTML/SVG already used by both applications. A shared
   React card/row module preserves Library's format; every consumer supplies
   content and callbacks only. One SVG plot supports separate money/count
   axes, pointer/keyboard readout and optional product mode. Browser-native,
   interoperates with React/Next hydration, no install/build infrastructure;
   failure modes are inconsistent callers and incorrect axis/empty handling.
2. Share Tailwind constants only and retain per-surface markup. Mature CSS
   tooling and cheap at runtime, but cannot guarantee identical structure;
   today's column-only fix demonstrates the drift. Rejected.
3. Introduce another collection library and use ECharts for the dashboard.
   Mature tools (ECharts already installed), documented React effect mounting,
   but adds another lifecycle/bundle surface for a small native chart and does
   not by itself unify cards. Rejected for this change.

Invalidating assumption: the existing React runtime can render reusable row
markup and an accessible responsive SVG without a browser-only dependency.
Host `run-light -- node` proof passed using React DOM server (rowBytes=98,
plotBytes=101). Data contract already supplies daily income/new_users/opens
and product totals. Never invent daily product data or put money and counts
on one unlabelled numeric scale.

## Ownership, all units dispatched together

- W1 collection foundation and non-Bay consumers: `W1-collections.md`.
- W2 Bay collection consumers: `W2-bay-collections.md`.
- W3 Bay dashboard: `W3-dashboard.md`.
- Parent: diagnosis of Manage work (read-only), cross-owner contracts,
  verification, generated CSS, final local commits and LeoDev freshness.

All implementation owners bootstrap and read the live kernel and relevant
packs. No browser, screenshots, Playwright, unrelated file edits, dependency
changes, production operations, broad git staging, or pushing. Existing dirty
PDF/editor/workflow/package/lock changes belong to other work. Parent owns
package-wide typecheck and CSS generation; children run only focused tests.

## Shared W1/W2 interface

New module `src/shell/collection-items.tsx`, exported from shell index:
`CollectionItemCard`, `CollectionItemRow`, `CollectionItemList`.

Card and Row accept `{cover: ReactNode, title: ReactNode, metadata?: ReactNode,
onOpen: () => void, actions?: ReactNode, floatingActions?: ReactNode,
selected?: boolean, openLabel?: string}`. Card owns its 16:9 cover wrapper;
Row owns its 36px square wrapper. Caller covers fill the wrapper and must not
impose their own aspect ratio. Actions stay outside the open button. List owns
one rounded border and row separators. W1 may add optional container props
for existing data markers without changing the above interface. W2 may import
these names immediately and coordinate any needed extension through parent.

## Acceptance

Relevant focused tests including interaction/SSR checks; parent shared-package
and portal typechecks, dev HTTP routes, and `oceanleo-dev-slots-fresh.sh`.
Rebuild only genuinely stale slots. No claim of visual browser verification.


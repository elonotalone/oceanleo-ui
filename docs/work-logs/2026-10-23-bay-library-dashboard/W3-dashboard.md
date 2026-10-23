# W3 — one substantial Bay dashboard chart at the top

Read `00-dispatch.md` first. Replace DashboardPane's eleven-tile-first,
four-charts-in-a-column presentation with one primary chart at the top.
Default overview combines daily income bars with new-user and open lines;
label currency/count axes separately, truthful scale, no normalized data
represented as raw values. Time selector stays unified. Hover/focus or
keyboard readout exposes all metrics for the selected date. Income by product
may switch the SAME plot to product bars; never render a second chart below.
The reference uses one chart area and controls, integrated summary and detail
readout, not a stack of independent charts. Retain necessary exact totals and
actionable counts in compact integrated chart/footer summary, not another
large grid before the chart. Keep ProductTable below for management actions.

Owned files: `src/shell/bay/dashboard/*`, dashboard-focused tests,
`src/i18n/ui/messages/bay-dashboard-copy.ts` if essential labels need adding.
No other directories except result log. No network/data contract changes,
invented time series, dependencies, package manifests or generated CSS.
Follow host theme tokens and responsive layout. Zero/missing/single-point
datasets must show truthful geometry and accessible empty status. One chart
must retain exact values and keyboard access. Existing totals cannot be
silently dropped just because tiles are removed.

Use existing native React/SVG route (proof passed). Run meaningful focused
model/render/interaction tests through run-light, no browser. Return changed
files/tests/residual limitations and write W3-result.md. Do not commit;
parent integrates after review.

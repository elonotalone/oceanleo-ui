# W3 result — one Bay dashboard plot

Changed files:

- `src/shell/bay/dashboard/OverviewChart.tsx`: one native SVG overview with daily income bars, new-user and open lines. Left currency and right count scales remain independent and explicitly labelled; counts use integral ticks. Same plot switches to product income bars using actual product totals. No fabricated product time series.
- `src/shell/bay/dashboard/DashboardPane.tsx`: chart is the first substantive content after heading/range controls. Removed three LineChart mounts and DonutChart mount. Eleven exact totals, three previous-period comparisons and two actionable attention counts remain inside the chart footer. ProductTable and its actions remain below.
- `src/shell/bay/dashboard/StatTile.tsx`: compact footer typography and no meaningless comparison dash for totals with no comparison.
- `tests/bay-dashboard-overview.test.mjs`: native SSR and JSDOM rendering/interaction coverage.

Evidence: run-light command below passed **10/10** tests, including existing dashboard model and 17-language copy checks. New tests assert one SVG, independent money/count geometry, all-zero baseline, centered single point, accessible empty status, exact combined readout, bounded keyboard navigation, pointer selection, and same-SVG product switch. Existing translated labels reused; no dictionary additions or dependency/data/security changes.

```
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/bay-dashboard.test.mjs tests/bay-dashboard-overview.test.mjs tests/bay-dashboard-copy.test.mjs
```

Limitations/parent handoff: no browser visual verification (not authorized). Plot keeps a 640px minimum drawing width with horizontal scrolling on narrow screens so axes remain legible; its readout/controls/footer wrap independently. Data availability is unchanged, including weekly buckets for a one-year range. Parent owns package/portal typechecks, generated CSS and LeoDev freshness. Legacy LineChart/DonutChart modules remain available but DashboardPane no longer mounts them. No commit or push performed.

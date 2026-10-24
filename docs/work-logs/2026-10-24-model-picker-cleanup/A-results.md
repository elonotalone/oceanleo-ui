# A — Model selection cleanup

Implementation completed on main without commits, push, browser, server/auth changes,
package distribution or deployment. Parent owns independent verification and LeoDev.

## Changes

- `src/pages/ModelCapabilityMarket.tsx`: removed category/capability orange reason
  subtitles, both global own-Key banners, Add-key actions and vendor-key help links
  from selection/search/offers. Removed the now-unused provider-help fetch and
  routing callbacks. Empty capability panels retain only “这一类暂无可选模型”. The
  unavailable collection retains its count and expansion control, with specific
  reasons on the actual offers rather than an aggregate category reason.
- Custom `connection_id` models render no price node in selected rows, editing
  offers or search cards; no billing sentence, price placeholder, pricing rules
  or official-price link substitutes for the removed label. Connection names,
  provider/configuration identity, availability and existing checked metadata stay.
- Ordinary pricing, `canSelect`, disabled offers, selection/order/save behavior,
  actual API/save errors and BYOK settings outside this component are unchanged.
  Public helper exports and optional `onSetupByok` prop type remain compatible.
- Updated React DOM expectations in `tests/model-market-w5.test.mjs`,
  `tests/model-preset-empty-w25.test.mjs` and parent-approved additional ownership
  `tests/model-preset-no-adapter-w32.test.mjs`; helper behavior assertions remain.
- `tests/model-group-manager.test.mjs` now checks custom search-card price-node
  absence and a real DOM custom-connection scenario beside an unavailable
  `alibaba_intl` offer: custom provider filtering, enabled selection, primary/fallback
  reordering, exact saved selection, reload and selected count, unchanged display
  name, ordinary pricing, specific disabled reason and no global prompts. Save
  patch is verified to contain only selection (no settings additions).

## Verification

Bootstrap succeeded. Code-map impact resolved the absolute source path to
`oceanleo-ui`, mapped shared UI consumers. `git diff --check` passed.

Final focused command (exit 0, **35 passed, 0 failed**, 5.77 seconds):

```sh
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- node --test --test-concurrency=2 tests/model-group-manager.test.mjs tests/model-market-w5.test.mjs tests/model-market-search.test.mjs tests/model-preset-empty-w25.test.mjs tests/model-capability-contract.test.mjs tests/model-picker-byok.test.mjs tests/model-preset-no-adapter-w32.test.mjs
```

Earlier six-file run passed 33/33; added no-adapter file independently passed 2/2.
An initial six-file `run-light` attempt was rejected by the guard as heavy before
tests ran; retried through the guarded heavy lane. Final run caps concurrency at 2.
Only existing Node punycode deprecation warnings were observed.

Parent reserved typecheck, public API snapshot check, broader integration tests,
HTTP/source freshness and dev slot acceptance. Native-agent settings/auth/runtime
source was not touched. No claims of browser visual validation or backend billing
changes. Existing unrelated untracked editor/Bay evidence was preserved.

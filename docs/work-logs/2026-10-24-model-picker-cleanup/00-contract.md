# Model selection cleanup — 2026-10-24

User approved the preceding analysis and requested full implementation. One
coherent UI unit: remove repetitive category/key prompts and false custom-BYOK
billing labels in the shared model selection page, retain actual per-connection
availability/errors and correct selection persistence. No authentication change.

## Owner: picker_cleanup

Read workstation kernel, bootstrap and matching packs first. Parent model is
gpt-6.1-sol. Work on main, preserve unrelated editor evidence. No commits/push by
child; parent integrates, independently tests, commits and verifies LeoDev.

Allowed source: src/pages/ModelCapabilityMarket.tsx; directly related model
catalog translation modules only if genuinely needed; focused model tests in
tests/model-group-manager.test.mjs, tests/model-market-w5.test.mjs,
tests/model-market-search.test.mjs, tests/model-preset-empty-w25.test.mjs,
tests/model-capability-contract.test.mjs, tests/model-picker-byok.test.mjs,
and a new focused test if needed. Any other file needs parent agreement.
Result journal: docs/work-logs/2026-10-24-model-picker-cleanup/A-results.md.

## User-visible contract

- Remove category/capability-level orange boilerplate (not opened, own Key,
  adapter unavailable, unpublished prices), and large empty/category notices
  repeating the same text. Clean empty states can simply say no selectable
  models, without unsolicited Add a key actions.
- Remove BOTH global yellow own-Key banners, including the current hardcoded
  alibaba_intl condition that ignores effectiveProvider and incorrectly shows
  above an existing custom connection. No substitute banners.
- Remove Add a key calls to action from model selection/search/offer areas.
  Connection creation belongs in existing BYOK connection management; do not
  remove that settings entry or actual connection error feedback elsewhere.
- Remove '自带连接 · 厂商计费' for connection_id models, without invented rates,
  a dash price placeholder, or a replacement explanatory sentence. Suppress
  unused price space for these models across selected rows and offer cards.
- Keep actual platform pricing for ordinary models; per-offer unavailable
  state/disabled semantics; real save/API errors; primary/fallback controls;
  selected count, provider filtering, native agent settings persistence.
- Custom connection display name belongs to user; do not rewrite it, rename
  underlying models, hide relevant configuration identity or alter billing.
- No login/proxy/runtime/server changes. No browser or screenshots. No production
  or oceanbizs publish, no UI distribution/bump. Shared UI hot reload on LeoDev.

## Acceptance

Use real React DOM tests, not only source regex. Reproduce custom connection
present alongside unavailable alibaba_intl model; choose custom filter and prove
model is selectable, editable and saved, no category own-Key/Add-key banner.
Verify no category descriptions at zero-count categories; no unsupported billing
labels in custom selected rows/search/offer cards; ordinary provider prices and
specific unavailable/disabled state remain. Preserve actual failure feedback.
Update tests that intentionally mandated now-removed global notices; don't weaken
unrelated assertions or canSelect rules. Named focused tests and typecheck, guard
heavy jobs. Report exact commands/results, files and remaining boundaries.

Parent owns any public API snapshot regeneration if exports truly change, final
cross-suite checks, dev source HTTP freshness, commits and final handoff.

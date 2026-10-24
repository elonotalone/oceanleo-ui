# W3 — Local Browser Operator shared UI

2026-10-24. Ownership: oceanleo-ui only. Development source; no push, version bump, release, production request, browser launch or screenshot.

## Delivered

- `src/lib/local-browser-api.ts`: typed devices/preferences/pairings/revocation/sessions/events/control API using existing `accessToken` + `GATEWAY_BASE` bearer transport. Bounded requests, caller cancellation, no-store state reads, encoded resource identifiers. Extension ZIP fetched as authenticated bytes from `/v1/local-browser/extension.zip`, never a token-bearing URL.
- `src/pages/settings/MyBrowserPanel.tsx`: optional native browser management, explicitly separate from MCP. Install instructions, actual configured gateway address, create/copy pairing code with expiry, device online/offline/revoked status, preference/fallback controls, revocation, session state and activity, stop/takeover requests. Local consent remains extension-only. Page-content disclosure and sensitive-action/CAPTCHA limitations are visible.
- Settings integration in `ConnectorsSettingsPane`; separate chat entry in `PluginsPopover` opens connectors settings. No fabricated store links, website approval endpoint, extension credential or remote execution bridge.
- Device and activity polling aborts on unmount/selection change and clears timers. Failed refresh removes stale device-online indicators. UI distinguishes server receipt from local extension synchronization and offers immediate local stop guidance.
- Copy uses existing `useUI` dictionary transport. Chinese and English supplied; other languages currently use explicit English feature fallback (same pattern as existing feature dictionaries), not a claim of full native-language translation.

## Verification

- `run-light -- node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/local-browser.test.mjs tests/composer-plugins-popover.test.mjs`: 8/8 pass. Existing jsdom CSS parser warning for overlay `@starting-style` is non-failing.
- `run-heavy -- pnpm typecheck`: passed twice, including the final post-edit run (exit 0).
- `oceanleo-dev-slots-fresh.sh`: oceanleo dev slot FRESH(dev), zero stale; existing local UI link. No visual claim.
- `git diff --check`: clean for scoped changes.

## Protocol/integration handoff

Stable symbols: `MyBrowserPanel`, `localBrowserApi`, `downloadLocalBrowserExtension`, `LocalBrowserDevice`, `LocalBrowserPreferences`, `LocalBrowserSession`, `LocalBrowserEvent`, `LocalBrowserDevices`. Contract v1 implemented without extension credential endpoints. Parent owns navigation manifest and cross-repository verification. Browser verification remains unauthorized and unperformed.

Unrelated concurrent edits in DevicesPage/RemoteDesktopPanel/remote-desktop-input are outside W3 and will not be staged.

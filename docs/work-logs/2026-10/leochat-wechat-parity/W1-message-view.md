# W1 — Message view and person entry

Owner: one child agent. Work only in `src/shell/messages/conversation/` and focused tests for this surface. Do not edit Inbox, groups, people, backend, translations, or shared IM API/types.

Bootstrap and read the live kernel plus oceanleo and parallel-rollout packs. Preserve all dirty edits. The five relevant images are `/root/oceanleo-inbox/20261019T123106Z-image.png`, `20261019T124202Z-image.png`, `20261019T124710Z-image.png`, `20261019T124847Z-image.png`, `20261019T124923Z-image.png` (same directory). Inspect them.

Deliver: own messages on the right, incoming on the left, readable bubble styling and correct avatar/receipt placement for DM and groups. Sender name text in the transcript must not open a profile; sender avatar alone may open it. Keep keyboard accessibility and existing reactions/actions. Coordinate with W3 through parent if profile props need expansion; do not edit people files. Add only meaningful focused test coverage if needed. Report changed files, evidence, unresolved API assumptions. No browser, Playwright, screenshot, production release, push, or shared heavy typecheck.

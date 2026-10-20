# Editor repair 2026-10-21 — common

Operator: 彻底改好. Cursor subagents authorized. Parent model slug `cursor-grok-4.6-xhigh`. Use that slug; do not inherit.

Before any operation: `bash /opt/cursor-workspaces/oceandino/scripts/agent-bootstrap.sh`.
Read `/opt/cursor-workspaces/oceandino/AGENTS.md` and packs oceanleo, deploy, parallel-rollout.
Navigate from `docs/architecture/oceanleo-code-map.md` and `scripts/oceanleo-nav slice/impact`. Do not start with a `/root/projects` tree scan.

## Product contracts (parent-arbitrated, do not reopen)

1. **Autosave only after the person changed the work.** Load, hydration, collab remote, signed-URL refresh, preview raster, and the save itself must not schedule autosave. `AdvancedPersistenceController.observe` must not flush when `userEdited` is false, even if `dirty` is true or `revision` changed.
2. **Existing library items must open with their body.** A failed or unread source must not become a ready blank editor, and must not save over existing bytes.
3. **Save format matches the item.** Markdown stays `text/markdown`. Do not serialize a `.md` item as Word. Do not loosen MIME, integrity, CAS, origin, or permission checks to make a wrong payload succeed.
4. **Download icons match share/favorite:** linear ghost, not a filled circle (`IconButton variant="secondary"` + default pill).
5. **No XY (or W/H) readouts on the primary edit bar.**
6. **Delete 结构/皮肤.** They do not change the picture.
7. **Delete these image AI surfaces:** 抠图/Background removal, 放大高清 2×/4×, 人像精修, 重新打光, 扩展画面, 全景延展, Extra notes. The 1188×886 upscale math goes with them.

## Red lines

- No browser, Playwright, screenshots, UI automation.
- No production, no `oceanleo-sites-push.sh`, no promote, do not set `OCEANLEO_PRODUCTION_RELEASE_APPROVED`.
- Do not restart `oceandino-terminal-relay` or the `cursor-agent` tree.
- Never `git add -A`. Commit only explicit owned paths on `main`.
- Do not overwrite operator artifact `21c1e4d9-0818-4bbe-ae33-b4d01a5beafd`.
- Do not install dependencies or regenerate CSS / i18n barrels / public exports (parent).
- Focused tests: `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- <cmd>`. Heavy typecheck is parent.
- Do not spawn further agents.

## Journal and commit

- `signals/<ID>.md`: facts, current step, next step, exact commands. Update before each large step and after each measured result. Commit it.
- `deliveries/<ID>.md` on completion: root causes, files, commands/results, commit ids, gaps.
- Commit early and often on `main` with explicit filenames.
- Do not return unfinished work unless a concrete parent-only blocker is written to `signals/<ID>-request.md`.

## Tests

Test real behavior (load bytes, observe() does not schedule, UI module no longer exports the deleted control). Do not pass by asserting a string exists in source.

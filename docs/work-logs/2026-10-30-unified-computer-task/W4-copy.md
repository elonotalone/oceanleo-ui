# W4 — new workspace localization completion (existing W3 agent)

Operator authorized full implementation; root independent review found useUI calls alone fall back to Chinese for new strings absent from locale dictionaries. Screenshot used English UI, so this affects delivered default use. Existing W3 owner is reassigned this disjoint follow-up after host work completion; all product clusters are otherwise delivered. Model gpt-6.1-sol, main only, no grandchildren/push/bump/browser. Run bootstrap.

Own a new `src/i18n/ui/messages/computer-task-workspace-copy.ts` (or repository-consistent equivalent), only the minimal registration in existing shared locale assembly, focused localization tests, and this checkpoint book. You may read host/native new tt strings but DO NOT edit native components, host code or root-generated public API/theme files without coordinating a specific tiny correction. No overlap with parent verification. Commit only your files locally.

Cover new Device/workspace/import/settings/archive/native binding messages introduced in W1-W3 so English UI does not silently show Chinese. Reuse existing common keys; use accurate localized display terms Conversation/Command line/Terminal, readable status and truthful settings scope. Cover configured locales using existing locale assembly conventions (locale inheritance where already defined); prioritize complete en/zh/zh-TW then configured locale coverage. Keep brands unchanged and interpolation placeholders intact. Verify actual message assembly/translate lookup, not just existence of new source dictionary. Preserve selective locale loading (do not statically import all dictionaries into client graph). Run focused non-browser tests via guard; return exact files/keys/locale/test evidence and update this book. No package exports should be necessary.

## Checkpoint

Not started.

## Checkpoint — localization and regression fixtures complete

Added `src/i18n/ui/messages/computer-task-workspace-copy.ts`: 48 new source keys with complete translations for all 17 configured locales (including simplified-Chinese source fallback and Traditional Chinese); regional Spanish and Portuguese variants adapt their existing language family wording. Covers device/program selection, conversation/command line labels, independent sessions, loading/retry/errors, archive saved/pending/error and read-only semantics, terminal keystroke limits, machine versus session settings scope, original native-session availability, and private attachment actions/errors. Existing common keys and installed-version interpolation remain reused. Brands stay unchanged.

Registered the module in both `messages/load.ts` dynamic assembly and `messages/index.ts` legacy aggregate. No useUI client imports, package exports, product components or generated assets changed. Default zh still loads no dictionary payload.

New `tests/computer-task-workspace-i18n.test.mjs` tests actual loadUiMessages assembly for every locale/key, aggregate parity, missing-Han fallback protection, real useUI lookup/render for en/zh/zh-TW, existing {version} interpolation, source call-site coverage, and selective-loading boundary.

Parent additionally authorized two existing test fixture repairs: added missing HomeContent getUserId dependency and isolated ComputerDock native task API boundary. Preserved existing first-send/reset and remembered-name assertions; added cached-tree native draft restoration and owner separation, and explicitly verified device inspection is passive before execution selection.

Guarded command: `agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/computer-task-workspace-i18n.test.mjs tests/agent-chat-home-launch-keeps-transcript.test.mjs tests/cloud-computer-dock-remembered-name.test.mjs` — PASS 23/23 (all formerly unregistered files now execute). `git diff --check` PASS. Parent owns final integrated typecheck/public API generation/dev evidence.

## Root verification (Claude Code takeover)

Moved the new import in `messages/index.ts` below the header comment so it sits with the other imports. `public-api-snapshot --check` passes. Focused suites re-run by root: W2 75/75, W3 56/56, W4 23/23, history list 21/21. Guarded full `tsc --noEmit` exit 0.

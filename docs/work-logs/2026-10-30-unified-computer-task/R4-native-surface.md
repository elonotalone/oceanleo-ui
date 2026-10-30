# R4 — Terminal / CLI surface and settings in the host style

Read `R0-redo-contract.md` first (same directory). Repo `/root/projects/oceanleo-ui`.

## Goal

When the user picks 命令行 or 终端 in the main task page, the left pane shows only the xterm surface in a host-styled frame. Settings for native chat / CLI / terminal render in the host's right pane in host style with clear scope labels. The standalone Computers page (`/settings/devices` → computer page using AcpCard/CliCard/TerminalCard) keeps working.

## Build

1. `src/shell/cloud-computer/native-surface/NativeTerminalSurface.tsx`: props `{ computer, session, active, onNativeSessionChange }` (session from `lib/computer-task-api.ts`, kind cli|terminal). Reuse the terminal engine inside `terminal-card/CliCard.tsx` / `TerminalCard.tsx` / `TerminalViewport.tsx` but with NO tone chrome: no program strip, no past-session sidebar, no in-card settings overlay, no card header bar. Frame: `bg-white`, xterm area fills parent, thin `border-neutral-200` only where needed; the xterm theme follows the user's terminal appearance setting as today. If you need embedded flags in CliCard/TerminalCard, keep them minimal and make the embedded path render zero tone-styled chrome. Binding the native id: call `onNativeSessionChange(id)` when the card reports it (the host binds via `bindComputerTaskSession`). Offline: one centered plain-language line in host style ("这台电脑离线。终端内容不会保存，联网后可重新打开。") — no fake saved terminal history. Remounting must not happen on active toggles (keep mounted when hidden).
2. `src/shell/cloud-computer/native-surface/NativeSettingsPanel.tsx`: props `{ computer, conversation, dialog? }` where `conversation` is the R0 `ConversationTarget` (native or terminal) and `dialog` is the controller object R1's `useNativeThread` returns as `thread.dialog` (type it as `ReturnType<typeof useAgentDialog>` from `agent-dialog/useAgentDialogController.tsx`).
   - Native chat: model / mode / config options of THIS conversation (from dialog), program login state + login/key action, install action (reuse logic from `AcpSettings.tsx`, `LoginCard.tsx`, `KeySheet.tsx`, `InstallSheet.tsx` but render with host classes), machine-wide toggles (dangerous-action confirmation, OceanLeo tools — see `/root/projects/oceanleo/backend/app/cloud_computer/agent_settings.py` and how AcpSettings calls the API).
   - CLI: CLI settings (`CliSettingsPanel.tsx`, `cli-settings.ts`) + terminal appearance.
   - Terminal: appearance (`AppearancePanel.tsx`).
   - Group headings state the scope in plain words: "本对话", "这台电脑上的 <Program>", "整台电脑（所有程序）", "终端外观（命令行和终端共用）". Each change says when it applies if not immediate ("下次打开时生效").
   - Host style: same as other right-pane content in this repo (look at `src/shell/ResultCanvas.tsx`/library pane contents for spacing; neutral palette, `text-[13px]`, `rounded-xl` controls, native selects styled like other host selects). No `tone.*` imports in native-surface/**.
   - `nativeSettingsTitle(conversation, tt)` → "Codex 设置 · elon" / "终端设置 · elon".
3. `agent-dialog/AcpCard.tsx`: after R3 the main task page no longer embeds it. Remove the embedded-only branches W2 added (`embedded`, `onSettingsContent`, `taskSessionId`, `onArchiveStatus`, `onNativeSessionChange` props) IF R1's hook does not depend on AcpCard (it must not). Keep the standalone page behavior and its tests green. Same for `MessageList.tsx`/`Composer.tsx`/`AcpSettings.tsx` embedded leftovers. Do not touch `useAgentDialogController.tsx` / `reduce.ts` / `types.ts` (R1 owns).
4. `native-surface/index.ts` barrel.

## Tests

New `tests/native-surface.test.mjs` (DOM, stubbed socket like `tests/terminal-card-view.test.mjs`): surface renders no program strip / sidebar / tone classes (assert absence of `zinc-` and of strip markers); binds native id once; offline line; stays mounted when inactive. Settings panel: title text, scope headings per kind, model change calls dialog setter, machine-wide toggle calls the settings API. Keep `tests/cli-card-view.test.mjs`, `tests/terminal-card-view.test.mjs`, `tests/acp-card-flows.test.mjs` green (remove only assertions about the deleted embedded mode).

## Done when

Focused tests pass, `git diff --check` clean, committed (own paths), Checkpoint filled with New strings and Requests.

## Checkpoint

Not started.

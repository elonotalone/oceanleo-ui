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

Status: done (files committed, focused tests green). No browser/screenshots, no push/bump/deploy.

### Files

New `src/shell/cloud-computer/native-surface/`:
- `NativeTerminalSurface.tsx` — xterm only, in a host frame (`bg-white`, `rounded-xl border-neutral-200`, frame background = xterm theme background from the user's appearance). No program strip, no sidebar, no card header, no settings overlay. Offline = one centered line. Uses `useComputerTerminal` directly (not `TerminalViewport`, which carries tone chrome).
- `NativeSettingsPanel.tsx` — scoped groups + `nativeSettingsTitle`.
- `ProgramAccess.tsx` — install / sign-in / key for one program, inline in host style (same dialog controller calls and key route as LoginCard/InstallSheet/KeySheet; those files untouched).
- `host-style.ts` — `HOST` classes + `HOST_PANEL_SKIN`.
- `index.ts` — barrel.

Changed:
- `terminal-card/panel-skin.ts` (new) — `PanelSkin` type + `SERVER_PANEL_SKIN` (tone-based; Computers page default).
- `terminal-card/AppearancePanel.tsx` — props `skin?: PanelSkin`, `showHeading?: boolean` (defaults keep the Computers page identical).
- `terminal-card/CliSettingsPanel.tsx` — props `skin?: PanelSkin`, `showAppearance?: boolean` (defaults identical).
- `terminal-card/CliCard.tsx`, `terminal-card/TerminalCard.tsx`, `agent-dialog/AcpCard.tsx`, `agent-dialog/AcpSettings.tsx` — W2 embedded branches removed (`embedded`, `settingsOpen`, `onSettingsContent`, `onNativeSessionChange`, `taskSessionId`, `onArchiveStatus`, pendingNative). TerminalCard/AcpCard/AcpSettings are byte-identical to `97e759cb^` (pre-embed); CliCard identical except it keeps `active` on its viewport.
- `agent-dialog/ArchivedAttachment.tsx` — restores `tt("图片")` for the default image name (W2 regression).
- `MessageList.tsx` / `Composer.tsx` — no embedded leftovers found; unchanged.
- Tests: new `tests/native-surface.test.mjs`; removed only the embedded-mode cases from `tests/cli-card-view.test.mjs` (1), `tests/terminal-card-view.test.mjs` (1), `tests/acp-card-flows.test.mjs` (4).

### Exported signatures (`src/shell/cloud-computer/native-surface/index.ts`)

```ts
export type NativeTerminalSurfaceProps = {
  computer: Computer | null;
  session: ComputerTaskSession;            // kind "cli" | "terminal"
  active: boolean;                          // visibility only; stays mounted
  onNativeSessionChange?: (nativeId: string) => void | Promise<void>; // once per new id; rejection = retry same process
  client?: CloudComputerClient;
};
export function NativeTerminalSurface(props: NativeTerminalSurfaceProps): JSX.Element;

export type NativeSettingsPanelProps = {
  computer: Computer | null;
  conversation: ConversationTarget;         // native (chat|cli) or terminal; oceanleo renders null
  dialog?: NativeDialog | null;             // = ReturnType<typeof useAgentDialog> (thread.dialog), needed for chat
  client?: CloudComputerClient;
};
export function NativeSettingsPanel(props: NativeSettingsPanelProps): JSX.Element | null;
export function nativeSettingsTitle(conversation: ConversationTarget, tt: UITranslate): string;
export type NativeDialog = ReturnType<typeof useAgentDialog>;
export function ProgramAccess(props: { computerId: string; program: WsProgram; dialog: NativeDialog }): JSX.Element;
export const HOST, HOST_PANEL_SKIN;
```

### Behavior decisions

- Surface: a new CLI/terminal session (no `native_session_id`) opens its process the first time it is shown online (`active && online`), exactly once. CLI uses `listCliPrograms` → `launchCli({program: session.program, options: cliLaunchOptions(stored, server confirm_dangerous)})`; terminal uses `openTerminalSession({kind:"shell"})`. It calls `onNativeSessionChange(id)` and attaches xterm only after it resolves; on rejection it shows a retry and reuses the same process (no second launch). Existing `native_session_id` attaches directly, no bind call. A later `session.native_session_id` prop change is adopted. Ended (`exit`/`gone`) shows a line + explicit "重新打开" (new process, new bind); never auto-reopens. Hidden = same DOM node, `active:false` passed to the terminal hook. Host should key the surface by `session.id`.
- Settings native chat groups: 本对话 (model / mode / other config from `dialog`), 这台电脑上的 <Program> (state + install / 登录 / 退出登录 / Key, flows inline), 整台电脑（所有程序） (`confirm_dangerous`, `oceanleo_tools` via `patchAgentSettings`; tools note "下次打开时生效"). CLI: 这台电脑上的 <Program> (`CliSettingsPanel` in host skin: next-launch defaults + OceanLeo tools toggle) + 终端外观（命令行和终端共用）. Terminal: appearance group only. Offline: one status line; node-dependent groups say "这台电脑联网后可以修改。"; machine-wide settings still load (cloud DB).
- No title/close inside the panel: the host pane shows `nativeSettingsTitle(...)`.

### Commands + results

All via `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<file>.test.mjs`:
- `native-surface` 12/12 pass
- `cli-card-view` 8/8 pass (was 9; 1 embedded case removed)
- `terminal-card-view` 3/3 pass (was 4; 1 removed)
- `acp-card-flows` 53/53 pass (was 57; 4 removed)
- `ccp-w10-contract` 1/1, `ccp-w9-terminal` 2/2 pass
- Pre-existing, unrelated failures (same cause before my edits — stale domain-module stubs / budget entries for other files): `ccp-w1-chrome`, `server-page-view` (stub lacks `sharedCookieDomainFor`), `g1-wave-tap-targets` (stub lacks `CONFIGURED_DOMAIN_FAMILY`), `hit-target-budget` (many other files; AcpSettings count 4 vs 3 is unchanged by R4 — same as HEAD).
- `run-heavy -- npx tsc --noEmit` (once, whole tree incl. siblings' WIP): 0 errors.
- `git diff --check` on R4 paths: clean.

### New strings (all `tt("…")`)

- 这台电脑离线。终端内容不会保存，联网后可重新打开。
- 这台电脑还没有安装 {program}。
- 没能把它保存到这个任务，请重试。
- 这个命令行已结束。
- 这个终端已结束。
- 重新打开
- 终端设置 · {computer}
- {program} 设置 · {computer}
- 本对话
- 这台电脑上的 {program}
- 整台电脑（所有程序）
- 终端外观（命令行和终端共用）
- 下次打开时生效
- 这台电脑联网后可以修改。
- 这台电脑离线。联网后可以修改这台电脑上的设置。
- 设置读取失败，请稍后重试。
- 打开登录页面

(All other strings reused existing keys: 终端加载中, 重试, 正在启动…, 正在创建…, AI 命令行启动失败，请稍后重试。, 新终端创建失败，请稍后重试。, login/install/key copy from LoginCard/InstallSheet/KeySheet, 危险操作先问我, 让它能用 OceanLeo 的工具, 关掉后 AI 执行删除、覆盖等操作前不再问你, 模型, 模式, 请选择可用模型, 设置保存失败，请稍后重试。, OceanLeo 工具设置失败，请稍后重试。, 这些设置将在下一次启动时生效。.)

### Requests

- R3 (host): render `NativeTerminalSurface` keyed by `session.id`, keep it mounted when another conversation is shown (pass `active`), and pass `onNativeSessionChange = (id) => bindComputerTaskSession(session.id, id)` (return the promise so a failed save shows retry). Right pane title = `nativeSettingsTitle(conversation, tt)`; content = `<NativeSettingsPanel computer conversation dialog={thread.dialog} />`.
- R3/R1: when the stream asks the user to sign in / install (dialog `openLogin` / `openInstall` from a notice action), open the settings pane — `ProgramAccess` shows the live login/install flow there; nothing else renders LoginCard/InstallSheet on the task page.
- R1: the removed `acp-card-flows` cases covered controller behavior for `taskSessionId` (prompt carries `task_session_id`, `archive_status` filtered by binding, per-binding presentation cache). Keep that coverage in `tests/native-thread-*.test.mjs`.
- Parent: add the New strings above to `computer-task-workspace-copy.ts` (+17); the old W2 keys used only by the deleted embedded branches (e.g. `fullSettingsScope`, 原命令行暂不可用…, 原终端暂不可用…, 命令行启动默认值仅影响下次打开…, 终端外观同时影响所有终端和 AI 命令行。…) are now unused.

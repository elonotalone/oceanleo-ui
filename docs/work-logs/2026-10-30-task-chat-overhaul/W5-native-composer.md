# W5 — Composer controls for native programs: no wallet / Lite, real model · mode · fast · effort

Read `00-contract.md` first (same directory). Repo `/root/projects/oceanleo-ui`.

**You own:**
- `src/shell/LeoComposer.tsx`
- `src/shell/native-thread/NativeModelPicker.tsx`
- the `modelPicker` block of `src/shell/native-thread/useNativeThread.ts` (≈255–280; W4 owns the rest of that file)
- `src/shell/PayerSelector.tsx` / `src/shell/ModelPicker.tsx`, only if needed
- tests

Do not edit `AgentChat.tsx` or `home-content.tsx`; W4 passes your picker on the homepage (contract C4).

## Operator complaint
"After I choose Codex (on my own server), the input box still shows 'Personal wallet · Lite'. Bug. And many agent modes can't be selected, e.g. I can't pick fast mode."

## Facts (confirmed)
**Payer and tier still show:**
- `LeoComposer.tsx:674` renders `PayerSelector` whenever `showPayerSelector` (default `true`, ≈332). Its label is "个人钱包" (`PayerSelector.tsx:144`); it is hidden only when the user has no orgs.
- ≈688-690 renders `ModelGroupPicker` (lite / pro / max) unless `modelPickerSlot` is given.
- The composer knows the conversation is native (`nativeConversation` ≈367) but uses that only for the gear (≈637) and `canSend` (≈429).

**Modes and fast:**
- **Claude Code** (`claude-agent-acp` 0.79.0 on this host): modes `default` / `acceptEdits` / `plan` / `auto` / `bypassPermissions`. Fast is a separate config option (`createFastModeConfigOption`, category `model_config`), present only when the model supports fast.
- **Codex** (`codex-acp` 2.2.2): modes `read-only` / `agent` / `agent-full-access`. Fast is the config option `fast-mode` (category `model_config`, `serviceTier:"fast"`), present only when the model lists `additionalSpeedTiers` with `"fast"`. Effort is also a `model_config` option.
- The gateway passes these through (`backend/app/cloud_computer/acp/translate.py` ≈322, 327, 492-515).
- The UI parses modes with `parseMode` (`agent-dialog/parse.ts` ≈185) and model params with `modelParamOptions` (`agent-dialog/notice.ts` ≈167-178). Remembered choices live in `agent-dialog/model-param-memory.ts`. Controls are `agent-dialog/model-controls.ts`.
- The old Computers composer rendered them: `agent-dialog/Composer.tsx` ≈279-280, ≈478-501 `tuningParams` / `controls.effort`; settings in `AcpSettings.tsx` ≈114-120, ≈230-275.
- The new `NativeModelPicker.tsx` renders only models and the mode, and `useNativeThread.ts` ≈261-273 passes it no effort / tuning data.
- The picker is hidden until `live && controls && (models.length || hasModes)` (≈265).

## Required
1. **`LeoComposer`:** when `conversation?.kind === "native"` (any view), never render `PayerSelector` or the Leo `ModelGroupPicker`, regardless of props. Render `modelPickerSlot` if given.
2. **`NativeModelPicker`** shows everything the program offers, in the host picker look (reuse `ModelPicker.tsx` trigger/menu classes; no `server-page/tone`):
   - **Model.** Unusable models disabled with the reason.
   - **Mode.** The program's own mode names in plain language: e.g. Claude Code "手动确认 / 自动接受改动 / 计划 / 自动 / 全部放行"; Codex "只读 / 代理 / 完全访问". Check whether the repo already has a label dictionary (`agent-dialog/*`) and reuse it.
   - **Fast.** A toggle when the selected model offers it. When the program has the option but the current model doesn't, show it disabled with "当前模型不支持快速模式". Never let it just vanish without explanation if the program supports fast for other models.
   - **Effort / reasoning level** when offered.
   - Choices persist per program and computer via the existing `model-param-memory.ts`, and are sent through the controller's existing setter functions (check `useAgentDialogController.tsx` for `setModelParam` / `setMode` / config option setters; do not invent new frames).
   - The trigger shows a compact summary like "Opus 4.x · 计划 · 快速".
3. **Availability before a session.** In draft mode (the homepage, before the first send), the picker must appear as soon as the program reports its models, modes and options over the warm connection. Relax the `live && controls && …` condition (≈265) so draft data counts. If nothing is known yet, show a disabled "正在读取…" trigger instead of nothing.
4. **Tests.** DOM tests for:
   - `LeoComposer` hides payer and tier for native
   - picker renders model, mode, fast and effort from the parsed options
   - fast disabled with its reason when the model lacks it
   - a choice calls the controller setter and persists
   - draft mode shows the picker

   Keep `tests/native-thread-hook.test.mjs`, `tests/sko-w15-composer-slash.test.mjs`, `tests/cloud-computer-dock.test.mjs` and the ModelPicker tests green. Run typecheck through `run-heavy`.

## Done when
- Typecheck is clean and tests are green.
- The Checkpoint lists files, tests, strings and Requests.
- Nothing is committed.

## Checkpoint

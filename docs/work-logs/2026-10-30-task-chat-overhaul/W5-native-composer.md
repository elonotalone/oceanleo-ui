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

**Status (W5, 2026-10-30): done, not committed.**

### Files
- `src/shell/LeoComposer.tsx` — new `nativeProgramConversation = conversation?.kind === "native"`; `PayerSelector` and the Leo `ModelGroupPicker` never render for it (any view), whatever `showPayerSelector` / `modelPickerSlot` say. `modelPickerSlot` still renders when given. Terminal and OceanLeo conversations unchanged.
- `src/shell/native-thread/NativeModelPicker.tsx` — rewritten picker (same trigger/popover/row classes as before, no `server-page/tone`). One trigger with summary "Opus 4.x · 计划 · 快速"; popover sections: 模型 (unusable models disabled, reason shown under the name), 推理强度 (Codex legacy `model[effort]` ids), other model params from `modelParamOptions` (effort etc.), 快速模式 switch, 模式 (plain names: Claude Code 手动确认 / 自动接受改动 / 计划 / 自动 / 全部放行; Codex 只读 / 代理 / 完全访问; unknown ids keep the program's name). Fast: real switch when the option exists; disabled switch with "当前模型不支持快速模式" when the program is Claude Code / Codex (`programOffersFast`) and the current catalog has no fast option. New exported helper `nativeModelPickerFor({ program, computerId, dialog, waiting })` builds it from the controller: choices go through `dialog.setSelectedModel` / `setMode` / `setConfig` (bool wires coerced via `coerceOptionValue`), and are remembered per program + computer with `rememberModelParam` (key `oceanleo.acp.modelParams.<computerId>.<program>`). A fresh view (no `activeSession`, i.e. homepage draft / new conversation) re-applies remembered fast/effort once per catalog through the same setter (`restoresForModel`). Nothing known yet + `waiting` → disabled "正在读取…" trigger.
- `src/shell/native-thread/useNativeThread.ts` — modelPicker block only (+ its imports: dropped now-unused `createElement`, `modelControls`, `readModelParamMemory`; import `nativeModelPickerFor`). Condition relaxed: no longer needs `live`; shown whenever `enabled`, the program is set and the computer is not known-offline; draft data counts. `waiting = !computer || !blockedReason` (computer still loading, or online and not blocked by install/login). Offline → null (existing test kept).
- `tests/native-composer-controls.test.mjs` — new.

### Tests
- `tests/native-composer-controls.test.mjs` (run-light): 9/9 pass — LeoComposer hides payer+tier for native (host forgot props, cli view, slot still shown); picker renders model/effort/fast/mode with plain mode names and summary; Codex mode names; fast disabled with reason / absent for programs without fast; a choice calls the controller setter and persists to model-param memory; fresh view restores remembered choices (open session does not); Codex legacy effort ids; "正在读取…" / null; draft through the real `useNativeThread` + fake socket: waiting trigger while computer loads → picker from the warm connection with no session opened → fast toggle reaches `setConfig` → offline hides it.
- Regression (run-heavy, one batch): `native-thread-hook`, `sko-w15-composer-slash`, `cloud-computer-dock`, `conversation-dock`, `model-picker-byok`, `model-picker-popover-layout`, `model-picker-portal`, `payer-media-wiring`, `payer-selector`, `payer-wiring` (except one case) green. 3 reds, none from W5:
  - `agent-chat-conversations.test.mjs` and `payer-wiring` case "AgentChat：LeoComposer.onSubmit({org_id:o1})…": `src/lib/agent-progress.ts` currently has no `buildAgentProgressActions` export that `AgentProgress.tsx` imports (W3 work in progress).
  - `model-picker-workbench-open.test.mjs`: does not load (`ERR_UNSUPPORTED_DIR_IMPORT` `src/shell/messages/call/engine` from `messages/call/ui/video-pool.ts`); untouched files, pre-existing.
- `npx tsc --noEmit` (run-heavy): only 3 errors, all in `src/shell/AgentProgress.tsx` (same W3 missing export). None in W5 files.
- `tests/i18n-tt-key-coverage.test.mjs`: case 8 lists the 8 new W5 strings below as missing translations (plus W3's AgentProgress/AgentChat strings); case 10 (dead baseline entries 35 > 31) is not from W5.

### New user-visible strings (zh source via `tt`)
手动确认 · 自动接受改动 · 全部放行 · 代理 · 完全访问 · 快速 · 快速模式 · 当前模型不支持快速模式
(Reused, already translated: 计划 · 自动 · 只读 · 模式 · 模型 · 选择模型 · 推理强度 · 正在读取… · 这个模型现在不可用。 · {provider} 的付费模型需要账户余额。 · {provider} 还没有登录。 · 供应商)

### Requests
1. **Parent — translations (i18n gate).** W5 may not edit locale files. Suggested: add to `src/i18n/ui/messages/computer-task-workspace-copy.ts` (it already carries the native picker copy). Proposed values (en / zh-TW / de / es = es-419 / fr / it / pt-BR / pt-PT / vi / tr / ja / ko / ar / th / hi):
   - 手动确认: Ask first / 手動確認 / Erst fragen / Preguntar antes / Demander d'abord / Chiedi prima / Perguntar antes / Perguntar primeiro / Hỏi trước / Önce sor / 都度確認 / 매번 확인 / اسأل أولاً / ถามก่อน / पहले पूछें
   - 自动接受改动: Auto-accept edits / 自動接受改動 / Änderungen automatisch annehmen / Aceptar cambios automáticamente / Accepter les modifications automatiquement / Accetta modifiche automaticamente / Aceitar alterações automaticamente / Aceitar alterações automaticamente / Tự động chấp nhận thay đổi / Değişiklikleri otomatik kabul et / 変更を自動承認 / 변경 자동 수락 / قبول التعديلات تلقائيًا / ยอมรับการแก้ไขอัตโนมัติ / बदलाव अपने-आप स्वीकारें
   - 全部放行: Allow everything / 全部放行 / Alles erlauben / Permitir todo / Tout autoriser / Consenti tutto / Permitir tudo / Permitir tudo / Cho phép tất cả / Her şeye izin ver / すべて許可 / 모두 허용 / السماح بكل شيء / อนุญาตทั้งหมด / सब कुछ अनुमति दें
   - 代理: Agent / 代理 / Agent / Agente / Agent / Agente / Agente / Agente / Tác tử / Ajan / エージェント / 에이전트 / وكيل / เอเจนต์ / एजेंट
   - 完全访问: Full access / 完全存取 / Vollzugriff / Acceso total / Accès complet / Accesso completo / Acesso total / Acesso total / Toàn quyền truy cập / Tam erişim / フルアクセス / 전체 액세스 / وصول كامل / เข้าถึงเต็มรูปแบบ / पूरी पहुँच
   - 快速: Fast / 快速 / Schnell / Rápido / Rapide / Veloce / Rápido / Rápido / Nhanh / Hızlı / 高速 / 빠르게 / سريع / เร็ว / तेज़
   - 快速模式: Fast mode / 快速模式 / Schnellmodus / Modo rápido / Mode rapide / Modalità veloce / Modo rápido / Modo rápido / Chế độ nhanh / Hızlı mod / 高速モード / 빠른 모드 / الوضع السريع / โหมดเร็ว / तेज़ मोड
   - 当前模型不支持快速模式: This model doesn't support fast mode / 目前模型不支援快速模式 / Dieses Modell unterstützt keinen Schnellmodus / Este modelo no admite el modo rápido / Ce modèle ne prend pas en charge le mode rapide / Questo modello non supporta la modalità veloce / Este modelo não oferece suporte ao modo rápido / Este modelo não suporta o modo rápido / Mô hình này không hỗ trợ chế độ nhanh / Bu model hızlı modu desteklemiyor / このモデルは高速モードに対応していません / 이 모델은 빠른 모드를 지원하지 않습니다 / هذا النموذج لا يدعم الوضع السريع / โมเดลนี้ไม่รองรับโหมดเร็ว / यह मॉडल तेज़ मोड का समर्थन नहीं करता
2. **W4 — homepage.** Pass `thread.modelPicker` exactly as `AgentChat.tsx` does (`showPayerSelector={false}`, `modelPickerSlot={thread.modelPicker}`); with no slot the composer now shows nothing in that place for native (no Lite fallback). The picker shows "正在读取…" while `computer` is still null, so it is safe to mount immediately.
3. **Known limit (gateway/controller, not W5).** In a draft, picking another model only changes local state (no `set_config` until a session exists), so the fast/effort options shown are the discovery session's catalog (the default model's). If the picked model lacks fast, the switch is still offered until the session opens and the adapter reports the real catalog. Fixing it needs the gateway to re-read config options for the chosen model on a draft (W2 / controller scope).

# W09 state（只靠它续接）

更新：2026-10-23 18:5x（开工）

## 已确认的事实
- 两仓起点：共享 UI `ea9a000a`，门户 `34ac742`；W09 占位 `src/shell/messages/cases/MessagesContentCases.tsx` 只返回空 div。
- 门户旧面板 `app/settings/content-cases/content-cases-panel.tsx` 的 tt 文案大多已在 `settings-i18n-copy.ts` 有 17 语译文（举报/权利通知/…/提交申诉），复用，不重定义。
- 后端 `public_view` 还给了 `actions`、`counter_notice_at`、`appeal_at`、`reason`、`detail`；`TARGET_KINDS` 含 bay_app/bay_lesson/bay_bundle/bay_app_thread（门户旧面板没有这些名字）。
- 门户里引用旧面板的测试：`tests/account-content-cases.test.mjs`、`tests/ccp-w12-settings-modal.test.mjs:49`、`tests/legal-rights-notice.test.mjs:51`。
- `src/theme/ui.css` 是产物，有别人未提交改动，不碰；新类名交卷里报给父 agent 重编。

## 正在做
- 第 1 步：共享 UI 客户端 `src/lib/moderation/{client,case-model}.ts` + `MessagesContentCases.tsx` + 分表。

## 下一步
2. seller-ui.tsx（contentCasesHref + 种类名）  3. 共享 UI 测试  4. 门户改动  5. 后端改动+测试  6. typecheck/测试/文案闸  7. 交卷

## 复现命令
见任务书与 _COMMON §2。

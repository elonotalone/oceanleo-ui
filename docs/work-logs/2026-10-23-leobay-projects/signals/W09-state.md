# W09 state（只靠它续接）

更新：2026-10-23 重派后第 1 次（读完任务书/_COMMON/合同、盘点完毕，开始写代码）

## 已确认的事实（上一轮没留下任何代码，只有盘点；本轮从零写）
- 两仓起点：共享 UI `5e581e20`，门户 `3dc343e`；W09 占位 `src/shell/messages/cases/MessagesContentCases.tsx` 只返回空 div（props：`caseId?`、`onBack?`，I-3 不改）。
- 门户旧面板 `app/settings/content-cases/content-cases-panel.tsx`（320 行）、客户端 `lib/moderation/client.ts`（`listMyCases/submitCounterNotice/submitAppeal` 只被旧面板用；`submitRightsNotice/getNoticeStatus/fetchAnnouncements` 仍被 rights-notice 与帮助页用，保留）。
- 后端 `public_view` 给的字段：id/source/tier/status/queue/target_kind/target_ref/target_snapshot{title,text,image_urls,url}/reason/detail/hidden/due_at/restore_at/decision/decision_note/notice{claimant_name,work_description,location_urls}/actions/counter_notice_at/appeal_at（没有 created_at）。`actions` 与门户旧面板的 canCounter/canAppeal 规则不一致：以旧面板（按 tier）为准，再加「已提交过就不再给表单」「已恢复/已驳回/已执行不给申诉」。
- 库里真有 6 条案件（读库，只读）：im_message/im_conversation/im_user/talent_message 四类 dismissed，1 条 game open illegal；target_kind 还有 bay_app/bay_lesson/bay_bundle/bay_app_thread/talent_*/url；reason 是各来源自己的代码（game: sexual/violence/hate/ip_infringement/malware…；Bay: fake/offsite/plagiarism/fraud…；IM: spam/harassment/fraud/illegal/other；talent 存中文原文；机器: staydown、machine:<标签>）。
- 译文现状：内容处置旧面板的 tt 文案在 `settings-i18n-copy.ts` 已有 16 语译文，复用；「人工服务」「消息」「主页」「课程」「套餐」「留言」「其他」等已有；「网站与软件服务」只有 en（en.ts:72），要在分表里补 15 语（W02/W03 也可能补，后合并者覆盖，措辞一致即可）。
- 门户 `app/leochat/page.tsx` 对境内 `notFound()`（整页 404）——不在任何 owner 的边界里，会让 `https://oceanleo.cn/leochat?im=cases`（后端通知链接、旧地址重定向）在境内落空。交卷里向父 agent 提出。
- 门户 `content/help/account/content-cases.md`、后端 `moderation/publish_check.py:18`（「你可以在门户「内容处置」页申诉」）也指旧位置，都在边界外：交卷里向父 agent 提出并给替换文本。
- `src/theme/ui.css` 是产物，有别人改动，不碰；新类名交卷报给父 agent 重编。

## 正在做
- 第 1 步：共享 UI `src/lib/moderation/{case-model,client}.ts` + `src/shell/messages/cases/*`（列表、展开、反通知/申诉表单、登录提示）+ 分表。

## 下一步
2. seller-ui.tsx（contentCasesHref 指新地址，可带案件 id；种类名清扫）
3. 共享 UI 测试 `tests/lbp-w09-content-cases.test.mjs`
4. 后端：`portal_cases_url(case_id=None)` → `/leochat?im=cases[:id]`；`_place`「真人协作」→「LeoBay」；申诉通知文案；测试
5. 门户：sections.tsx 去掉一项；两个旧地址重定向；版权政策页；删旧面板；client.ts 裁剪；三个旧测试改写
6. typecheck（共享 UI、门户）、文案闸、后端测试
7. 交卷 `verdicts/W09-delivery.md`

## 复现命令
- 共享 UI 单测：`cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/lbp-w09-content-cases.test.mjs`
- 译文探针：`node --experimental-strip-types /tmp/w09/probe.mjs "<中文原文>"…`（脚本在 /tmp/w09，丢了就按「动态 import messages/index.ts 查 16 语」重写）
- 后端：`cd /root/projects/oceanleo/backend && .venv/bin/python -m pytest tests/test_moderation_actions.py tests/test_moderation_store.py -q`

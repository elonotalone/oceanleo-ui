# W11 state（实现 owner：项目页各选择框 + 计划页翻译）

更新：2026-10-23（开工）

## 已确认的事实
- bootstrap 已跑（main-only OK）。三份文件（W11.md / _COMMON.md / 00-contract.md）已读。
- 门户 5 个未提交文件（app/projects/page.tsx、package.json、pnpm-lock.yaml、.github/workflows/oceanleo-cn-frontend.yml、backend/scripts/retire_operator_examples_20261021.py）与共享 UI 一批他人未提交文件：一律不碰。
- 文案闸 `tests/i18n-tt-key-coverage.test.mjs` 只扫共享 UI `src` + 同级仓，不扫门户；门户 `tt()` 查同一本词典，所以新词条仍要 17 语齐全。分表写法 = `assembleCopy(SOURCE, {16 语种})`（见 game-play-copy.ts）。
- 计划页 `ProjectPlanTab.tsx` 当前 0 处 tt()，中文写死。任务页已用 tt()，但「来源」选项是原始 `site_id || kind`。
- 门户既有测试断言了旧结构：`tests/project-plan-tab.test.mjs`（import 形态、`aria-label="按负责人筛选"` 等）、`tests/project-assets-tab.test.mjs`（import 形态、`option value="folder"` 等）。改完需要小范围精确替换到绿。

## 正在做
- 读剩余源文件（Assets / Automation / Connector / Instruction / ShareProjectModal），盘点原生 select 与写死中文。

## 下一步
1. 查任务「来源」值（site_id）从哪来、有哪些（后端 + lib/projects.ts）。
2. 看 W01 的 menu-select / CollectionFilterSelect 现状（`defaultValue` 是否已加）。
3. 改 7 个门户文件；写分表 `lbp-w11-copy.ts`（17 语）。
4. 新增 `tests/lbp-w11-project-selects.test.mjs`；修门户旧测试；跑 typecheck 与文案闸。
5. 交卷 `verdicts/W11-delivery.md`。

## 复现命令
- 门户 typecheck：`cd /root/projects/oceanleo && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- pnpm typecheck`
- 单测：`cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/lbp-w11-project-selects.test.mjs`
- 文案闸：同上命令换成 `tests/i18n-tt-key-coverage.test.mjs`

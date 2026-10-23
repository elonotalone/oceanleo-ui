# W03 state（被打断时只靠它续接）

更新：2026-10-23 21:45（第一个检查点已入库 770dd1d3；接下来收尾 + 交卷）

## 已确认的事实
- 工作目录 /root/projects/oceanleo-ui，分支 main，bootstrap 已跑。
- 我的分表 `src/i18n/ui/messages/lbp-w03-copy.ts`：59 句 × 16 语，已入库（后续只有小修润色）。
- 边界清单 151 个文件，在 /tmp/w03/boundary.txt（丢了就 `grep -oE '^- \`[^\`]+\`' tasks/W03.md`）。
- 本机 `pnpm typecheck` exit 0（改完源码后跑的）。
- 文案闸 `tests/i18n-tt-key-coverage.test.mjs`：3 条红（都是别人的词条：messages/Inbox、LeoAssistant、AudioTranscriptSection…），bay/ 与 settings/ 下没有我的缺口；`i18n-key-collision` 的红也不是我的表。
- 基线（开工时）相关测试 126 个里 19 个红，复盘见 journal；整份没执行的 5 个（bay-needs-*、bay3-page、bay-supply-profile）是测试里 domain-family 桩缺 `runtimePageOrigin` 导出，和 W03 无关。

## 已做完
1. apps/ + appfeedback/appinsights/applogin/appreleases/appendpoint：「作品」→「网站或软件」（单件）/「网站与软件服务」（整类），能省名词就省（71 处）。
2. supply/seller/deal/orders/reviews/form：泛指一件「服务」→「商品」或省略名词；「数字商品/素材」→「现成文件/文件」（44 处）。
3. ServiceCard 角标按 listing_kind 五类取名（bay-listing.ts 新增 `offerFromFeedKind`，form/index.ts 导出）；ServiceEditorPane 已有条目的徽标改 `offerKindLabel(offerKind)`；`PUBLISH_KIND_LABELS` 值改成新名字（仅留给 bay2-copy 测试读）。
4. 测试：新增 `tests/lbp-w03-kind-names.test.mjs`（8 条，含边界扫描 + 18 句保留清单 + 分表完整性）；精确替换 bay-app-insights / bay-app-login / bay-seller-editor / bay-supply-checkout / bay2-supply / bay-deal-view；bay-seller-copy 的「tt 字面量都有 16 语译文」改为也认汇总词典。

## 正在做
- 收尾：全量相关测试复跑、typecheck 复跑、交卷文件 verdicts/W03-delivery.md。

## 下一步
1. `/tmp/w03/run-tests.sh <日志> $(cat /tmp/w03/rel_tests_all2.txt)`（分两半并行）对照 /tmp/w03/baseline_red.txt。
2. `pnpm typecheck`（run-heavy）。
3. 写 verdicts/W03-delivery.md（对照表见 /tmp/w03/make_table.mjs 生成的 table.md），提交。

## 复现命令
见 _COMMON.md §2。单测：
cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<名字>.test.mjs

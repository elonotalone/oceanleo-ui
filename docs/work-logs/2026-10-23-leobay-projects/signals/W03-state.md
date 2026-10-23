# W03 state（被打断时只靠它续接）

更新：2026-10-23 18:5x（开工）

## 已确认的事实
- 工作目录 /root/projects/oceanleo-ui，分支 main，bootstrap 已跑。
- 我的分表 `src/i18n/ui/messages/lbp-w03-copy.ts`（父建的空表，已注册）；写法见 `shell-overhaul-copy-shared.ts` 的 `assembleCopy`。
- 边界清单 151 个文件；清单已提取到 /tmp/w03/boundary.txt（丢了就从任务书重提：`grep -oE '^- \`[^\`]+\`' tasks/W03.md`）。
- 边界内带 服务/素材/作品/成品 的行共 187 行（含注释），分布在约 66 个文件；盘点结果 /tmp/w03/hits.txt。
- 边界内三个文件带别人的未提交改动（collection-items 重构，16:08 就有）：
  `bay/apps/BayAppCard.tsx`、`bay/lessons/BayBundleCard.tsx`、`bay/lessons/BayLessonCard.tsx`。
  它们里没有要改的种类名文案 -> 不碰、不提交（提交会连带夹带别人的半成品）。
- 文案闸 `tests/i18n-tt-key-coverage.test.mjs`：新增 tt() key 必须 16 语齐全；PRE_EXISTING_GAPS 里的 key 不能补译（会触发“死条目”红），也不能让它失去最后一个调用点。
- `tests/i18n-key-collision.test.mjs`：我的表里同一中文键的英文不得与 `en.ts` 基础词典不同（例：“网站与软件服务” 英文必须是 `Website & software service`）。
- 查词小工具：`node --experimental-strip-types /tmp/w03/lookup.mjs "<中文>"`（列 17 语现有译文；丢了见 journal 里的源码）。

## 正在做
- 第 0 步：调查。逐文件看 187 行命中的上下文，分类：种类名（改）/ 非种类（保留并记入交卷）/ 仅注释。

## 下一步
1. 调查完 -> 决定每句新文案 -> 改源文件。
2. 新文案写进 lbp-w03-copy.ts（17 语）。
3. 测试：grep tests 找引用旧串的，精确替换；跑文案闸与相关测试；typecheck 不新增错误。
4. 交卷 verdicts/W03-delivery.md。

## 复现命令
见 _COMMON.md §2。单测：
cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<名字>.test.mjs

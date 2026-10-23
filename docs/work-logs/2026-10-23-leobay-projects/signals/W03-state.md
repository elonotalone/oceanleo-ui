# W03 state（被打断时只靠它续接）

更新：2026-10-23 21:0x（重派后第一次落盘；上一轮只做了调查，没有任何源码改动，也没有入库的 W03 改动）

## 已确认的事实
- 工作目录 /root/projects/oceanleo-ui，分支 main，bootstrap 已跑。工作区开工时干净（BayAppCard / BayBundleCard / BayLessonCard 的 collection-items 重构已由父提交 a08f3083），这三个文件现在可以放心改（目前它们没有要改的种类名文案）。
- 我的分表 `src/i18n/ui/messages/lbp-w03-copy.ts`（父建的空表，已注册；写法见 `shell-overhaul-copy-shared.ts` 的 `assembleCopy`，SOURCE + 16 语种）。
- 边界清单 151 个文件，已提到 /tmp/w03/boundary.txt（丢了就 `grep -oE '^- \`[^\`]+\`' tasks/W03.md`）。带 服务/素材/作品/成品 的行 187 行（含注释）。盘点 /tmp/w03/hits_now.txt；去重后的 94 条引号字面量 /tmp/w03/old_keys.jsonl。
- 文案闸：新增 tt() key 必须 16 语齐全；PRE_EXISTING_GAPS 里的 key 不能补译、也不能让它失去最后一个调用点。我的 94 条里只有「正在打开这份素材…」在基线里，而它在 library-viewers / LibraryPdfReader / bay/asset 里还有调用点 -> 我改我这 4 处不会让它变死条目。
- `tests/i18n-key-collision.test.mjs`：我的表里同一中文键的英文不得与 en.ts 基础词典不同（例：「网站与软件服务」英文必须是 `Website & software service`，已在 en.ts）。
- 「网站与软件服务」只有 en 有译文，另外 15 语缺 -> 我的表要补（W02/W04 也可能补同键，同键同义即可）。
- 查词小工具（丢了见 /tmp/w03/*.mjs 的头注释）：`node --experimental-strip-types /tmp/w03/lookup.mjs "<中文>"`；`/tmp/w03/exists.mjs` 看某句是否已有译文；`/tmp/w03/lookup_many.mjs <文件> [语种]`。
- 批量跑测：`/tmp/w03/run-tests.sh <日志> <测试名…>`；相关测试名单 /tmp/w03/rel_tests_all.txt（126 个）；基线结果 /tmp/w03/baseline_a.log、baseline_b.log。

## 判定规则（我定的，交卷要写明）
- 种类名一律：人工服务 / 现成文件 / 网站与软件服务 / 课程 / 其他。
- 指代「一个上架的网站/软件」（原「作品」，kind=app）：句子里用「网站或软件」，能省名词就省（「它」「详情页」）；指代整类时用「网站与软件服务」。
- 泛指「一条发布」（统一发布表单、详情页、结账、会话主题；原「服务」，可能是文件/人工服务/其他）：用「商品」（全站已有「分商品收入」等同义用法），能省就省。
- 「作品」指用户库里的作品（LibraryWorkPicker、附带作品、课程章节、打开作品）= 库条目名，非种类，保留；「作品图」= 图集名，非种类，保留；「抄袭、盗用他人作品」「作品集」「图表成品」「把素材剪成成片」（原始素材）「专业服务站网页」「交付一件成品」也保留；「服务端/服务器」不动。
- 数字商品 -> 现成文件（ServiceCard 徽标按 listing_kind 五类都给对）；素材（预览里「这份素材」）-> 文件。
- AutomationSettingsSection：只有「上架到 Bay」，无退役种类名，不改。

## 正在做
- 第 1 步：逐句落定新中文（见 /tmp/w03/decisions.json 若存在），再改源码、写分表、改测试。

## 下一步
1. 改源码（按目录：apps -> app* -> seller -> supply -> deal -> orders -> form -> 注释）。
2. 新文案写进 lbp-w03-copy.ts（16 语）。
3. 测试：grep tests 找引用旧串的，精确替换；跑文案闸与相关测试；typecheck 不新增错误。
4. 交卷 verdicts/W03-delivery.md。

## 复现命令
见 _COMMON.md §2。单测：
cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<名字>.test.mjs

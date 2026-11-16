# ED-FIX1：收敛后编辑器测试修复

## 结论

指定 7 项均为陈旧测试或测试桩遗漏，未在本任务要求的行为中发现产品退化；只改测试，未改 src。
8 个要求的测试文件实际通过 78/78；typecheck、API/consumer 检查通过。
最终全量为 10105 pass / 63 fail / 15 cancelled / 10 skipped，exit 1；与给定基线 comm 对照新增 0 项。
遵守禁浏览器规则：另 1 项浏览器用例明确排除，不计入通过数；全量未宣称全绿。
工作树 `/root/wt/ED-FIX1-oceanleo-ui`，分支 `wt/ED-FIX1`，起点 `b530f284`。
任务消息未附实际 `-o` 路径，报告保存在本 worktree 的 `docs/runbooks/ED-FIX1-report.md`。

## 7 项逐项判定

| 原失败 | 判定与证据 | 本次修复 |
| --- | --- | --- |
| floating-panel：RichDoc Insert floats… | 陈旧。ED-B4 从 Insert 移走查找和字体，测试仍点击旧按钮。 | 改为当前 Table 行列选择与插入；保留 Library/task/project 三宿主按钮锚定及关闭验证，补强四种关闭的焦点断言。 |
| floating-panel：real InlineAdvancedWorkbenchShell… | 陈旧。断言已删除的「文档来源」。 | 检查真实 shell 中现有 Insert 入口、表格/分割线/代码块/引用块/图片操作与正文，不再要求删除项。 |
| floating-panel：narrow edit-bar More… | 陈旧。同样断言「文档来源」。 | 保留 StrictMode、单一 More、Insert creation tool 可达及展开断言，验证现有 Insert 正文。 |
| floating-panel：VP run 2 Link/Paragraph/Review… | 陈旧。`889cacfe`（ED-B4）主动删除 `typography-reset` 与「恢复默认排版」。 | 改为操作实际段前距字段，验证 paragraph.spaceBefore=3 到达命令链；三面板 Back、返回父层、位置不移动均保留。 |
| W08：Insert drawer copy… | 陈旧。仍要求文档来源、导入文档、旧 3×3 表格、Insert 说明/字体预设词条。 | 检查现有 Insert 10 个 W08 key，含表格/行数/列数/插入表格；按 LOCALES 验证完整 16 语集合与无中文泄漏。 |
| working-copy-runtime 整文件退出 1 | 测试桩陈旧。首个加载错误明确为 RichDocFindReplace 缺失；同一路由还新增 RichDocImageCropControls。 | 补齐这两个界面组件导出；真实 Tiptap、工作副本保存/恢复、Y.Doc 协同和性能断言继续运行，不替换保存逻辑。 |
| entry-wiring：批注侧栏 prop… | 陈旧。ED-B4 为直接新增批注增加 hasSelection/onAddComment，旧接线表仅 12 项。 | 补入 hasSelection→review.hasSelection、onAddComment→review.addComment，全部 14 项继续与接口、引擎成员及 JSX 三方逐项校验。 |

ED-B2 将创建工具迁入唯一 SelectionToolbar 的契约保持不变；未恢复被要求删除的 UI。

## 改动文件（相对 worktree，file:line）

- `tests/edit-bar-floating-panel.test.mjs:122`：共享当前 Insert 正文断言；`:164` 三宿主插入与焦点；`:311` 真实 shell；`:378` 窄栏 More；`:504` 嵌套面板段前距操作。
- `tests/editor-overhaul-w08-material-insert.test.mjs:42`：当前 W08 Insert 文案与 16 语完整性。
- `tests/editor-working-copy-runtime.test.mjs:44`：补齐界面桩导出。
- `tests/entry-wiring-a1-a2.test.mjs:228`：对齐 14 项批注侧栏接线。

## 实际验证

bootstrap 已运行；重任务通过 `agent-io-guard.sh run-heavy`，小范围任务用 run-light。
未安装依赖；既有 node_modules 软链保持未跟踪，未加入提交。

| 命令 | 结果与日志 |
| --- | --- |
| 用户给定的四文件 node --test 命令（修改前） | exit 1，36 pass / 7 fail，复现全部指定问题；`/tmp/ed-fix1-before.log`。 |
| npm run typecheck | exit 0；`/tmp/ed-fix1-typecheck.log`。 |
| npm run api:check | exit 0；`/tmp/ed-fix1-api-check.log`。 |
| npm run consumers:check | exit 0，35 consumers / 38 explicitly exported specifiers；`/tmp/ed-fix1-consumers-check.log`。 |
| 下列八文件专项 | exit 0，78 pass / 0 fail / 0 cancelled / 0 skipped；`/tmp/ed-fix1-focused-final.log`。 |
| 首轮 npm test（隔离环境） | exit 1；10194 tests / 10104 pass / 65 fail / 15 cancelled / 10 skipped；`/tmp/ed-fix1-full-first.log`。基线外 2 项均由隔离配置产生，见下文，不宣称无新增。 |
| 隔离配置定向验证（两份 W10 文件） | exit 0，3/3；`/tmp/ed-fix1-isolation-check.log`；禁执行的浏览器用例明确排除，不计入通过数。 |
| 第二轮 npm test（校正隔离配置，见下文） | exit 1；10193 tests / 10105 pass / 63 fail / 15 cancelled / 10 skipped；耗时 1122.4 秒；`/tmp/ed-fix1-full.log`，统计 `/tmp/ed-fix1-test-summary.json`。 |
| oceanleo-dev-slots-fresh.sh | exit 0，1 slot / 0 STALE；`/tmp/ed-fix1-dev-slots.log`。检查的是主检出槽状态，不代表 worktree 已合并或部署。 |
| git diff --check | exit 0。 |

专项命令（前缀为 `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy --`）：

```sh
node --import ./tests/helpers/assert-dom-guard.mjs \
  --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs \
  --test --test-concurrency=2 \
  tests/edit-bar-floating-panel.test.mjs \
  tests/editor-overhaul-w08-material-insert.test.mjs \
  tests/editor-working-copy-runtime.test.mjs \
  tests/entry-wiring-a1-a2.test.mjs \
  tests/editor-toolbar-profile-parity.test.mjs \
  tests/richdoc-toolbar-engine-parity.test.mjs \
  tests/edit-bar-visual-system.test.mjs tests/edit-bar-single-row.test.mjs
```

全量实际命令为 guard run-heavy 执行 `/tmp/ed-fix1-run-full.sh`，脚本内运行 `npm test`，不排除测试文件。
因共同规则禁止浏览器与主检出写入，使用 bwrap：根文件系统只读，只有本 worktree、/tmp 可写；
原生仓库历史 evidence 路径映射到 `/tmp/ed-fix1-evidence`，不写入真实主检出；
Chromium 缓存映射为空目录，PLAYWRIGHT_BROWSERS_PATH 指向 `/tmp/ed-fix1-empty-browsers`。
有可用性探针的浏览器用例按原探针决定跳过。无探针的 W10 design-canvas 用例首轮尝试 launch 后因二进制不可达而失败，未启动浏览器。
另一个首轮基线外失败来自旧 timeline 测试需要读取历史 `offline.json`，而隔离 evidence 目录缺少该输入。
已仅将主检出中这份既有 JSON 复制到临时 evidence 目录，定向复跑通过，未改原件。
第二轮额外设置 `NODE_OPTIONS='--test-skip-pattern="^design-canvas load/mutate/undo/save/reopen/export while remote sites are blocked$"'`，
明确排除这 1 项规则禁止的浏览器用例；Node 22 不把 skip-pattern 排除项计入 tests/skipped，不能将其算成通过。
其他用例保持原样；未改断言、基线或源码。浏览器相关用例不作为本次验收证据。
最终 10 个 skip 包含 8 个浏览器探针跳过及 2 个既有 skip。

第二轮脚本的执行主体如下（外层仍通过 run-heavy；历史 JSON 已复制到临时 evidence/W10/video-timeline）：

```sh
bwrap --ro-bind / / --proc /proc --dev-bind /dev /dev \
  --bind /tmp /tmp --bind "$PWD" "$PWD" \
  --bind /tmp/ed-fix1-evidence /root/projects/oceanleo-app/docs/react-client-rebuild/evidence \
  --tmpfs /root/.cache/ms-playwright \
  --setenv PLAYWRIGHT_BROWSERS_PATH /tmp/ed-fix1-empty-browsers \
  --setenv NODE_OPTIONS '--test-skip-pattern="^design-canvas load/mutate/undo/save/reopen/export while remote sites are blocked$"' \
  --chdir "$PWD" -- npm test
```

## 全量失败清单与基线对照

按与基线一致的 TAP 顶层 `not ok` 标题提取，含取消与文件加载失败，不与 fail 计数混用。
基线原件 `/tmp/ui-baseline-fails.txt` 未改：78 行、去重 77 个标题（既有统计为 66 fail / 15 cancelled）。
最终原始失败标题 75 行：`/tmp/ed-fix1-full-fails.txt`；去重 74 项：`/tmp/ed-fix1-full-fails.sorted`。
实际执行（均 exit 0）：

```sh
LC_ALL=C sort -u /tmp/ui-baseline-fails.txt -o /tmp/ed-fix1-baseline-fails.sorted
LC_ALL=C sort -u /tmp/ed-fix1-full-fails.txt -o /tmp/ed-fix1-full-fails.sorted
LC_ALL=C comm -13 /tmp/ed-fix1-baseline-fails.sorted /tmp/ed-fix1-full-fails.sorted > /tmp/ed-fix1-added-fails.txt
LC_ALL=C comm -23 /tmp/ed-fix1-baseline-fails.sorted /tmp/ed-fix1-full-fails.sorted > /tmp/ed-fix1-baseline-only.txt
LC_ALL=C comm -12 /tmp/ed-fix1-baseline-fails.sorted /tmp/ed-fix1-full-fails.sorted > /tmp/ed-fix1-matched-fails.txt
```

`wc -l` 实测：新增 0、共同失败 74、仅基线 3。仅基线三项如下，本轮未复现，不将其全部归功于本次修改：

- VS1 document matrix: 20 isolated edits + 3 bursts, small/40-page native models at 0/150ms RTT
- deck source failure cannot be described or handed off as a blank draft
- native deck and rich-doc routes reject persistence until source content loaded

首轮原始失败标题保留于 `/tmp/ed-fix1-full-first-fails.txt`，对应两项隔离差异已在上文列明。

## 未证实 / 未做

- 所有指定浮层、More、Back、焦点与 PDF Find/Signature StrictMode 行为由真实组件 jsdom 测试验证；名字带 browser regression 的用例仍是 DOM 单测，不是浏览器验收。
- 无浏览器、截图、真机或原生 build/安装；未改后端或 Rust，因此不适用 pytest/cargo。
- 未合并、push、部署、重建 dev 槽、更新消费者版本；由父进程负责。
- 最终「新增 0」仅指上述实际执行范围与给定基线的失败标题对照，不包含被排除的 1 项浏览器用例。

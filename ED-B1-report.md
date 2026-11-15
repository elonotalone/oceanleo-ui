# ED-B1 编辑器死代码清理报告

结论：代码清理已完成；typecheck、API 和消费者检查通过，全量 npm test 未通过，详见下文结果与基线对照。

- 分支 `wt/ED-B1`，基线 `543985c9`；仅修改本 worktree，未 push。
- 删除审计候选 18 个源码文件（7,753 行）及 grid-model 旧写入器/私有辅助函数 119 行。
- 代码与测试统计（不含本报告）：`git diff 543985c9 --shortstat -- src tests`：`53 files changed, 370 insertions(+), 10225 deletions(-)`。
- 源码新增 187、删除 7,916，净减 7,729 行；测试新增 183、删除 2,309，净减 2,126 行；合计净减 9,855 行。
- 先迁移缺失的 XLSX 能力：公式缺缓存时跨表/命名区域/共享公式补算；空白与唯一/重复值规则；停用与 stopIfTrue；命名区域下拉；署名表与许可元数据；固定时间导出。已有公式缓存仍优先保留，无法补算时明确提示。
- 清理 24 个只在已删除代码中使用的 i18n 缺口登记；逐条比对基线调用位置，现用源码无同名声明，原间接引用清单及上限保持 18。
- `TiptapNode`/`TiptapMark` 抽到独立类型文件；保留现用 Umo 解包、Univer、Fabric SVG 清洗/schema、视频编辑栏、three.js/Director。
- package.json 显式 exports 与 shell barrel 未变；移除的公共导出：**无**；API 快照无需更新。

改动文件清单（删除文件使用原文件第 1 行；其余为首个改动位置）：

- `src/shell/AdvancedStructuredEditors.tsx:1`（删除）。
- `src/shell/doc-editors/DeckMiniSlide.tsx:12`（修改）。
- `src/shell/doc-editors/DeckSlideRail.tsx:1`（删除）。
- `src/shell/doc-editors/GridWorkbookExport.ts:1`（删除）。
- `src/shell/doc-editors/RichDocEditor.tsx:1`（删除）。
- `src/shell/doc-editors/grid-format/xlsx-round-trip.ts:1`（删除）。
- `src/shell/doc-editors/grid-formula.ts:184`（修改）。
- `src/shell/doc-editors/grid-model.ts:921`（修改）。
- `src/shell/doc-editors/grid-univer/facade-commands.ts:872`（修改）。
- `src/shell/doc-editors/grid-univer/snapshot.ts:7`（修改）。
- `src/shell/doc-editors/grid-univer/xlsx-export.ts:21`（修改）。
- `src/shell/doc-editors/rich-doc-tiptap-types.ts:1`（新增）。
- `src/shell/doc-editors/rich-doc-umo-migration.ts:1`（删除）。
- `src/shell/doc-editors/rich-doc-wechat-export.ts:12`（修改）。
- `src/shell/editor-core-flags.ts:1`（删除）。
- `src/shell/image-editor/ImageCanvasViewSwitch.tsx:1`（删除）。
- `src/shell/image-editor/design-mode/photo-adjust-panel.ts:1`（删除）。
- `src/shell/image-editor/fabric-image-filter-controls.ts:1`（删除）。
- `src/shell/media-editors/model3d-next-conversion.ts:1`（删除）。
- `src/shell/media-editors/model3d-next-l4-chips.ts:1`（删除）。
- `src/shell/media-editors/model3d-next-plan.ts:1`（删除）。
- `src/shell/vector-editor/VectorContextToolbar.tsx:1`（删除）。
- `src/shell/vector-editor/VectorStage.tsx:1`（删除）。
- `src/shell/vector-editor/use-vector-editor.ts:1`（删除）。
- `src/shell/vector-editor/vector-source.ts:1`（删除）。
- `src/shell/video-editor/ClipInspector.tsx:1`（删除）。
- `src/shell/video-editor/VideoTimelineControls.tsx:7`（修改）。
- `tests/W6-r4-remaining-families.test.mjs:11`（修改）。
- `tests/advanced-canva-interactions.test.mjs:16`（修改）。
- `tests/advanced-editor-v8-doc-grid-chart-model3d.test.mjs:15`（修改）。
- `tests/audio-single-mode.test.mjs:34`（修改）。
- `tests/b16-read-failure-no-blank.test.mjs:21`（修改）。
- `tests/collab-visual-readonly.test.mjs:336`（修改）。
- `tests/design-mode.test.mjs:34`（修改）。
- `tests/editor-core-flags-and-mode.test.mjs:1`（修改）。
- `tests/editor-repair-acceptance-source-load.test.mjs:232`（修改）。
- `tests/focus-ring-budget.test.mjs:267`（修改）。
- `tests/g1-wave-tap-targets.test.mjs:103`（修改）。
- `tests/grid-carrier-contract.test.mjs:32`（修改）。
- `tests/grid-formula-legacy-entry.test.mjs:56`（修改）。
- `tests/grid-univer-snapshot-conversion.test.mjs:375`（修改）。
- `tests/grid-univer-wiring.test.mjs:21`（修改）。
- `tests/grid-univer-xlsx-export.test.mjs:245`（修改）。
- `tests/grid-xlsx-round-trip.test.mjs:1`（删除）。
- `tests/hit-target-budget.test.mjs:331`（修改）。
- `tests/i18n-tt-key-coverage.test.mjs:627`（修改）。
- `tests/image-canvas-view.test.mjs:65`（修改）。
- `tests/model3d-legacy-camera-view.test.mjs:1`（删除）。
- `tests/model3d-next-core.test.mjs:1`（删除）。
- `tests/office-real-file-roundtrip.test.mjs:35`（修改）。
- `tests/rich-doc-umo-migration.test.mjs:1`（删除）。
- `tests/route-context-editors.test.mjs:4`（修改）。
- `tests/vector-carrier-sanitize.test.mjs:11`（修改）。

逐组零引用证据：

- 每组删除前均执行 `rg -n --hidden -g "!.git/**" -g "!node_modules/**" -g "!docs/**" -g "!.ed-b1/**" "<组内模块名>" .`，再核对 AST 路径引用与显式 exports。
- AST 检查覆盖 3,458 个仓内非 docs 代码文件，含 tests、shell/index.ts、字面动态 import/require/文件路径；候选组外正向消费者为 0。
- 旧文档组合/flags（4 文件、802 行）：组外正向引用 0；RichDocEditorState/useRichDocEditor 等是保留路径，禁止挂载断言及历史预算记录不是消费者。
- 旧 XLSX 写入器（2 文件、2,287 行）：组外正向引用 0；GridWorkbookExport 的剩余文本仅为固定历史 commit 的预算对账。
- Umo migration（1 文件、626 行）：微信导出 type-import 已改到 rich-doc-tiptap-types；旧模块组外引用 0。
- Vector UI/hook/source（4 文件、2,659 行）：组外引用 0，sanitizer/schema/Fabric SVG 未删除；保留净化测试。
- ClipInspector（1 文件、410 行）：组外引用 0，现用 video-edit-bar 保留。
- 图片旧面板（3 文件、334 行）：组外正向引用 0；剩余名称仅为“不挂载旧开关”的负向检查。
- model3d-next（3 文件、635 行）：组外引用 0，当前 three.js runtime 与 Director 保留。
- grid-model 旧导出：删除前 `rg -n buildGridWorkbookBlob`（排除 docs/node_modules/临时日志）仅命中定义；改接现用写入器后删除 119 行。
- 仓外按 TSV 核对 35 个消费者、4,164 个代码文件，无正向导入/调用。原始 rg 命中 2 条，均为 `/root/projects/design/tests/design-host-contract.test.mjs:141,158` 的负向存在性断言（最终 assert false），无需改仓外代码。

验证结果：

- `npm run typecheck`：通过（exit 0）。
- `npm test`：**未通过（exit 1）**；tests 10122, pass 10028, fail 48, cancelled 15, skipped 31, todo 0。
- `npm run api:check`：通过（exit 0）。
- `npm run consumers:check`：通过（exit 0）；35 consumers use 38 explicitly exported specifiers。
- 最终四项经 `agent-io-guard.sh run-heavy -- bash .ed-b1/verify-final.sh` 顺序执行。
- XLSX 定向实文件往返：经 `run-light` 运行 grid-univer-xlsx-export、grid-univer-snapshot-conversion、office-real-file-roundtrip、advanced-editor-v8-doc-grid-chart-model3d 四个测试文件：67/67 通过。
- 源码生命周期定向：经 run-light 运行 W6-r4-remaining-families、advanced-canva-interactions、b16-read-failure-no-blank、editor-repair-acceptance-source-load 四份测试：17/17 通过；b16 改验现用 captureRecovery 的源就绪保护。
- 模式与接线定向：经 run-light 运行 editor-core-flags-and-mode、grid-univer-wiring、image-canvas-view、design-mode 四份测试：76/76 通过。
- 现用路径定向：经 run-light 运行 grid-carrier-contract、collab-visual-readonly、route-context-editors、vector-carrier-sanitize 四份测试：61/61 通过。
- 静态预算定向：`node --test ... tests/focus-ring-budget.test.mjs tests/hit-target-budget.test.mjs tests/grid-formula-legacy-entry.test.mjs`：25/28 通过、3 条未通过；涉及本任务未修改的界面文件。
- 未修改基线复测：将 `git archive 543985c9 src tests package.json` 解到 worktree 临时目录，按 `--test-name-pattern="^不许内部对冲|^欠账只减不增"` 运行前两份测试：4 条中 1 通过、同名 3 条失败。命中区基线 159/98，清理后 154/93，均超预算 61；本次只减去已删除旧代码的预算。
- i18n 登记修正后定向复测：10 条中 9 通过、1 条为已在基线复现的全仓译文缺口；死登记核对通过。
- `git diff --cached --check`：通过。
- `agent-bootstrap.sh`：**未通过，exit 128**，共享 oceandino 的 index.lock 已存在；未删除锁，也未重试会切换/改动主检出的 bootstrap。


全量未通过归因（顶层 not ok 记录，包含取消；嵌套用例总数以 npm 汇总为准）：

- 同名失败在未修改的 543985c9 归档中复现 59/60 条；归档及探针已清理。
- 基线对照经 run-light 分组运行同名测试文件；已剔除归档目录导致的额外历史自检失败，只匹配当前同名用例。
- 已复现的存量失败涉及设备/认证/会话、现用外壳、动效与文案等模块；本批保留现用实现，相关预算按实际删除量收紧。

| 文件（首条失败位置） | 本轮记录 | 基线复现 |
|---|---:|---:|
| tests/c11-fw-devices-session-intent.test.mjs:76 | 7 | 7 |
| tests/c12-web-current-geometry.test.mjs:71 | 2 | 2 |
| tests/client-ui-host-auth.test.mjs:128 | 19 | 19 |
| tests/computer-conversations-i18n.test.mjs:123 | 2 | 2 |
| tests/d4-inline-shell-page-feedback.test.mjs:128 | 1 | 1 |
| tests/e2-result-canvas-stability.test.mjs:1 | 1 | 1 |
| tests/e2-right-pane-claims.test.mjs:1 | 1 | 1 |
| tests/eas-w13-right-maximize.test.mjs:1 | 1 | 1 |
| tests/editor-working-copy-runtime.test.mjs:119 | 1 | 0 |
| tests/effect-tt-dependency.test.mjs:288 | 3 | 3 |
| tests/focus-ring-budget.test.mjs:331 | 1 | 1 |
| tests/g3-website-material-restore.test.mjs:1 | 1 | 1 |
| tests/gateway-fetch-credentials.test.mjs:97 | 1 | 1 |
| tests/history-cross-device-contract.test.mjs:20 | 1 | 1 |
| tests/hit-target-budget.test.mjs:456 | 2 | 2 |
| tests/i18n-tt-key-coverage.test.mjs:948 | 1 | 1 |
| tests/im-conversation-store.test.mjs:321 | 3 | 3 |
| tests/local-task-device-bridge-w7.test.mjs:183 | 1 | 1 |
| tests/loopback-trust-source-set.test.mjs:216 | 1 | 1 |
| tests/media-source-integrity.test.mjs:163 | 1 | 1 |
| tests/motion-no-raw-duration.test.mjs:162 | 1 | 1 |
| tests/motion-token-adoption.test.mjs:396 | 2 | 2 |
| tests/motion-tokens.test.mjs:314 | 1 | 1 |
| tests/p3-pipeline.test.mjs:174 | 2 | 2 |
| tests/sko-w12-config-card.test.mjs:189 | 1 | 1 |
| tests/template-showcase.test.mjs:508 | 1 | 1 |
| tests/w25-tests-out-of-repo-paths.test.mjs:204 | 1 | 1 |

- 尚未证实归因：1 条；具体复测结果见下文。


性能单项复测：

- `node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test --test-concurrency=2 --test-timeout=180000 --test-name-pattern='^VS1 document matrix' tests/editor-working-copy-runtime.test.mjs`：经 run-light 在工作树和 543985c9 归档各执行一次。
- 工作树 1/1 通过，最大编辑到确认 326.4ms；基线 1/1 通过，最大 334.8ms。
- 完整套中的 40 页/150ms RTT 突发输入曾达 603.2ms（上限 500ms），本次独立复测未复现；根因未证实，完整套仍计为未通过，阈值保持 500ms。
- 关键保存链路、RichDoc 路由/hook 及该测试本身相对 543985c9 无代码差异。

未证实/未做：

- 未做浏览器、Playwright、截图、真实客户端或原生 build/安装；未验证屏幕外观。
- 未 push、合并 main、部署或重建 LeoDev slot；父进程负责合并与部署后的验证。
- 未修改任意 `/root/projects/*` 主检出；既有 node_modules 符号链接保持原样，未安装依赖。
- 未给出实际 `-o` 路径，因此报告保存在本 worktree 的 `ED-B1-report.md`。
- 仓外结论覆盖 TSV 登记消费者；不声称穷尽未登记私有仓库。

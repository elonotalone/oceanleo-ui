# ED-B6：Library / 视频画布 / PPT 修复报告

## 结论

三项修复已在指定 worktree `wt/ED-B6` 完成，最终代码提交 `b57df16a`；相关聚焦检查均通过。
类型、API、消费者检查通过；**完整验收未通过**。最终全量共 10248 项：10151 通过、51 失败、15 取消、31 跳过，退出 1。
首轮由本单元触发的九项检查在最终全量中均通过。另一个旧源码定位断言已修正并独立 5/5 复验通过，但保留本轮全量未通过的真实结果。

- 视频画布优先显示实际解码成功的位图；没有预览或图片损坏时，读取当前 head 的工程摘要，展示标题、场景、镜头、时长。工程 JSON 不再进入 iframe。
- Library 分开记录 mine、favorites、pagination、intent；按阶段重试，保留同账号已验证快照，缺失条目只出现局部卡片，不污染列表通知。
- PPT 超过 4px 才开始捕获指针；保留双击、Enter/F2、拖动、缩放与旋转，选中文字显示“双击编辑文字”提示。
- 沿用 `AdvancedContentWorkbench.tsx:832 → VideoCanvasRoute.tsx:18 → LibraryVideoCanvas.tsx:49` 编辑链，没有另造编辑器。

## 改动文件清单

- `src/shell/library-viewers.tsx:1620`：只读预览、位图错误回退、加载取消、错误重试与显式分派。
- `src/shell/video-canvas/library-preview.ts:18`：v2/位图判别、工程解析与当前 head 摘要；旧网页须同时符合 HTTP(S)、HTML 声明和正文验证。
- `src/shell/MyLibrary.tsx:774`：四阶段状态、独立清理、深链、分页与同游标重试、条目局部卡片。
- `src/shell/library-load-failure.ts:1`：失败阶段、分页页码及提示/重试文案。
- `src/shell/doc-editors/DeckStage.tsx:64`：接入私有指针 hook、编辑提示和权限闸门，文件 477 行；忽略子元素冒泡的捕获丢失事件。
- `src/shell/doc-editors/use-deck-element-interaction.ts:21`：延后捕获、按 pointerId 结束/取消与一次提交，独立管理生命周期。
- `src/shell/doc-editors/deck-text-gesture.ts:65`：CSS 像素拖动阈值。
- `tests/ed-b6-video-preview.test.mjs:85`：9 项查看器行为回归。
- `tests/ed-b6-library-failures.test.mjs:150`：12 项真实 MyLibrary 状态/恢复回归，含服务/账号归属信息与短页页码。
- `tests/ed-b6-deck-gesture.test.mjs:149`：10 项真实 DeckStage 事件/几何/权限回归。
- `tests/doc-editor-source-failure-panel.test.mjs:23`：定位实际失败面板，避免新增编辑守卫被误识别，保留原因/重试断言。
- `tests/advanced-native-editors.test.mjs:71`：沿 Stage→私有交互 hook 检查移动、缩放和旋转，适配必要的文件拆分。
- `tests/workspace-template-deeplink.test.mjs:485`：模板深链失败必须落到条目错误卡片，替代已移除的整栏 failed 状态检查。
- `src/theme/ui.css:1`：按仓库配方重建生成产物，补齐预览布局并移除不再使用的旧视频样式。
- `docs/work-logs/2026-11-15-ed-b6/任务书.md:1`：已提交的并行所有权与边界。
- `docs/work-logs/2026-11-15-ed-b6/ED-B6-report.md:1`：本报告。

## 验证结果

重检查统一使用 `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- …`；普通聚焦检查使用 `run-light`，包含 CSS 构建的测试仍使用 `run-heavy`。

- `npm run typecheck`：最终代码复验通过，退出 0；日志 `/tmp/ed-b6-typecheck-final.log`；首轮也通过（guard 排队 2260 秒后执行）。
- `npm test`（最终产品代码全量）：**未通过，退出 1**；10151 通过 / 51 失败 / 15 取消 / 31 跳过，总计 10248；实际执行约 28 分钟，guard 排队 2677 秒；日志 `/tmp/ed-b6-npm-test-final.log`。
- 首轮 `npm test`：未通过，退出 1；10248 项中 10143 通过、59 失败、15 取消、31 跳过，耗时约 31 分钟；日志 `/tmp/ed-b6-npm-test.log`。
- `npm run api:check`：最终复验通过，退出 0；日志 `/tmp/ed-b6-api-check-final.log`。
- `npm run consumers:check`：最终复验通过，退出 0；35 consumers / 38 explicitly exported specifiers；日志 `/tmp/ed-b6-consumers-check-final.log`。
- 聚焦测试公共命令前缀：`node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test`（各日志首行保留完整参数）。
- 上述前缀加 `--test-concurrency=2 --test-timeout=180000 tests/ed-b6-video-preview.test.mjs tests/ed-b6-library-failures.test.mjs tests/ed-b6-deck-gesture.test.mjs tests/advanced-canva-interactions.test.mjs`：主代理独立运行，35/35 通过；日志 `/tmp/ed-b6-parent-final-focused.log`。
- 上述前缀加 `tests/doc-editor-source-failure-panel.test.mjs`：主代理独立运行，3/3 通过；日志 `/tmp/ed-b6-failure-panel.log`。
- 上述前缀加 `tests/library-preview-landing.test.mjs`：主代理在回调命名修正后独立运行，14/14 通过；日志 `/tmp/ed-b6-parent-preview-compat.log`。
- 上述前缀加 `tests/workspace-template-deeplink.test.mjs`：42/42 通过；日志 `/tmp/ed-b6-template-deeplink.log`。
- Library 子任务：新增测试 + `tests/library-stability.test.mjs tests/one-library.test.mjs tests/artifact-surface-rendered.test.mjs`，93/93 通过；日志 `/tmp/ed-b6-library-compat.log`。
- Library 回调命名修正后：新增测试 + `tests/library-preview-landing.test.mjs`，26/26 通过；日志 `/tmp/ed-b6-library-preview-compat.log`。
- PPT 子任务：新增测试 + `tests/deck-ooxml-editability.test.mjs tests/advanced-canva-interactions.test.mjs`，20/20 通过；日志 `/tmp/ed-b6-deck-size-repair.log`。
- 子元素捕获丢失冒泡边界补充后，新增 PPT 测试 + `tests/advanced-canva-interactions.test.mjs tests/doc-editor-source-failure-panel.test.mjs`，17/17 通过；日志 `/tmp/ed-b6-deck-bubbled-capture.log`。
- 全量期间仅更正旧静态断言的源码位置：`tests/advanced-native-editors.test.mjs` 5/5 复验通过（`/tmp/ed-b6-native-hook-wiring.log`），未改产品代码。
- `tests/org-library.test.mjs`：本轮全量有失败，独立复验 6/6 通过；日志 `/tmp/ed-b6-org-library-recheck.log`，间歇失败原因未证实。
- 视频子任务：新增测试，9/9 通过；日志 `/tmp/ed-b6-video-focused.log`。
- 视频 JSON 含 HTML 字样的边界补充后重跑新增测试：9/9 通过；日志 `/tmp/ed-b6-video-markup-json.log`。
- `npm run build:css`：通过，退出 0；仅 `src/theme/ui.css` 发生生成差异；日志 `/tmp/ed-b6-build-css.log`。
- 重建并提交产物后运行 `tests/theme-artifact-in-sync.test.mjs`（公共 node 前缀、`--test-timeout=180000`、`OCEANDINO_FORCE_HEAVY=1`、run-heavy）：3/3 通过；日志 `/tmp/ed-b6-theme-sync.log`。
- `git diff --check`：通过。
- `git diff --exit-code b57df16a HEAD -- src/`：通过，退出 0；最终全量期间产品源码保持不变。
- `OCEANLEO_UI_DIR=/root/wt/ED-B6-oceanleo-ui bash /opt/cursor-workspaces/oceandino/scripts/oceanleo-dev-slots-fresh.sh status`：最终只读复查通过，退出 0，1 个 dev 槽 / 0 STALE；日志 `/tmp/ed-b6-dev-slots-final.log`。
- `bash /opt/cursor-workspaces/oceandino/scripts/agent-bootstrap.sh`：未通过，退出 128，主共享仓库已有 `index.lock`；未删除锁，未再次运行切换主检出步骤。
- 测试开发中的漏导出桩、visibility gate 等待、旋转吸附终点、strip-only 参数属性问题均已修正，最终聚焦测试全绿。
- 首轮全量发现的本任务问题已修复：DeckStage 超过 600 行，Library 服务/账号归属提示兼容 4 项；没有放宽既有测试断言。
- 已修复失败面板旧测试的错误定位和预览回调命名兼容；前者保留原因/重试检查，后者不改旧断言。
- 首轮九个相关失败在最终全量的 342、972、974、976、977、4011、6597、9111、10194 号用例均通过。
- 额外聚合六文件的 `run-light` 被预检拒绝（64，未执行测试）；未强制绕过，最终全量已按 `run-heavy` 执行。

最终全量未通过范围如下（按文件去重，取消项包含在原始日志中；未提高预算或放宽权限要求）：

| 测试文件及首个失败位置（`tests/` 下） | 现象 / 处理 |
| --- | --- |
| `advanced-native-editors.test.mjs:71` | 旧 Stage 源码位置断言；已沿 hook 检查真实调用，独立 5/5 通过 |
| `b16-read-failure-no-blank.test.mjs:13` | 未修改的 DeckRoute 保存闸门 / 恢复接口静态断言不匹配 |
| `c11-fw-devices-session-intent.test.mjs:76` | 设备会话点击、恢复状态断言不匹配 |
| `c12-web-current-geometry.test.mjs:71` | 远程桌面几何与输入状态断言不匹配 |
| `client-ui-host-auth.test.mjs:128` | 宿主认证 / 超时断言与 pending Promise，后续用例取消 |
| `computer-conversations-i18n.test.mjs:123` | 电脑对话文案译文缺口 |
| `d4-inline-shell-page-feedback.test.mjs:128` | 工具面板预期 DOM 节点未找到 |
| `e2-result-canvas-stability.test.mjs:1` | 夹具缺少 PluginThemeScope 导出，文件未运行 |
| `e2-right-pane-claims.test.mjs:1` | 同类夹具导出缺失，文件未运行 |
| `eas-w13-right-maximize.test.mjs:1` | 同类夹具导出缺失，文件未运行 |
| `effect-tt-dependency.test.mjs:288` | 写状态的翻译依赖 effect 未登记，预算仍为 0 |
| `focus-ring-budget.test.mjs:330` | 多文件焦点样式登记与现状不符 |
| `g3-website-material-restore.test.mjs:1` | 测试文件载入失败，详见完整日志 |
| `gateway-fetch-credentials.test.mjs:97` | bay/public、cloud-agent-api 请求缺 credentials: include |
| `history-cross-device-contract.test.mjs:20` | 桌面历史范围断言不匹配 |
| `hit-target-budget.test.mjs:458` | 交互命中区预算 / 文件登记超限 |
| `i18n-tt-key-coverage.test.mjs:972` | 全仓翻译 key 缺口超出登记基线 |
| `im-conversation-store.test.mjs:321` | 表情与线程状态断言失败 |
| `local-task-device-bridge-w7.test.mjs:183` | 设备权限拒绝提示不符合断言 |
| `loopback-trust-source-set.test.mjs:216` | 出现登记外的本机接口调用点 |
| `media-source-integrity.test.mjs:163` | 时间线持久化源契约静态断言不匹配 |
| `motion-no-raw-duration.test.mjs:162` | 其他文件存在裸动效时长 |
| `motion-token-adoption.test.mjs:396` | 默认动效档 / 裸时长登记断言失败 |
| `motion-tokens.test.mjs:314` | 手写动画有裸时长回退值 |
| `org-library.test.mjs:288` | 全量未触发撤回 mock；独立 6/6 通过，原因未证实 |
| `p3-pipeline.test.mjs:174` | flush 失败状态与离开策略断言不匹配 |
| `sko-w12-config-card.test.mjs:189` | “+” 卡片交互断言失败 |
| `template-showcase.test.mjs:508` | 17 语素材搜索 / 空态文案缺口 |
| `w25-tests-out-of-repo-paths.test.mjs:204` | 有未登记的仓外绝对路径夹具 |

## 未证实/未做

- 未运行浏览器、Playwright、截图或真实设备验证；没有证实原截图的实际 dblclick/pointercapture 事件序列或网络根因。
- 未访问实际私有条目的 source/full/preview；没有声称线上图片、真实 API 或视觉效果已验收。
- 未完整运行修改前的全量基线；剩余失败即使涉及未改动文件，也不能一概认定为历史故障。
- 剩余失败涉及本单元三项修复之外的实现，未扩大修改范围；父进程负责合并后整体验证。
- 未在纯静态测试定位修正后第三次重复全仓测试；该文件已独立 5/5 复验，产品源码始终未变。
- link-work helper 没有传回 HTTP 状态，故显示通用条目读取错误与重试；没有修改其公共 API。
- 未修改 panel CORS、iframe sandbox、权限政策、依赖或公开导出；未运行原生构建/安装或 backend pytest（本单元未改后端）。
- 未 push、合并、切换分支或部署；开发槽 FRESH 不表示本 worktree 的代码已合并进去，由父进程集成后验收。
- 原有未跟踪 `node_modules` 符号链接保持原样，不纳入提交。

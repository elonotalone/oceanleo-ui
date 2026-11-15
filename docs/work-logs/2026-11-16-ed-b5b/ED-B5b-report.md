# ED-B5b：PDF 与 Grid 编辑能力

## 结论

- 工作树 `/root/wt/ED-B5b-oceanleo-ui`，分支 `wt/ED-B5b`，任务基线 `7be10456`。只在本树修改并本地提交；没有 push、合并或部署。
- Grid 已提供 17/18 个文字 canon id，并补 justify；未声明当前排版器不读取的 letter-spacing。
- PDF FreeText 新增 case、clear-format，文字 canon 为 8/18；STAMP 新增 rotate，图片 canon 为 1/12（rotate）；移除不能保存的原 STAMP opacity 入口。
- 不宣称 PDF 已达到完整富文字或 Fabric 图片档；下表逐项列出尚未补齐的引擎能力。
- 本任务没有实际 `-o` 参数，报告放在当前工作树的本共享文档目录，供父进程整合。

## 改动文件（路径相对当前 worktree）

| file:line | 改动 |
| --- | --- |
| `src/shell/doc-editors/grid-univer/rich-text-commands.ts:27` | 链接输入校验、富文本读数、Unicode 大小写变长后的索引重映射、原生范围兼容。 |
| `src/shell/doc-editors/grid-univer/rich-text-commands.ts:99` | 原生段落列表、像素行距、链接、大小写、24px 缩进；保留原字体、范围和非链接标记。 |
| `src/shell/doc-editors/grid-univer/rich-text-commands.ts:174` | 同一选区以一条 native set-range-values 命令写入同一撤销栈；保留公式/数字/布尔，拒绝超过 10,000 格的文字转换。 |
| `src/shell/doc-editors/GridUniverStage.tsx:864`、`grid-univer/rich-text-commands.ts:10` | 转换前等待原生单元格输入提交；权限、工作簿或选区变化时中止，避免覆盖未保存输入。 |
| `src/shell/doc-editors/grid-univer/text-commands.ts:66` | 新文字命令和原生竖排 tr 接线。 |
| `src/shell/doc-editors/grid-univer/facade-commands.ts:480` | justify 写入原生 ht=4；无效/被内核拒绝的命令不报成功。 |
| `src/shell/doc-editors/grid-univer/text-bar.ts:163` | 读回全部新增状态，输出规范控件，公开字距缺口。 |
| `src/shell/doc-editors/grid-univer/selection-style.ts:71` | 从实际单元格富文本读取选区样式。 |
| `src/shell/doc-editors/grid-univer/xlsx-export.ts:194` | XLSX 竖排、列表可见符号、富文本字体和缩进；显式报告不能表达的段落语义。 |
| `src/shell/media-editors/pdf-selection-controls.ts:41` | 显式能力缺口；case、clear-format、STAMP 旋转；拒绝不属于当前批注的命令。 |
| `src/shell/media-editors/use-pdf-selection-adapter.ts:61` | 只派发当前选区提供的命令，保留 opacity-value 旧别名和 revision/只读门禁；case 先提交当前输入再读取新批注，不覆盖未失焦草稿。 |
| `src/shell/edit-bar-canon-table.ts:164` | 仅新增 Grid highlight=cell-background 的作用域表。 |
| `src/shell/selection-adapter.ts:7` | 仅新增作用域元数据，随 canon 投影保留；不改已有项的 label/kind/unit。 |
| `tests/grid-pdf-toolbar-roundtrip.test.mjs:1` | 真 Univer 命令、原生列表排版、保存重开/撤销、Pro 链接取消、XLSX 和 PDFium 外观流/像素往返。 |
| `tests/editor-toolbar-profile-parity.test.mjs:215` | 新能力 parity、PDF 480px 含选区的 More 可达性及实际 case/reset 派发。 |
| `tests/grid-univer-text-bar.test.mjs:42`、`tests/grid-univer-facade-commands.test.mjs:264` | 更新新增能力及拒绝命令的真实预期，保留 null/false 单元格读取成功语义。 |
| `tests/editor-overhaul-w06-pdf.test.mjs:454`、`tests/grid-univer-icons.test.mjs:43`、`tests/grid-univer-agent-review-gate.test.mjs:317` | 更新能力清单、真实链接面板图标和录制端口，保留 agent 零写入门禁。 |

## 引擎缺口与格式边界

| 范围 | 未补齐/限制 | 依据与行为 |
| --- | --- | --- |
| PDF 字体 | Helvetica / Times / Courier 三族 | 保持原下拉；没有伪造任意字体。既有 CJK 外观补偿保留。 |
| PDF 自由文本 | underline、strike、highlight、list、line-height、link、letter-spacing、vertical-text、indent-increase/decrease、justify | EmbedPDF 2.15 FreeText 编辑渲染固定 lineHeight=1.18，只读取基础字体/颜色/三向对齐；PdfTextAlignment 只有 0/1/2。DS/RC 存在于读取模型，但当前编辑渲染与 AP 写入链不实现上述格式；adapter 不声明这些 id。未另做只在屏幕生效的样式。 |
| PDF STAMP | replace、crop、flip-x/y、radius、border、opacity、adjust、alt、image-fit、remove-background | STAMP opacity 的原字段不被引擎读写，实测 40% 不改变像素且重开无此字段，已撤下该假能力；FreeText opacity 的像素及保存重开验证通过。当前 STAMP 属性/patch 命令面只实现几何旋转，不具备上述像素、边框与语义属性；本轮未扩展媒体替换/图像重写链，adapter 不声明这些能力。 |
| Grid 字距 | letter-spacing | Univer 0.25.1 的 sheet text shaper 不读取每字间距；未挂死控件。 |
| Grid 行距 | 原生按像素存储；实际行高不小于字形高度 | 写 spacingRule=2、snapToGrid=0；测试以 30px 的两行原生布局验证，不能据此声称任意小于字形的行距也会压缩字形。 |
| Grid 高亮 | 整个单元格底色 | canon 投影携带 engineScope=cell-background，命令仍写 bg；不是部分选中文字高亮。 |
| XLSX | 固定段落行距、可编辑列表、像素缩进不能完全表达 | 保留可见编号/符号、可表达的段内字体、竖排/justify/链接；缩进换成级数。链接与混合字体同时存在时使用首段字体并提示；普通统一字体的加粗/字号会保留。导出 dropped 明示降级，原生 JSON 项目完整保存上述属性。 |
| 命令范围 | 格式作用于整个单元格或整条 PDF FreeText | 不声称支持批注内部分字符格式；Grid 文字转换跳过公式、数值、布尔，不把计算内容转成文本。 |

## 验证（实际执行）

- `npm run typecheck`：冻结版本退出 0；日志 `/tmp/ed-b5b-typecheck-accept.log`。
- `npm run api:check`：冻结版本退出 0；`/tmp/ed-b5b-api-accept.log`。
- `npm run consumers:check`：冻结版本退出 0，35 consumers / 38 explicitly exported specifiers；`/tmp/ed-b5b-consumers-accept.log`。
- 四文件专项：62/62 通过；`/tmp/ed-b5b-focused.log`。命令为 Node `--import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test --test-concurrency=2 --test-timeout=180000` 加上述两份新增/扩展测试及 `grid-univer-text-bar`、`grid-univer-facade-commands`。
- 最终 Grid 舞台/接线/审阅门禁三文件：40/40 通过；`/tmp/ed-b5b-stage-final.log`。
- 三文件旧测试回归：42/42 通过；`/tmp/ed-b5b-legacy-regression.log`。覆盖 PDF 旧命令/控件、Grid 图标和 agent 审阅门禁。
- CRLF/Unicode 边界专项：24/24 通过；`/tmp/ed-b5b-edge.log`。
- 最终导出/往返两文件：27/27 通过；`/tmp/ed-b5b-export-final.log`。覆盖链接文字加粗/字号保留、混合字体降级明示。
- 最终真实引擎往返文件：8/8 通过；`/tmp/ed-b5b-roundtrip-final.log`。额外确认 90° 旋转的红/蓝方向正确，以及减少缩进后再重开仍为 0。
- 真 PDFium：case/reset 各自改变渲染像素；STAMP 走原生 patchStamp 后旋转改变像素；导出再重开与导出前像素完全相同，文本/字体/字号/旋转值保持。
- 真 Univer：命令保存 JSON，再创建第二个工作簿重开，状态逐项相等；原生排版器确认列表 1./2. 和 ●、两行 30px 行高、24px 缩进。字体测量用确定性替身；没有把此项写成浏览器像素验收。
- Pro 链接：使用同一原生范围，两个格子的链接 id 不冲突；原生 CancelHyperLinkCommand 删除链接而保留文字；普通命令可清除原生 helper 产生的链接。
- 九文件回归：73/73 通过；`/tmp/ed-b5b-regression.log`。包括 PDF instance/commands/CJK、doc-selection-adapters、Grid XLSX/stage-runtime/wiring/same-document、canon-projection。
- 冻结版本 `npm test`：10,168 项，10,074 通过、48 失败、15 取消、31 跳过，退出 1，耗时 1,585.3 秒。日志 `/tmp/ed-b5b-full-verified.log`，统计 `/tmp/ed-b5b-verified-summary.json`。
- 实跑 `LC_ALL=C sort -u` 后 `comm -13 /tmp/ed-b5b-baseline-fails.sorted /tmp/ed-b5b-verified-fails.sorted`：原清单 77 个唯一顶层标题，本轮 59 个；额外 2 个、原清单本轮未出现 20 个。原始差异 `/tmp/ed-b5b-verified-added-fails.txt`，未出现清单 `/tmp/ed-b5b-verified-absent-fails.txt`；两条额外项见下述证据，没有把严格对照写成 0。
- 在单独的已核实基线副本追加这两项后，`comm -13 /tmp/ed-b5b-confirmed-baseline.sorted /tmp/ed-b5b-verified-fails.sorted` 输出 0 行，保存在 `/tmp/ed-b5b-verified-audited-added-fails.txt`。未修改给定 `/tmp/ui-baseline-fails.txt`；没有本轮编辑器新增失败。
- 首轮为 52 失败/15 取消；旧清单/录制端口三项已修正并专项通过。中间一轮主动终止（退出 143），不作为验收证据。所有重任务经 agent-io-guard；九文件回归首次被 run-light 拒绝，检查返回后改用 run-heavy，没有绕过守卫。
- 基线清单漏项：`tests/one-task-library-image-runtime.test.mjs` 在本轮未改的测试替身里缺少 `EDIT_BAR_FIELD_CLASS` 导出；单独复跑仍以同一错误加载失败。测试、引用方、导出方三个文件的 Git blob 均与任务 HEAD 一致，证据 `/tmp/ed-b5b-image-baseline-source.json`、`/tmp/ed-b5b-image-baseline-replay.log`。
- 另一基线漏项：`theme-artifact-in-sync.test.mjs:332` 在 HEAD 快照重编 CSS 后，发现 ui.css 缺一条规则、多一条旧规则；测试明确说明与在途 worktree 改动无关。共享 CSS 不在本任务允许文件范围，未改写，留父进程整合时统一重编。
- 首轮设备卡片轮询测试初始断言前已经轮询到新卡片；未改的 `c11-fw-devices-session-intent` 单独复跑 1/1 通过，最终全量同一用例也通过。日志 `/tmp/ed-b5b-device-order-retry.log`；七个相关文件与任务 HEAD 相同的证据 `/tmp/ed-b5b-unmodified-failures-source.json`。
- LeoDev freshness：退出 0，1 个 dev slot、0 STALE。槽指向主检出，此结果不是本 worktree 已在槽上运行的证明；本任务由父进程整合后验收。
- `git diff --check`：通过。`node_modules` 为原有未跟踪链接，未加入提交。

## 最终全量失败清单（59 个唯一顶层标题，含取消/文件级条目）

```text
Device 菜单 / 原生对话 / 终端文件里先存成常量再 tt(x) 的中文同样有译文
React's dev double effect (StrictMode) sends exactly one request and does not strand the panel
S10 every GATEWAY_BASE fetch includes credentials
a different display with identical dimensions still needs a new frame, including negotiation status updates
a panel left in an error state sends nothing more until 重新连接 is clicked
a reloaded /devices?desktop=<id> shows the desktop but asks the computer only after 连接
all deny reasons render a human action on 那台电脑
all five advanced editor paths enforce the shared source contract
an open desktop survives polls and same-person auth events; only another account closes it
artifact-client default timeout follows the host-aware helper
clone-shell names host nav from ariaLabel or label on real links/buttons
desktop OAuth exchanges a PKCE code through host HTTP and persists the resulting session
desktop shared logout delegates host local removal and never requests global revocation
flush 失败时云朵进入 error，切模式返回值仍是 true
geometry loss and rotation discard stale point mapping; only a matching fresh frame restores input
host-mode authFetch falls back to __OCEANLEO_CLIENT_WEB__.fetch
host-mode authFetch uses injected fetch and skips the 2500ms rewrite
host-mode library timeout is 45s
hostBrowserClient pins storageKey to the website cookie name
hosted native login waits for host durable completion and every provider uses the same browser entry
inline fallback tool panel expands and contracts without blanking its content
login dialog email, password, and continue have accessible names
native SDK current revocation clears once without an unconditional null publication
native SDK stale JS snapshot cannot remove native background or unsaved rotation
native current revocation retries a failed durable clear conditionally and preserves later login
native current revocation retries a refused clear without reviving the rejected snapshot
native lost clear acknowledgement ends only the rejected JS snapshot and keeps retry conditional
native mismatch reply B stays a reader snapshot after external logout or account C
native session remains authoritative across SDK expiry margin and transient recovery
no ticket (restored, not clicked) shows 连接; an omitted ticket keeps today's connect-on-open
shared composer inputs and send retain accessible names
src 里每一处「effect 依赖带 tt 且体内写 state」都必须有登记
tests/e2-result-canvas-stability.test.mjs
tests/e2-right-pane-claims.test.mjs
tests/eas-w13-right-maximize.test.mjs
tests/g3-website-material-restore.test.mjs
tests/one-task-library-image-runtime.test.mjs
the corner + opens the card exactly once and does not run addAction
the panel sends one session request per click ticket; remounted with the spent ticket it waits for 连接
unconfigured library timeout stays 20s
不许内部对冲：单个文件的点位数不得超过它今天的数
五个目录里的每一处本机命中，都要么在硬门里、要么在白名单里
产物与 HEAD 的源码同步：在 HEAD 上重跑 build:css，结果必须逐字节一致
全仓 tt() key 的缺口只在历史基线之内，没有长出新的
判据 1b：仍跑 Tailwind 默认档的站点数只减不增
判据 2a：清单外不许出现裸时长
同一个文件里冒出第二处引信也拦得住（按登记条数核对）
壳：默认后台离开，只有 mounted iframe 等待 flush；confirmation 只接重试
当前素材搜索与空态文案在 17 语词典中都有真实译文
手写段没有裸曲线、没有非零裸时长（红线 9）
断言 A：裸时长只减不增
欠账只减不增：写死了小命中区的交互点位不得超过预算
欠账只减不增：剩余处数不得超过 PENDING_BUDGET
没有测试拿未登记的仓外绝对路径当夹具
电脑对话相关文件里的 tt() 字面量在 16 个语种里都有译文
线程 store：只装该根消息下的回帖，发送自带 thread_root_id
线程回帖不进主线；根消息的回复摘要会刷新
表情：事件覆盖摘要并重算「我」；本地点击先改后发请求，失败回滚
进入桌面 asks once; back closes; forward restores the view without asking again
```

## 未证实 / 未做

- 没开浏览器、Playwright、设备或截图；没有原生构建/安装；没有后台/Rust 改动，未运行对应验证。
- 没修改 `/root/projects/*` 主检出；没有 push、部署、消费者版本升级或换 dev slot。
- PDF clear-format 重置 Helvetica / 12pt / 黑色，保留对象底色、透明度及布局；没有宣称导入的 RC 富文字所有细粒度样式均已可改写。
- Grid clear-format 继续沿用原生 range.clearFormat；本轮未改写其段落级清理语义。
- 没宣称 PDF 全部 18 项文字/12 项图片能力已实现，也没宣称 XLSX 可完整保留不能表达的段落格式。

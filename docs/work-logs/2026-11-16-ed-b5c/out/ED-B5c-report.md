# ED-B5c：视频时间线与视频画布

## 结论

已完成允许文件内可闭环的能力补齐；**尚未达成文字18项/图片12项全矩阵**。未实现的渲染能力没有声明为 adapter id。最终全量仍有47失败/15取消；指定清单外1项CSS同步失败已在任务起点快照复现，详见验证及引擎缺口。
工作树 `/root/wt/ED-B5c-oceanleo-ui`，分支 `wt/ED-B5c`，起点 `7be10456`。产品提交：时间线 `13ea6580`、画布 `9b773f91` / `362919f8`；共享验证 `5154df88`、`f843bc74`、`f84908c4`。没有改主检出产品源码、切分支、合并或 push。

## 改动文件与结果

- `src/shell/video-editor/types.ts:52`：增加只读 `text_list` 编辑记录；不是未接入渲染的样式字段。
- `src/shell/video-editor/timeline-model.ts:81`：列表生成真实可见文字，保留转换前内容以供切换/撤销；记录须与生成文字一致才有效。大小写修改实际内容，活动列表同步转换。原有编号/符号不会被猜测删除。
- `src/shell/video-editor/video-edit-bar.ts:106`、`:496`：新增 list / case / clear-format。case 遵守 canon action；清格式恢复64px白字/常规粗细/居中、去背景，保留时间与x/y；列表还原原内容。Unicode大小写是内容编辑，可能有损，不能冒充可逆格式。
- `src/shell/video-editor/video-edit-bar.ts:147`、`:408`、`:515`：图片 replace 从当前时间线已导入图片选择；验证有效素材引用、排除同一源，复制持久引用与标题，保留片段身份、时间与几何。无候选不报入口，公开源替换会清掉旧私有引用。
- `src/shell/video-editor/use-video-timeline-selection-adapter.ts:28`：候选随doc变化，保留只读与disabled门禁。原预览/保存/导出直接消费本次实际文字及源身份，无需改Stage。
- `src/shell/video-canvas/engine/canvas-selection-adapter.ts:21`、`:29`：统一正文读取与列表记录，共同合成函数保留既有受审镜头、时长、素材依赖与预算，注入后端支持的文字样式，并生成同一份时间线交接文档。text/script显式选择Include in video才进入成片，避免把工作脚本自动叠到视频上。
- `canvas-selection-adapter.ts:193`、`src/shell/video-canvas/engine/command-registry.ts:862`、`:1112`：画布三类文字节点复用时间线case/list内容转换，记录真实text_list，更新raw/params正文；手工改字主动清记录，清格式撤销仍受管理的列表。列表转换可在时间线交接重开后还原，不假造样式字段。
- `canvas-selection-adapter.ts:185`、`src/shell/video-canvas/engine/command-registry.ts:847`：text/script/subtitle新增字号px、加粗、文字色、背景色、三向对齐、清格式；真实命令写入新head。清格式恢复48px白字/非粗体/居中，保留内容、时序与是否入片。
- `canvas-selection-adapter.ts:449`、`:461`、`command-registry.ts:822`：有/无选区栏均能添加文字与音频；图片替换切换当前节点真实资产，并同步分镜帧引用。候选只含本工程已落像素资产，排除URL仍指向原图的local-derivative；旧资产与版本保留。
- `command-registry.ts:894`：恢复生成新versionId/revision/parentVersionId，不改旧版本；删除目标版本不存在的当前内容字段，避免QC串版；拒绝继承键、未知版本、当前head及过期head/epoch。
- `src/shell/video-canvas/engine/CanvasProductViews.tsx:206`、`:303`、`:407`：镜头计划进入分镜卡片；轨道预览、成片渲染、时间线交接共享合成结果；History恢复后真实调用保存，CAS失败展示错误并保留工作head供重试。
- `src/shell/video-canvas/engine/CanvasCreateMenu.tsx:120`：保留Text/Audio创建入口，说明改为用户能创建的内容。
- `tests/editor-toolbar-profile-parity.test.mjs:158`、`:227`：扩展为七类真实文字选区对照，验证相同canon形态/px及明确的引擎缺口；`tests/w11-video-edit-bar.test.mjs:114`更新实际支持顺序。
- `tests/W5-edit-bar-command-effects.test.mjs:101`：移除只导出两个常量/函数的陈旧模型替身，使用真实时间线模型；修复全量首轮发现的模块加载失败，专项10/10通过（提交 `4e3768e6`）。原不完整全量已停止，最终全量在该修正后重新从头执行。
- `tests/parity-ru-canvas-integration.test.mjs:85`：空选区验证改为实际文字/音频创建能力；`tests/one-task-library-image-runtime.test.mjs:269`移除缺少已有导出的视觉模块替身，使用真实模块。这两文件复跑4/4通过。
- `tests/ed-b5c-timeline-parity.test.mjs:61`、`tests/ed-b5c-canvas-parity.test.mjs:64`：新增22项命令、保存重开、渲染请求、真实预览路径、只读/过期命令、创建菜单、恢复与保存失败测试。

## 验证

所有检查实际运行。重任务经 `agent-io-guard.sh run-heavy`，小规模专项经run-light；13文件整合被helper判为heavy后按返回要求改用run-heavy，没有绕过守卫。

- `npm run typecheck`：退出0；追加画布case/list后最终复跑亦退出0。日志 `/tmp/ed-b5c-typecheck-final.log`。
- `npm run api:check`：退出0。
- `npm run consumers:check`：退出0，35 consumers / 38 explicitly exported specifiers。
- 最终相关13文件整合：**98/98通过，0失败/取消/跳过**；日志 `/tmp/ed-b5c-focused-final.log`。另有共享工具条17/17，以及恢复清可选字段修正后的画布专项+delivery-view 12/12通过。最终整合已包含画布case/list追加内容。
- 专项命令：`node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test --test-concurrency=2 --test-timeout=180000 <相关tests文件>`。文件清单见上述日志的实际命令。
- 父进程独立执行真实时间线命令→工程序列化→重开→renderRequest→现有FFmpeg编译器：**5/5通过**（case/bullet/ordered/clear-format/replace）；日志 `/tmp/ed-b5c-parent-compiler.log`。命令为node运行 `/tmp/ed-b5c-timeline-render-input.mjs`，再以 `PYTHONDONTWRITEBYTECODE=1 python3 /tmp/ed-b5c-timeline-compiler-check.py` 校验实际 `_timeline_command`。仅隔离宿主FastAPI包冲突的异常类型，未替换编译器；没有网络或媒体渲染。
- 首次完整 `npm test`：10,181项，10,083通过、52失败、15取消、31跳过，退出1，约28.94分钟。日志 `/tmp/ed-b5c-full-initial-complete.log`；去重失败/取消标题63项，`comm -13`相对指定基线多6项（`/tmp/ed-b5c-initial-added.txt`）：三项画布空选区旧断言及一项视觉替身已修正，另有草稿恢复偶发失败和CSS产物同步失败。
- 草稿恢复 `tests/composer-draft-library-cancel.test.mjs` 单独复跑11/11通过，最终全量中该项也通过；该测试、composer-draft/composer-upload/attachment-url源码与起点的 `git diff --exit-code` 退出0。未改这些无关文件或指定基线，首次偶发失败原记录保留。
- 修正后的最后 `npm test`：**10,181项，10,088通过、47失败、15取消、31跳过，退出1，约17.55分钟**。日志 `/tmp/ed-b5c-full-final.log`；与CSS起点对照一起经同一run-heavy批次串行执行。批次使用守卫支持的 `OCEANDINO_CPU_SAMPLE_MS=5000`，等待665秒后取得CPU名额；守卫限制和源码未改。
- CSS起点对照：使用仓内 `measureOnCommittedTree` 分别在只读归档的 `7be10456` 与 `e99e2af2` 原样执行 `npm run build:css`，两边构建成功且差异完全相同：ui.css均少 `.overline` 一条、多旧按钮高度一条；globals.css逐字节一致。对照退出0，持久证据 `ED-B5c-css-baseline.json`，原日志 `/tmp/ed-b5c-css-baseline.log`。该失败在起点快照可复现，不由本轮源码差异引入；共享CSS产物留给父进程统一生成。
- 基线文件未改：末次 `LC_ALL=C sort -u /tmp/ui-baseline-fails.txt` 与开工保存件cmp一致，77个去重标题。最终清单58项；`LC_ALL=C comm -13 /tmp/ed-b5c-baseline-fails.sorted /tmp/ed-b5c-final-fails.sorted` **实际输出1项**，即上述CSS检查；`comm -12`保留57项，`comm -23`另20项本轮未复现。完整清单见下文及 `ED-B5c-full-fails.txt`，新增清单 `ED-B5c-new-fails.txt`，统计 `ED-B5c-fail-comparison.json`。
- `bash /opt/cursor-workspaces/oceandino/scripts/oceanleo-dev-slots-fresh.sh`：末次退出0，1个dev槽、0 STALE；该检查指向主检出，不是此worktree的效果验收，没有重建或部署。日志 `/tmp/ed-b5c-slot-status-final.log`。
- `git diff --check 7be10456`：通过；产品范围核对仅8个允许文件，共享canon与selection-adapter未改。

## 引擎缺口

| 目标 | 本次边界与处理 |
| --- | --- |
| 时间线font-family/italic/underline/strike/line-height/letter-spacing/vertical-text/justify | `preview-engine.ts` 与后端 `convert/timeline.py` 均不在允许修改范围；现有预览固定字体/行高，导出只读基础样式。未加虚字段，未声明id。 |
| 时间线link/indent | 视频无交互链接合同；导出strip会裁掉首行缩进，插空格不能闭环，未声明id。 |
| 时间线图片crop/radius/border/adjust/image-fit | 现有图片预览与FFmpeg图片分支不读这些字段，未声明；视频已有fit/调色不扩给图片。 |
| 画布其余文字项 | 后端同样缺任意字体/斜体/装饰/间距/竖排等合同；本轮新增八类真实样式/内容动作。模型与交接保留正文首尾换行，但FFmpeg renderer仍strip，不能宣称首尾空白像素保真。 |
| 画布其余图片档 | radius/border/opacity/alt/image-fit/remove-background缺完整节点预览、recipe及导出链；`project-model.ts`、`LeoNode.tsx`和后端落像素实现越界，未声明。现有crop/rotate/flip/adjust保留。 |
| 完整图片替换器 | 两编辑器均限当前工程已导入且可用的图片，不包含新增上传/Library选择器；无真实候选时无替换入口。 |
| 删除Director独立宿主页签 | 内容已并入Storyboard；页签仍由越界的 `use-canvas-chrome.tsx` / `LibraryVideoCanvasSession.tsx` 定义，本轮未删除。 |

## 未证实 / 未做

没有浏览器、截图、真实设备、原生构建/安装、生产/开发部署、付费视频渲染、远端Library保存验收或MP4像素一致性验收。保存重开证据使用真实保存管线、工程序列化与解析，网络协作者受控；没有把合同测试写成远端成片验收。未改后端/Rust，pytest/cargo check不适用。共享canon与selection-adapter未改。`node_modules`保留原有未跟踪链接，未安装依赖、未加入提交。

## 最终全量失败/取消标题（58项，去重）

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

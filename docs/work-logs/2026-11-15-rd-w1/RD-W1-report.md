# RD-W1：远程控制收敛第一波

## 结论

A1、A2 及指定的两处缺陷已完成源码修改并分别本地提交；没有 push、合并或部署，产品源码只改指定 worktree。
**验证未全通过：typecheck、API/consumer 检查、相关 pytest、完整 Cargo 已过；最终 npm test 返回 1（10182 项：10087 过 / 49 失败 / 15 取消 / 31 跳过）。**
**执行偏差：父代理错误的过滤参数曾触发浏览器夹具和旧 W10 证据写入；已停止错误轮次并验证修正。现有主检出证据又有后续写入、归属不明，未擅自覆盖，详见偏差说明。**

- UI：`883597ed`，共享输入历史、实际写入计数、RTC 单次采样与 SDK 诊断接线，删除停用的 broker viewer 集成。
- UI 验证追加：`3e5b63f0`，将模拟一小时的压力测试放到真实 watchdog，窗口只消费共享样本。
- 原生：`4bbc1cf1`，删除 rd.capture、无效 Envelope selector、恒空 Access 字段及等值分支，生成指标契约，修复静态帧提交时间戳。
- 网关：`cc85bae5`，统一生成模型及输入键，完成状态最多等待 8 条 control，控制和状态优先于媒体，保存窗口诊断。
- 保留有效 owner/agent envelope 授权、WS/HTTP 兼容、既有回执含义、首帧后计费和 secure broker 受限权限职责。
- 输入历史最多 256 条，各消费者共享记录；probe 独立计数。HTTP 得到响应才确认写入，拒绝响应也计，401 每次实际提交分别计，本地鉴权失败和网络未知不猜测。

## 改动文件清单（file:line）

路径前缀：UI=`/root/wt/RD-W1-oceanleo-ui/`；APP=`/root/wt/RD-W1-oceanleo-app/`；GW=`/root/wt/RD-W1-oceanleo/`。删除文件的行号指删除前版本。

- UI `src/api/remote-desktop-input-history.ts:14`：唯一输入记录及有界清理。
- UI `src/api/remote-desktop-scheduler.ts:22`：调度器引用同一记录。
- UI `src/api/remote-desktop-control-timing.ts:8`：接收/完成计时读取共享时间。
- UI `src/api/remote-desktop-diagnostics.ts:5`：生成输入键、共享记录及单列 probe。
- UI `src/api/remote-desktop-measure.ts:15`：画面测量读取共享记录，重连保留已证明水位。
- UI `src/api/remote-desktop-quality.ts:211`：共享 SDK 诊断、实际写入计数、窗口与摘要。
- UI `src/api/remote-desktop.ts:190`：HTTP 确认写入钩子、共享流历史、移除 broker API/rd.capture。
- UI `src/api/remote-metrics.generated.ts:1`：由 APP 契约生成媒体/输入字段和类型。
- UI `src/pages/RemoteDesktopPanel.tsx:98`：清理 broker 状态/轮询并接入共享历史。
- UI `src/pages/RemoteDesktopVideo.tsx:109`：消费 watchdog 同一次 RTC 样本，SDK 错误进入 collector。
- UI `src/pages/remote-desktop-media.ts:225`：采样和解析单一入口、移除 rd.capture 消费。
- UI `src/i18n/ui/messages/shell-overhaul-copy.ts:1`：删除失去调用者的文案引用。
- UI `src/i18n/ui/messages/rd-broker-copy.ts:1`：删除仅供旧 viewer broker 的文案。
- UI `tests/remote-desktop-artc-panel.test.mjs:297`：真实组件窗口/摘要、共享采样和关闭验证。
- UI `tests/remote-desktop-data-channel.test.mjs:1`：真实写入计数路径适配。
- UI `tests/remote-desktop-diagnostics.test.mjs:1`：probe 分列及诊断口径。
- UI `tests/remote-desktop-measure.test.mjs:1`：共享记录、60000→60001 重连水位。
- UI `tests/remote-desktop-wave.test.mjs:65`、`tests/remote-desktop-rdview-media.test.mjs:58`：窗口消费共享样本；真实 watchdog 模拟一小时卡住读取，验证 single-flight、恢复及关闭。
- UI `tests/remote-desktop-peer-backpressure.test.mjs:1`：真实写入回调适配。
- UI `tests/remote-desktop-quality.test.mjs:1`：不再将入队成功当写入。
- UI `tests/remote-desktop-telemetry.test.mjs:1`：真实 WS/DC/HTTP、合并、probe 和清理。
- UI `tests/remote-desktop-broker-api.test.mjs:1`、`tests/remote-desktop-broker-panel.test.mjs:1`、`tests/remote-desktop-broker-typecheck.mjs:1`：删除已移除集成的专属测试；普通 viewer 回归仍保留。
- UI `tests/ts-extension-loader.mjs:1`：支持 `.generated` 源文件基名，避免生成模块未加载。
- UI `tests/i18n-base-words-2026-11-03.test.mjs:12`：从词典回归清册移除已删除的 broker 分表。
- UI `docs/work-logs/2026-11-15-rd-w1/books/viewer.md:1`、`docs/work-logs/2026-11-15-rd-w1/books/native-schema.md:1`、`docs/work-logs/2026-11-15-rd-w1/books/gateway.md:1`：已提交的隔离任务书。
- APP `schema/remote-metrics.json:1`：唯一权威契约，保留 53 字段 ABI、54 字段 wire 及 10 输入键。
- APP `scripts/generate-remote-metrics.py:1`：显式跨库根生成、投影校验和只读漂移检查。
- APP `src-tauri/src/remote_media_metrics.generated.h:1`、`src-tauri/src/remote_media_metrics.generated.rs:1`、`src-tauri/src/remote_input_metrics.generated.rs:1`：生成声明、字段顺序/偏移和输入映射。
- APP `src-tauri/src/remote_media_metrics.h:8`、`src-tauri/src/remote_input_metrics.rs:13`：改用生成定义。
- APP `src-tauri/src/remote_media.rs:1`：停发 rd.capture、常量 keyframe_ms、生成 Metrics 与诊断投影。
- APP `src-tauri/src/remote_desktop.rs:89`：删除恒空字段和不可达 selector，保留实际授权检查。
- APP `src-tauri/src/remote_media_timestamp.h:1`、`src-tauri/src/remote_media_windows.cpp:638`：提交时间严格递增，原捕获时钟/序号保留。
- APP `src-tauri/build.rs:108`：新增头文件的重检查依赖。
- APP `src-tauri/tests/remote_media_timestamp.cpp:1`：静态重发、同 tick 重试、恢复及重置。
- APP `tests/test_remote_metrics_schema.py:1`：契约漂移、原 ABI/wire、权限小单元。
- APP `tests/remote_metrics_harness.rs:1`、`tests/remote_metrics_source_check.py:1`：实际生产 Rust 指标的独立检查入口。
- GW `backend/app/remote_metrics_generated.py:1`：严格模型及输入键生成物。
- GW `backend/app/remote_desktop.py:72`、`backend/app/routers/remote_desktop_router.py:36`：使用生成契约。
- GW `backend/app/routers/remote_desktop_router.py:686`：control/state 有界公平，媒体保持低优先。
- GW `backend/app/routers/remote_desktop_quality_router.py:131`、`backend/app/remote_desktop_quality_windows.py:43`：接收诊断并存现有 viewer JSON，无数据库迁移。
- GW `backend/tests/test_remote_desktop_stream.py:412`、`backend/tests/test_remote_desktop_quality_windows.py:124`：持续回执、媒体洪峰及严格诊断存储行为测试。

## 验证结果（真实命令与结果）

公共资源守卫：`RD_GUARD=/opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh`。所有命令均在对应 worktree 执行；Python 解释器使用已有依赖环境，无安装。

- UI `bash "$RD_GUARD" run-heavy -- npm run typecheck`：返回 0，通过。
- UI `bash "$RD_GUARD" run-heavy -- npm run api:check`：最终复核返回 0，通过。
- UI `bash "$RD_GUARD" run-heavy -- npm run consumers:check`：最终复核返回 0，35 consumers / 38 exported specifiers。
- 首轮 npm 全量返回 1：10190 项，10093 过 / 51 失败 / 15 取消 / 31 仓库自带跳过；其过滤参数存在引号错误，未完整排除受限用例，见下方偏差说明。采样夹具修正后启动的第二轮在发现该配置错误后主动终止，exit143，不当作完整结果。
- 正确最终命令为 `NODE_OPTIONS="--test-skip-pattern=\"$RD_SKIP\"" bash "$RD_GUARD" run-heavy -- npm test`：返回 1，10182 项：10087 过 / 49 失败 / 15 取消 / 31 仓库自带跳过，耗时 1546030ms。整条含空格正则须在 NODE_OPTIONS 内再次加引号；已通过相同 npm 脚本/加载器的同名抛错回调预检，最终日志确认 11 条受限用例均未执行。
- 正确的 `RD_SKIP` 排除 11 条受限用例：7 条真实 Chromium 远控触屏/鼠标、1 条 GLB 浏览器回环、3 条 W10 主检出证据写入；这些会从测试选择中排除，不等同于 TAP 的仓库自带 skip。未改源码为无条件通过，也不把未过滤全量称作通过。

```bash
RD_SKIP='Three.js scene interactions survive a real exported GLB round trip|移动触屏上下文|点部分可见画面时|固定全屏画面：不同视区|桌面鼠标上下文|HTTP 待定点击：不同位置|WSS 指针路径不等待 HTTP|design-canvas load/mutate/undo/save/reopen/export while remote sites are blocked|video-canvas local graph load/mutate/undo/save/reopen/export|legacy timeline cut/concat/captions/audio/export round-trip locally'
```

父代理独立复核的 UI focused 命令公共部分：

```bash
RD_NODE=(node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test --test-concurrency=2)
```

- `bash "$RD_GUARD" run-light -- "${RD_NODE[@]}" tests/remote-desktop-api.test.mjs tests/remote-desktop-data-channel.test.mjs tests/remote-desktop-peer-backpressure.test.mjs tests/remote-desktop-scheduler.test.mjs`：98/98 通过。
- `bash "$RD_GUARD" run-light -- "${RD_NODE[@]}" tests/remote-desktop-control-timing.test.mjs tests/remote-desktop-diagnostics.test.mjs tests/remote-desktop-quality.test.mjs tests/remote-desktop-telemetry.test.mjs`：25/25 通过。
- `bash "$RD_GUARD" run-light -- "${RD_NODE[@]}" tests/remote-desktop-measure.test.mjs tests/remote-desktop-artc-panel.test.mjs tests/remote-desktop-media.test.mjs tests/remote-desktop-rdview-media.test.mjs`：51/51 通过。
- `bash "$RD_GUARD" run-light -- "${RD_NODE[@]}" tests/remote-desktop-panel.test.mjs tests/remote-desktop-rdview-panel.test.mjs tests/remote-desktop-media.test.mjs`：63/63 通过；分组含重复，不相加为独立用例总数。
- `bash "$RD_GUARD" run-light -- "${RD_NODE[@]}" tests/remote-desktop-wave.test.mjs tests/remote-desktop-rdview-media.test.mjs tests/remote-desktop-artc-panel.test.mjs tests/remote-desktop-telemetry.test.mjs`：夹具适配后 44/44 通过，保留真实一小时 single-flight 压力保证。
- `bash "$RD_GUARD" run-light -- node tests/remote-desktop-lint.mjs`：CURRENT 0 errors / 0 warnings，Hooks 无错误。
- `bash "$RD_GUARD" run-light -- "${RD_NODE[@]}" tests/i18n-base-words-2026-11-03.test.mjs`：1/1 通过，已删除词典无残留导入。
- `bash "$RD_GUARD" run-light -- node --test tests/b16-read-failure-no-blank.test.mjs`：返回 1，2 通过 / 2 失败；DeckRoute 的两条源码正则断言不匹配。父代理逐字节对照 `f1cf7fc2` 确认该测试及读取的五个源文件完全未变；单独回放仍复现这两条既有失败。按本波边界未修改编辑器。
- 首轮失败文件的追加基线回放：28 文件共 198 项，133 过 / 50 失败 / 15 取消；部分用例缺测试夹具或 Git/同级仓上下文，不能据相同总数认定所有失败都已证实为既有。补齐原始 AST 夹具后的三项预算文件回放为 32 项、23 过 / 9 失败；此处未放宽预算。
- APP `bash "$RD_GUARD" run-light -- python3 scripts/generate-remote-metrics.py --app-root /root/wt/RD-W1-oceanleo-app --gateway-root /root/wt/RD-W1-oceanleo --viewer-root /root/wt/RD-W1-oceanleo-ui --check`：返回 0，三个库生成物无漂移。
- APP `bash "$RD_GUARD" run-light -- python3 -m unittest discover -s tests -p test_remote_metrics_schema.py -v`：6 项通过，包含 rustc 实编执行的 2 项授权/身份/旧偏好/撤销测试。
- 父代理另以 `git show 4bbc1cf1^:src-tauri/src/remote_media.rs` / `remote_media_metrics.h`、`git show cc85bae5^:backend/app/routers/remote_desktop_router.py` 与生成物作 Python AST/字段逐项比较：54 个网关字段注解/default、53 个 C++ 顺序、53 个 Rust 类型/serde 标记完全一致。
- APP `bash "$RD_GUARD" run-light -- g++ -std=c++17 -pthread src-tauri/tests/remote_media_metrics.cpp -o /tmp/rd-w1-verify/media-metrics-test` 后运行该程序：通过，abi_bytes=424。
- APP `bash "$RD_GUARD" run-light -- g++ -std=c++17 src-tauri/tests/remote_media_timestamp.cpp -o /tmp/rd-w1-verify/media-timestamp-test` 后运行该程序：通过，静态重发/重试/恢复/重置。
- APP `OCEANDINO_IO_LANE=disk python3 tests/remote_metrics_source_check.py`：父代理复跑返回 0，19/19 通过（生产输入队列/世代/回执/能力 18 项，53 字段 ABI/serde event/skip 1 项），离线、无打包。
- APP `CARGO_BUILD_JOBS=2 OCEANDINO_IO_LANE=disk bash "$RD_GUARD" run-heavy -- timeout 300s cargo check --offline --manifest-path src-tauri/Cargo.toml`：第二轮增量执行返回 0，1m14s；父代理在最终普通注释修正后独立复跑返回 0，4.28s（当前 139 项编译警告，未作范围外清理）。首轮冷缓存 90s 超时返回 124 如实保留，无安装/打包。

GW 父代理在 `backend` 目录复跑，以下单条命令返回 0：**129 passed、114 subtests passed**。

```bash
bash "$RD_GUARD" run-light -- /root/projects/oceanleo/backend/.venv/bin/python -m pytest -q \
 tests/test_remote_desktop_stream.py tests/test_remote_desktop_nonblocking.py \
 tests/test_remote_desktop_input_telemetry.py tests/test_remote_desktop_media_metrics.py \
 tests/test_remote_desktop_packet_metric.py tests/test_remote_desktop_quality_windows.py \
 tests/test_remote_desktop.py::Ownership tests/test_remote_desktop_billing.py::Metering \
 tests/test_remote_desktop_billing.py::DataChannelReceipt tests/test_remote_media.py tests/test_remote_desktop_quality.py \
 tests/test_secure_broker.py::test_private_frame_reaches_only_its_authorized_viewer_and_activates_billing \
 tests/test_secure_broker.py::test_native_receipt_is_scoped_one_use_and_updates_idle_activity \
 tests/test_secure_broker.py::test_no_input_before_a_real_frame \
 tests/test_secure_broker.py::test_view_only_policy_enforced_on_server \
 tests/test_secure_broker.py::test_windows_ordinary_desktop_and_unknown_states_never_get_privileged_grants \
 tests/test_secure_broker.py::test_stale_broker_teardown_cannot_close_or_deauthenticate_reclaimed_agent_session
```

最终全量的未通过项如下（文件均在 UI `tests/`，计数为失败/取消）。这是报错现象，未全部证实根因或既有性；本波未扩修其他编辑器、登录、IM、翻译或源码预算。最终轮无首轮以外的新失败名称，远控 focused 与最终全量的远控用例通过。

| 文件（均为 `.test.mjs`） | 失败/取消 | 当前报错或验证限制 |
| --- | ---: | --- |
| `b16-read-failure-no-blank` | 2/0 | DeckRoute 两条源码正则不匹配；原样基线复现。 |
| `c11-fw-devices-session-intent`、`c12-web-current-geometry` | 9/0 | 控件查询/几何门控预期不匹配；原样基线同名失败。 |
| `client-ui-host-auth` | 7/15 | 登录持久化/刷新断言失败并取消子例；旧 loader 也复现。 |
| `computer-conversations-i18n`、`i18n-tt-key-coverage`、`template-showcase` | 4/0 | 译文覆盖缺口；未扩大本波补词范围。 |
| `d4-inline-shell-page-feedback`、`p3-pipeline`、`sko-w12-config-card` | 4/0 | aside/content 缺失、flush 状态与点击回调次数不符。 |
| `e2-result-canvas-stability`、`e2-right-pane-claims`、`eas-w13-right-maximize` | 3/0 | 桩模块缺 `PluginThemeScope` 导出，整文件未执行断言。 |
| `effect-tt-dependency`、`focus-ring-budget`、`hit-target-budget` | 6/0 | PDF/video effect 登记与交互样式预算超额；未放宽预算。 |
| `g3-website-material-restore`、`history-cross-device-contract` | 2/0 | 跨仓模块桩缺失、portal 同级检出未找到；存在环境约束。 |
| `gateway-fetch-credentials` | 1/0 | `bay/public.ts:482`、`cloud-agent-api.ts:32` 未满足 credentials 扫描。 |
| `im-conversation-store` | 3/0 | 表情 mine 缺值、线程回帖摘要/加载断言失败。 |
| `local-task-device-bridge-w7` | 1/0 | denied 展示文案不匹配预期操作提示。 |
| `loopback-trust-source-set` | 1/0 | 未登记的本机命中，包含未改的质量来源分类表达式。 |
| `media-source-integrity` | 1/0 | 编辑器源码片段不匹配 `durableTimelineSources` 正则。 |
| `motion-no-raw-duration`、`motion-token-adoption`、`motion-tokens` | 4/0 | 裸时长/曲线与 Tailwind 默认档超过登记约束。 |
| `w25-tests-out-of-repo-paths` | 1/0 | 其他测试的绝对路径及临时夹具未全部登记。 |

三个库 `git diff --check` 均通过。父代理日志位于 `/tmp/rd-w1-verify/`；最终日志 `ui-full-policy-final.log`、统计 `ui-full-policy-result.json`。没有打印真实密钥或令牌。

## 验证配置偏差及处理

- 父代理原先未给 NODE_OPTIONS 内含空格的正则再加引号，实际仅第一段被解析，意外启动了本地合成浏览器夹具，也触发旧 W10 测试写主检出证据。发现后停止本任务第二轮进程组；这是本任务的配置错误。
- 已用原样 npm 脚本和加载器作安全预检：11 个同名回调均为执行即抛错；旧参数 10 失败，新参数只运行允许的 1 项并通过。证据：`/tmp/rd-w1-policy-probe/{unquoted,quoted}.log`。
- 当前主检出四份 W10 生成证据的差异仅涉及随机 clip/track ID 和本地临时 origin，但其时间戳晚于本任务已停止的测试，当前内容归属不能确认，因此没有擅自覆盖。已只读备份至 `/tmp/rd-w1-verify/unexpected-main-evidence-backup/`；恢复前的时间窗口断言阻止了写入。
- 四个路径：`design-canvas/offline.json`、`video-timeline/legacy-timeline.export.json`、`video-timeline/legacy-timeline.reopened.v1.json`、`video-timeline/legacy-timeline.saved.v1.json`，均在 `/root/projects/oceanleo-app/docs/react-client-rebuild/evidence/W10/` 下。原先就修改过的 `website/operator-copy.json` 未动。

## 未证实/未做

- Windows SDK 桥 `remote_media_windows.cpp` 未在 Windows 工具链编译；这里只实编了共享指标与时间戳纯 C++ 单元。
- 最终全量明确未通过；11 条受限用例按规则排除，不能声称无排除全量通过。
- 全量已发现两条既有编辑器断言失败，见上述 `b16-read-failure-no-blank` 回放；尚未把它们定性成产品缺陷或测试缺陷，本波不扩展修复编辑器。
- C11 session intent、C12 geometry、computer i18n 三组：父代理在原样 `f1cf7fc2` 精确快照复跑 16 项，5 过 / 11 失败，与本波当前结果及失败名称一致。原生登录用旧 loader 回放仍有 7 失败 / 15 取消，其 auth/client-ui 源码及测试在本波未改。
- 全仓翻译覆盖当前 275 个缺词与旧 `RD_BROKER_MESSAGES` 的 19 个键交集为空；未借本波清理扩展修补全仓词条。
- 未进行真实网络、长时间 60 分钟会话、设备画面或体验验收；没有声称三场历史黑屏根因已获实测证明。
- 已开始的单次网络写入仍不可抢占；writer 修复证明的是待发队列顺序和完成状态有界让行。
- secure broker 仍承担独立锁屏、受限权限、授权与计费职责；`GW backend/app/secure_broker/service.py:99`、`:154`、`:210` 分别使用释放、会话上下文和输入完成 seam，故网关这部分不删。
- 未做 A3（编码策略合并、Panel 拆分）、A4、A5；未构建/安装原生客户端，未动保护进程或部署环境。产品源码未改主检出；测试证据副作用如上，不能声称全过程满足“绝不动主检出”。

# RD-A5：远控波三交付报告

代码已提交；最终网关联合套件仍在资源队列，UI 最终全量复跑中，尚不能声明全部验收通过。

## 结论

- 仅保留 ARTC 媒体、ARTC DC 输入和 input_receipt v1 终态。删除普通 WS/HTTP JPEG、HTTP/WS 输入、一次 action 执行、三代旧 ACK 与额度/降级/drain fence，以及无 ARTC 捕获和旧网关租约兜底。
- executed / merged / rejected 按确切 seq 去重；交还控制只认本次 release_all 的 executed。DC 丢失或写入异常明确提示，500ms→8s 退避结束旧会话、新建 ARTC 会话，未知输入不重放；关闭面板取消恢复。
- 显式只读 descriptor 不创建 DC；动态降权停止输入和 synthetic publisher，保留视频。新增文案覆盖中文及另外 16 种语言。
- 强制当前观看端确认首帧后激活和计费。唯一 publisher 遥测中实际注入序号递增才刷新操作活动，重复、倒退及错会话不刷新，避免长时控制误判空闲。
- dc_input_seq 已失源：schema 标 retired，观看端不消费；网关旧值归一并入库为 null，其他未知/非法指标仍严格拒绝。input_completed_seq、first_packet_sent_ms 保留真实来源；本地 frames_sent 恒零字段已删除。
- secure broker 保留设备身份、generation、锁屏状态、权限/授权、撤销、handoff 及同一会话/计费边界；device_link 保留。其旧 JPEG/输入执行面已退场，当前无安全桌面 ARTC 等价采集适配，明确 broker_artc_required / controlSupported=false，不启动计费；未宣称锁屏已可控。

## 范围与提交

只在以下已有 wt/RD-A5 工作树修改代码并中文提交，未 push、切分支、合并或部署。

| 简写 | 工作树 | 最终产品提交 | 初始基线 |
| --- | --- | --- | --- |
| U | /root/wt/RD-A5-oceanleo-ui | 6199baa4（产品 be6a1914 / 7996d8aa，测试 8e7ee8b6） | 1b424d4d |
| G | /root/wt/RD-A5-oceanleo | 90f9878a（主改动 b2b5c04b、90788ff1、49c7b91b） | e3c6cdc0 |
| N | /root/wt/RD-A5-oceanleo-app | 20c0f362（主改动 bd45aa3a、945c9813） | 85b069b4 |

三端契约独立提交 U/a465404c、G/b4478515、N/0ef01e70。任务书分别位于各工作树 docs/work-logs/rd-a5/。

## 改动文件与唯一路径调用图

- U/src/api/remote-desktop.ts:306：WS 只做控制和遥测，输入和终态仅 DC；U/src/api/remote-desktop-scheduler.ts:21：终态调度与交还；U/src/pages/remote-desktop-session.ts:130：整会话退避重连。
- U/src/pages/remote-desktop-media.ts:253：强制 DC / 只读媒体、发布者和会话隔离；U/src/pages/RemoteDesktopPanel.tsx:67、RemoteDesktopVideo.tsx：唯一 video；U/src/i18n/ui/messages/remote-desktop-copy.ts:533：16 种非中文翻译。
- N/src-tauri/src/remote_desktop.rs:2242：唯一输入线程及授权/代际/释放检查；N/src-tauri/src/remote_input_metrics.rs:160：终态源；N/src-tauri/src/remote_media.rs:652：回执出站，:1014：DC 失败；N/src-tauri/src/media_worker.rs:140：监督退避。
- N/schema/remote-metrics.json、scripts/generate-remote-metrics.py；G/backend/app/remote_metrics_generated.py:8、remote_desktop_quality.py:76：废弃指标 null 兼容；U/src/api/remote-metrics.generated.ts：观看端生成物。
- G/backend/app/remote_desktop.py:601、:695、:912、:1026：ARTC 会话、凭据、真实输入活动及首帧；G/backend/app/routers/remote_desktop_router.py：控制 WS 和薄 HTTP；G/backend/app/secure_broker/service.py:183、:274：保留授权边界并明确拒绝旧执行面。

以下 U 路径均相对 src/，N 相对 src-tauri/src/，G 相对 backend/app/。

```text
会话：U/pages/remote-desktop-session.ts → U/api/remote-desktop.ts
   → G/routers/remote_desktop_router.py → G/remote_desktop.py → G/remote_media.py
媒体：N/remote_media_macos.mm（ScreenCaptureKit）或 remote_media_windows.cpp（DXGI）
   → N/remote_media.rs（EncoderPolicy / ARTC SDK，受 media_worker.rs 监督）
   → ARTC → U/pages/remote-desktop-media.ts → U/pages/RemoteDesktopVideo.tsx
输入：U/pages/remote-desktop-panel-input.ts → U/api/remote-desktop-scheduler.ts
   → U/api/remote-desktop.ts → ARTC DC → N/remote_media.rs（媒体进程）
   → N/media_worker.rs（IPC）→ N/remote_desktop.rs（主进程 OS 注入）
回执：N/remote_input_metrics.rs → N/remote_desktop.rs → N/media_worker.rs（IPC）
   → N/remote_media.rs → ARTC DC → U/pages/remote-desktop-media.ts
   → U/api/remote-desktop.ts → U/api/remote-desktop-input-history.ts / scheduler
采样：native publisher/input facts → 控制 WS → G session metrics
   + U/pages/remote-desktop-media.ts 单次 RTC stats → U/api/remote-desktop-quality.ts
   → G/routers/remote_desktop_quality_router.py（窗口/结束摘要共享样本）
```

## 删除行数

命令为各库 `git diff <初始基线> HEAD --shortstat -- . ":!docs/work-logs/rd-a5/RD-A5-report.md"`，排除本报告，包含测试和任务书。

| 库 | files changed | insertions | deletions | 净减少 |
| --- | ---: | ---: | ---: | ---: |
| U | 34 | 567 | 2083 | 1516 |
| G | 32 | 528 | 3125 | 2597 |
| N | 10 | 1147 | 3211 | 2064 |
| 合计 | 76 | 2242 | 8419 | 6177 |

仅产品目录（U/src、G/backend/app、N/src-tauri/src，含 Rust 内联测试）为 +1244/-5056，净减 3812 行。

## 实际验证

所有重型命令经 agent-io-guard.sh run-heavy，专项经 run-light；未绕过资源队列。

- 本单元主代理亲跑 npm run typecheck、npm run api:check、npm run consumers:check：exit 0；35 consumers / 38 exports。最终 be6a1914 再跑 typecheck：exit 0，/tmp/rd-a5-ui-parent-typecheck-final.log。
- 主代理真实组件与输入专项：panel / receipts / data-channel 三文件 60/60；最终日志 /tmp/rd-a5-ui-parent-focused-final.log；其余边界专项 48/48（含原 TS 活动断言改用现有 Node runner），/tmp/rd-a5-ui-parent-extra-focused-final.log。hooks lint CURRENT 0 errors / 0 warnings，/tmp/rd-a5-ui-parent-lint-final.log。
- 主代理最终 N/20c0f362 亲跑：cd src-tauri && TAURI_CONFIG="$(cat tauri.ws.json)" OCEANLEO_EDITION=ws cargo check --offline：exit 0，141 条既有 warning。
- 同一最终版本 python3 tests/run_remote_native_tests.py：14+20+77=111 passed，2 ignored 为被其他测试调用的辅助入口；python3 -m unittest discover -s tests -p test_remote_metrics_schema.py：7 passed。
- python3 scripts/generate-remote-metrics.py --gateway-root /root/wt/RD-A5-oceanleo --viewer-root /root/wt/RD-A5-oceanleo-ui --check：exit 0。以上原生主代理日志 /tmp/rd-a5-native-parent-final.log。
- 网关核心主代理专项 70 passed；协议/公平/遥测续作 67 passed、107 subtests；secure broker/撤销/旧存储专项 80 passed、7 subtests。首轮联合 328 passed、146 subtests 及 4 个旧 commands 夹具断言失败；夹具修正并单文件 4/4+4 subtests 通过，最终联合重跑排队中 /tmp/rd-a5-gateway-final3.log（原排队器固定扫描旧槽，取消未运行等待后经同一门禁重新入队）。
- UI 首轮 10108 tests / 10015 pass / 68 fail / 15 cancelled / 10 skip，日志 /tmp/rd-a5-ui-first.log；只有 5 个 c11 设备入口旧 HTTP/JPEG 夹具为基线外，已保留原行为断言迁移，主代理亲跑 15/15（/tmp/rd-a5-ui-parent-c11-final.log）。最终完整 npm test 已运行于 /tmp/rd-a5-ui-full.log；结果和 comm 待填，尚不能声明最终无新增失败。
- 三库 diff --check 通过；LeoDev 既有槽 1 FRESH、0 STALE，未将候选工作树加载到主检出槽。UI/native 仅剩初始未跟踪 node_modules symlink，无依赖安装。

## 未证实 / 未做

- 未 push、部署、合并、浏览器/截图、设备操作、原生客户端打包或安装；未改 /root/projects 主检出代码及控制平面代码地图，父进程合并时同步入口图。
- Linux cargo check 与源码/真实 loopback IPC 测试不证明 Mac/Windows SDK 或真实 OS 注入；未声称首帧时延或 60 分钟真实链路达标。全波完成、桌面端重编后的 60 分钟实测由上级父进程执行。
- DC 自动恢复会新建会话，重新执行该会话的授权及首帧计费规则；未声称跨新会话保留原计费分钟。
- 浏览器专项按本轮禁令不运行。报告中的只读、重连、注入统计和回执结论限于源码与服务器测试；安全桌面 ARTC 适配仍未具备。

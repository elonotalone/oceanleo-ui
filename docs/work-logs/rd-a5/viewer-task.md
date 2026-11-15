# RD-A5 观看端任务书

身份：viewer。唯一写入仓库 /root/wt/RD-A5-oceanleo-ui，现有 wt/RD-A5；中文 commit，绝不 push/切分支/修改主检出。父代理只写本目录任务书与报告，不修改你的产品文件。开始先读 live kernel、相关 operator-rulings（含 Convergence wave 1 synced），运行 bootstrap；相关 packs oceanleo/native-app/iris-realdevice/parallel-rollout/deploy。

目标：唯一 ARTC 视频和 ARTC DC 输入及 input_receipt v1。删除观看端 WS JPEG/HTTP JPEG 媒体、WS/HTTP 输入与一次 action 执行器；删除 admission/completion/direct ACK 解析状态机、额度/降级/drain fence 兼容协商。HTTP/WS 会话控制、授权、计费、质量遥测可保留，不能再承载输入或 JPEG。DC 不可用明确错误并以退避重连 ARTC，16 语文案补全。保留 panel 波2拆分、统一输入历史、权限和首帧计费。

必须保持的用户行为（每项真实执行 focused tests）：
- 用户进入电脑后 ARTC 首帧可见，首帧后开始计费。
- 输入只发 DC；每个 seq 的 executed/merged/rejected 终态去重并解锁，交还控制必须确切 release_all executed。
- DC 断线可见错误且退避重连 ARTC，不发 WS/HTTP 输入或媒体。
- 锁屏、授权、只读、音频和会话生命周期仍保留。

拥有 src/api/remote-desktop*、src/pages/remote-desktop*、RemoteDesktopPanel、相关远控 tests、i18n 及必要内部调用者。不得改生成的 src/api/remote-metrics.generated.ts（父代理负责），不得 install 或修改 node_modules（symlink）。可以改内部 API 快照仅在必要且解释真实 API 变更。严禁浏览器、Playwright、设备、截图、原生构建、部署。所有重型经 agent-io-guard.sh run-heavy，focused run-light。先阅读 helper 入口/--help。

跨端固定：media/data_channel_input=true 必需；唯一 DC 消息 {v:1,t:rd.input_receipt,sid,seq,status,executed_at_ms}；原生不再发布 legacy ACK，网关不转发输入或回执。保留 descriptor input_receipt_version=1 能力标识可接受，但不得协商降级。契约疑义即时通知父代理，不能自行留旧路径。

执行 npm run typecheck、npm run api:check、npm run consumers:check、全部相关测试；全量 npm test 由父代理最终运行。新增 meaningful 回归测试；改掉只断言旧路径的既有测试，不能简单删除行为保障。Lint hooks 和真实 jsdom mount（真实改动组件）。父代理负责 generated 契约、最终 full suite、跨库复核与总报告。

提交前 git diff --check，记录 git diff --shortstat（对初始 HEAD），中文提交。结果 /tmp/RD-A5-viewer-report.md（结论、file:line、命令结果、未做）。通知父代理所有潜在基线外失败，不能把未实跑写成通过。

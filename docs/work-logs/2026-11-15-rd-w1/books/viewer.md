# RD-W1 viewer 任务书

唯一所有者：viewer。工作根 /root/wt/RD-W1-oceanleo-ui，已有分支 wt/RD-W1。不得改主检出、push、部署、创建分支、安装依赖（node_modules 为共享链接）、使用浏览器或操作设备。不创建更多子代理。代码由父代理最终统一 commit。

先读 /opt/cursor-workspaces/oceandino/AGENTS.md，bootstrap、operator-rulings.md 相关裁定，以及 RD-REDUNDANCY、RD-ANALYZE 报告。当前操作者明确授权在该 worktree 分支修改，覆盖 main-only 默认；明确禁止原生构建/部署，覆盖默认 dev-slot 交付。本单元只做 A1/A2，不做 A3/A4/A5。

所有权：本 UI worktree 的远控相关源码与测试；排除 src/api/remote-metrics.generated.ts（由 native-schema 所有者生成）。任务书/最终报告由父代理维护。

实现：删除 rd.capture 协议与收到即 return 分支；删除默认关闭 broker viewer API 与 Panel 状态/轮询/事件映射及无调用导出，保留后台 secure broker 权限职责。ARTC diagnostic 必须进入 quality collector。输入 scheduler/timing/diagnostics/measure 的 seq、发送时间及 bounded history 合成一份记录，多处读；所有输入总数来自实际成功写通道，入队/合并不算。watchdog/质量窗口/结束摘要共用 RTC 采样，保留现有传输与回执语义。

跨库契约：native-schema 将从唯一 JSON 契约生成 src/api/remote-metrics.generated.ts，至少导出 INPUT_METRIC_KEYS（readonly 字符串数组/tuple）；viewer 输入指标枚举改用它。可先留待该文件生成后校验，不要自行维护第二份字段清单。需要额外接口立即消息父代理。

必须保持行为及验证：普通 ARTC 视频和控制可用；WS/HTTP 兼容仍可用；入队/执行回执不改义；输入合并不虚增；SDK 错误在质量摘要/窗口可见；测量有界且关闭无额外残留。用真实行为测试覆盖上述修改，调整确已移除 broker 专属测试，保留 secure broker 职责的测试。新增/修改 UI 应通过 hooks lint 与真实组件 jsdom。先 focused 测试；父代理最终跑四门 npm run typecheck、npm test 全量、npm run api:check、npm run consumers:check。所有测试通过 agent-io-guard.sh run-light/run-heavy，保留日志并返回命令、真实结果、限制、文件:行。每 30–60 秒向父代理报进展。

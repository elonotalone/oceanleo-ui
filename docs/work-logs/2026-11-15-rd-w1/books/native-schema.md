# RD-W1 native 与契约任务书

唯一所有者：native-schema。主工作根 /root/wt/RD-W1-oceanleo-app，分支 wt/RD-W1。额外只可写两个生成文件：/root/wt/RD-W1-oceanleo/backend/app/remote_metrics_generated.py 与 /root/wt/RD-W1-oceanleo-ui/src/api/remote-metrics.generated.ts。不改其他 worktree 文件。不得改主检出、push、部署、开分支、安装依赖、构建/安装原生客户端、浏览器/设备操作。不创建子代理。最终代码父代理统一 commit。

先读安全 kernel、bootstrap、operator-rulings 与 native-app/iris-realdevice packs，以及 RD-REDUNDANCY/RD-ANALYZE 相关章节。明确的当前 worktree、禁止构建/部署指令覆盖默认 main-only/dev 交付。

A1：移除 rd.capture 逐帧发送及只用于它的状态；Envelope 授权 selector 生产固定 None 的死分支（有效 agent envelope 授权保留）；keyframe_ms 两边 8000 条件改常量；Access.expires_at 恒 None 字段去除。保留真实授权/权限复核与其他有效 expires_at。
A2：C++ ABI/Rust/gateway 53/54 字段与输入指标字段名改唯一权威 JSON schema 生成。建议 schema 放本 repo，生成器 scripts/generate-remote-metrics.py 支持 --app-root --gateway-root --viewer-root 与 --check，默认只指本 repo、跨库根必须显式传入，不能写主检出。生成 native header/结构或宏、Rust 声明/映射、gateway Pydantic model/INPUT_METRIC_KEYS、viewer INPUT_METRIC_KEYS。字段类型、顺序、ABI、optional/wire-only 字段必须保留，不要让现有手写清单继续权威；生成物标注来源并有 drift check。至少 UI 导出 INPUT_METRIC_KEYS，gateway 导出 INPUT_METRIC_KEYS 与 RemoteMediaMetrics（类型名如有变化立即通知父代理/backend）。生成器跨库路径需可用于独立 CI 校验。
缺陷：Windows 静态帧每次提交媒体 timestamp 严格单调递增（保持真实 capture wall time/序号，不改编码策略）。最小修改。

行为必须保持：有效 envelope/owner 授权；连接后默认编码参数；原生/网关 ABI 全字段、输入计数一致；rd.capture 停发不影响有效媒体/输入回执；静态帧 timestamp 递增。检查现有测试并补关键行为用例/生成契约校验。运行适用 Python/C++ 纯单元测试；按用户要求尝试 cargo check，不能安装工具链，失败真实记录。不得产生安装包；可用源级 cargo check。Windows C++ 无工具链时写明未编译。测试过 IO guard。每 30–60 秒回报。完成后回复文件:行、命令/结果、生成器调用与接口、未证实/未做。

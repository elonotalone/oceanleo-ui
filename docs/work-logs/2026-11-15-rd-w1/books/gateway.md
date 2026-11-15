# RD-W1 gateway 任务书

唯一所有者 gateway。工作根 /root/wt/RD-W1-oceanleo，已有分支 wt/RD-W1。只改远控相关 backend 源码/测试，排除 backend/app/remote_metrics_generated.py（native-schema 生成）。不改主检出、不 push/部署/开分支、不安装共享依赖、不碰保护进程、不用浏览器/设备、不创建子代理。父代理统一 commit。

先读 kernel/bootstrap/operator-rulings 与 RD-REDUNDANCY/RD-ANALYZE 对应章节。当前明确 worktree 分支要求覆盖默认 main-only，源码限定交付覆盖默认 slot 更新。

缺陷修复：remote_desktop_router.py writer 持续输入 admission/control 不能饿死 state/completion，control/state 必须优先 media。采用有界公平发送防止任一控制/状态队列饥饿，保留 backpressure 有界，优先控制语义；不要声称可抢占已开始网络写入。补行为测试证明连续控制下状态与媒体不会饿死，媒体洪峰下控制/状态仍优先。
A2 契约：native-schema 将生成 backend/app/remote_metrics_generated.py，至少导出 INPUT_METRIC_KEYS 与 RemoteMediaMetrics。移除本地手写媒体 metrics model/重复输入键清单，使用生成定义；session 的 metrics 转存/归一化用同一输入 keys。跟 native-schema 直接协调类型接口，排除生成文件写入。
A1 如 gateway 有仅用于普通 viewer broker 集成且确认无依赖的残留可清，保留 secure_broker 独立锁屏/受限权限/计费职责。不要删有效授权/HTTP/JPEG/WS/计费，不做 A3/A4/A5。

保持行为：首帧后计费；会话授权和续期；输入 admission/completion 的原语义；单写者；严格合法指标接收；secure broker 职责。运行相关 pytest（必须 worktree backend cwd），用已有环境/venv 不安装依赖，缺失说明。测试经 /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light/run-heavy。每 30–60 秒回报，结果给文件:行、实际命令与返回、限制。最终验证父代理复核。

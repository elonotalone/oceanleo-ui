# W2 — 部署"旧色干完活再停" + 电脑任务换色后状态/附着/镜像不掉

先读 `00-dispatch.md` 红线。仓库：`/root/projects/oceandino`（部署脚本）+ `/root/projects/oceanleo/backend/app/cloud_computer/**`（`acp/drain_health.py` 归 W1，别改）。必读：oceandino `docs/runbooks/oceanleo-api-zero-downtime-deploy.md`（尤其「工作站分身快速通道」和「换色时正在跑的 agent 对话会怎样」「已知缺口」两段）。

## 现状（parent 已核实，10-31 实例）
- 任务 `8ef8fb2b-ad21-439c-b103-41c771978be9`（computer 任务，`computer_task_sessions.id=cts_a442bce0cb864aa598a19b0b8d3ec66a`，节点 = 本机 `cc_6b9905f8aaf2`，Claude 会话 `ba97f6b4…`）：
  - 孪生 14:20 CST 换色（blue 06:20:30Z 起）后 `run_status` 被写成 `failed`、`state_request_id=node_error`（06:21:57Z），**之后再没改回**，但 agent 一直在干活（同一回合跑到现在）。
  - 16:19 CST 再次换色（green 08:19Z 起）后，`agent_messages` 停在 08:16Z，本机 transcript 继续写——新色没人重新附着，页面不打开就永远不补。
- 页面重新打开时附着会发 `session/load`，MCP 列表/令牌变化 → claude-agent-acp `teardownSession` → 可能取消进行中的回合（runbook「已知缺口」，代码阅读结论；10-31 14:20 那次实测回合没被取消，请你弄清楚到底在什么条件下会取消）。

## 要做
### A. 部署脚本（oceandino）
1. `scripts/deploy-image-bluegreen.sh` 加交接模式（建议 `DRAIN_MODE=handoff`，孪生 `.conf` 默认用它；生产 conf 不动，保持现状）：
   起闲色 → 闲色 `/health` 连续 OK → `POST http://127.0.0.1:<live>/health/drain`（W1 提供，回环）→ 等 Caddy 主动健康检查把流量切到闲色（`health_interval 5s`）→ 公网观察 → 轮询活色 `GET /health/acp-drain`，等 `leo_turns==0`（ACP 回合**不阻塞**），上限 `DRAIN_SECONDS`（孪生建议 900；到点照样 stop，因为 W1 的续跑会接手）→ `compose stop` 旧色（给足 stop 宽限，让进程走完关闭钩子）→ 写 live-color。
   旧色返回 404（旧镜像无 `/health/drain`）→ 回退到现有 pause 流程（含现有 `DRAIN_TIMEOUT_ACTION` 语义）。
   注意 Caddy `lb_policy first` + 上游顺序 `8101 8102`：确认闲色健康后流量按"第一个健康"走的实际效果（例如活色 green 时 blue 一健康就会立刻接流量），把真实行为写清楚、必要时调整步骤，保证不出现 502 窗口。
   失败回滚：闲色起不来 → 停闲色、旧色若已 draining 要能恢复（加 `POST /health/undrain` 的需求就写进交接给 W1/parent，或用重启旧色以外的办法），退出码与现网一致（2/5/6）。
2. `deploy/ws-host/oceanleo-api.conf` 改为交接模式参数。`--dry-run` 能打印全流程。
3. 有脚本测试就补（oceandino `scripts/tests/` 或现有 bluegreen 测试）；至少用 `--dry-run` + 假 curl/docker 桩跑一遍正常、404 回退、超时三条路径。
4. 更新 runbook 对应段落（短）。**不要** ssh ws-host 拷文件、不要跑真部署——parent 做。

### B. 电脑任务（oceanleo backend `app/cloud_computer/**`）
1. **新色启动后主动重新附着**仍在跑的电脑任务会话（不等用户打开页面），让 `agent_messages` 镜像持续更新；节点重放未确认输出时写进库（去重，按现有序号/确认机制）。范围只限本 `gateway_instance` 的会话（同 0308 迁移的规则），受 `background_workers.allow` 控制。
2. 重新附着成功、节点说回合还在跑 → `run_status` 从 `failed/node_error` 改回 `running`（只纠正"因断连而误判"的那类，不覆盖真正的失败/用户停止）。
3. 修「已知缺口」：附着到同一 slot 的活子进程时，不发会改变会话指纹的 `session/load`（或保持同一 MCP 令牌与列表），保证换色/刷新页面都不会取消进行中的回合。
4. 旧色 draining 时：ACP 附着如何干净地让给新色（不让两边同时附着打架），写清楚并实现。

## 验证
- 后端相关测试（`tests/test_cc_*`、acp attach / task_sessions 相关）+ 新测试：误判 failed 被纠正、真失败不被覆盖、附着不发改指纹的 session/load、启动重附着只碰本 instance。
- 脚本 dry-run 三条路径输出贴进结果。

## 结果
（完成后追加；parent 需要在 ws-host 执行的步骤列清楚）

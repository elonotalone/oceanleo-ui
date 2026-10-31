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

### W2 结果（2026-10-31 晚）

没 commit / push / deploy，没 ssh ws-host，没执行迁移。

#### 根因（四个，都核实过代码）
1. **failed/node_error 的来源**：旧色被 stop 时，在 lifespan 关闭里它的 SSH 附着断开 → 挂着的 `session/prompt` 以 PeerClosed(`node_error`) 失败 → `_prompt_body` 广播 error 帧 → writer 在 `stop_background` 里刷进库 → 0306 触发器把 running 写成 failed。之后再没有任何代码把它改回来。
2. **重附着会 SIGKILL agent**（比"取消回合"更糟，之前没发现）：新网关的 JSON-RPC peer 期望 seq 从 1 开始，节点重放的是原序号 N+1 → `_handle_line` 判乱序 → `_close("node_error", kill=True)` → SSH signal KILL → 节点 `Acp.Signal` 杀掉 agent。14:20 那次 agent 没死，是因为新色上页面没重开、根本没附着。
3. **session/load 取消回合的确切条件**（claude-agent-acp 0.90.0 `getOrCreateSession` + `computeSessionFingerprint`）：会话在 adapter 内存里，且 `cwd`、按名字排序后的 `mcpServers`、`_meta.claudeCode.options` 里的 `env`（MCP 令牌就在这里）任一不同 → `teardownSession` → `cancelTurns`。完全相同就不拆。新色附着路径没做 initialize（`mcp_http` 为假 → 列表为空），而且会签新令牌（`machine_tokens.issue` 按 label 吊销旧令牌），所以只要在新色上重开就一定会取消。
4. **两色互抢**：节点的 slot 总是交给最新的那次附着（`old.close()`）。被挤掉的那一色会立刻用 ATTACH_ONLY 恢复、再抢回来，两边来回跳。再叠加第 2 条，就会杀掉 agent。

#### 改了什么
**oceandino（A）**
- `scripts/deploy-image-bluegreen.sh`：新增 `DRAIN_MODE=handoff`，默认 `pause`，生产行为不变。流程：闲色健康 → `POST 127.0.0.1:<活色>/health/drain`（必须 200 且 `draining:true`，否则包括 404 都回到 pause 流程，`DRAIN_SECONDS`/`DRAIN_TIMEOUT_ACTION` 语义照旧）→ 公网 `/health` 连续 3 次 200 → 观察 → 写 live-color → **脱离的收尾进程**（setsid，日志 `state/oceanleo-api.handoff.log`）轮询 `GET /health/acp-drain` 的 `leo_turns`，最多 `LEO_DRAIN_SECONDS`，到点照样停，然后按容器 id `docker stop -t STOP_GRACE_SECONDS`。ACP 回合不阻塞。下一次发版先停掉还没收尾的旧色（`state/oceanleo-api.handoff`）。回滚：`POST /health/undrain`，404 时 `compose restart` 旧色；旧色健康后才停新色，退出 5；旧色起不来就保留新色继续服务，退出 6。收尾期间新色连续 3 次不健康 → 把旧色 undrain/重启，不停它。
  - **收尾必须放后台**：webhook 的 `OCEANDINO_DEPLOY_TIMEOUT` 是 900 s，Actions curl 也是 900 s。同步等 900 s 的话脚本会在半路被 SIGKILL：旧色不停，live-color 不写，下一次发版还会把正在服务的那一色当成闲色去重建。另外"一次只跑一个"的锁会把之后的每次 push 都挡住。
  - Caddy 实际行为（`lb_policy first` + `8101 8102`）：活色是 blue 时，drain 之后 ≤5–7 s Caddy 才把新请求转给 green，这几秒里打到 blue 的请求照常处理（只有 `/health` 返回 503），**没有 502 窗口**。活色是 green 时，blue 一过 Caddy 主动健康检查就接下全部新流量（发生在健康门期间、drain 之前），和 pause 流程一样。已建立的 SSE/WS 留在旧色上，直到旧色停掉。
- `deploy/ws-host/oceanleo-api.conf`：`DRAIN_MODE=handoff`、`LEO_DRAIN_SECONDS=900`、`STOP_GRACE_SECONDS=60`。`DRAIN_SECONDS=30`/`swap` 保留，只给 404 回退用。
- `deploy/ws-host/oceanleo-api-bluegreen.yml`：两色 uvicorn 加 `--timeout-graceful-shutdown 20`（头注释改为 6 处 `<<ws>>`）。不加的话，页面挂着的 SSE/WS 会让 uvicorn 一直等到被 SIGKILL，lifespan 关闭钩子不会执行，交接和刷归档都做不了。
- `scripts/tests/deploy-image-bluegreen.test.mjs`：+11 条（正常、404 回退、404 回退时默认仍按 fail-closed、Leo 超时照停、公网失败 undrain、无 undrain 改为 restart、后台收尾按 id 停、下次发版先结清、dry-run 顺序、twin/prod conf、非法 DRAIN_MODE）。
- `docs/runbooks/oceanleo-api-zero-downtime-deploy.md`：新增「交接模式」一段和表格；「已知缺口」后补上修复说明，以及仍然存在的两个缺口。

**oceanleo backend（B，`app/cloud_computer/**`，没碰 drain_health.py）**
- `acp/jsonrpc.py`：`attach_to_existing_child()`：首帧 seq 作基线；请求 id 换到随机高位段，避免旧网关的应答误结算我方请求。seq 断档 → `superseded`，关闭通道但**不发 signal**，code `computer_reconnecting`。`RecoveryRefused`：交接中拒绝恢复时立即停，不进重试循环。不认识的应答 id 交给 `on_orphan_response`。
- `acp/session.py`：attach-only 启动（`OCEANLEO_ACP_ATTACH_ONLY=1`；节点没有活子进程时抛 `acp_slot_missing`，不起新进程也不 reap）；附着进程的 `mcp_http` 取本进程学到的值，claude 默认 True。**领养回合** `adopt_turn`：计入 open turn，标记为 loaded + unsynced，**不发 session/load**。旧网关那次 prompt 的应答到达 → 补发 `done`（`_on_orphan_response`）。自己的 prompt 返回，或静默满 30 min → 结束领养。`needs_sync`：空闲后下一次 open/prompt 才真正 load（这时用新令牌是安全的）。draining/关机中 `_reconnect_transport` 抛 `RecoveryRefused`，不再抢回。
- `acp/registry.py`：`attach_existing()`；`_process_detached` 遇到交接或 superseded 时帧码写 `computer_reconnecting`，触发器本来就不把它当失败。
- `acp/handoff.py`（新）：`draining()` 读 W1 的 `background_workers.draining()`；`release_all()` 在关机时松开全部附着（不杀进程，保留 owner 标记）；`reattach_loop`：启动 90 s 后每 20 s 一次，受 `background_workers.allow("cloud_computer.acp_reattach")` 控制（draining 时 W1 的 allow 返回 False，自己也再检查一遍）。只查 `gateway_instance = 本 instance_id()` 的 running/waiting/因断连 failed、且没人续租的行 → SQL 原子认领 → 先绑定归档 → attach_existing → adopt_turn。slot 没有活子进程的行，本进程内不再重试。
- `task_sessions.py`：每个进程第一次见到某行的帧/绑定时，给该行写 `gateway_instance` + `acp_scope`（dialog scope，算 slot 要用）。附着后第一条**回合输出**（delta/tool/turn_start/done/permission/question，不含 replay 和元数据噪音）之前插一个 `reclaim`，用 SQL 把因断连误判的 failed 改回 running。交接中丢流产生的 node_error/dialog_detached/computer_offline 不入库，真实失败照常入库。关机顺序：handoff.release_all → 刷 writer → `computer_task_release_leases` 让本色的租约立即到期。迁移没执行时，第一次失败就把功能关掉（只记一次日志），归档不受影响。
- `agent_dialog.py`：open/prompt 在 attach **之前**按缓存行做内存绑定（节点重放的输出因此能进库）；`_adopt_if_live`：只针对同 slot 的附着进程，条件是附着后见过回合输出，或任务行是 running/waiting/因断连 failed；领养时不发空的 replace transcript（否则会清空页面）；prompt 路径只在需要 load/new 时才签 MCP 令牌；`bind_managed` 多传 scope（位置参数）。
- `migrations/0310_computer_task_reattach.sql`（新，只加不删）：`computer_task_sessions.gateway_instance`、`acp_scope` 两个可空列，一个部分索引；函数 `computer_task_claim_reattach`、`computer_task_reclaim_run`（只改 node_error/dialog_detached/computer_offline/computer_reconnecting/lease_expired；其他失败码、cancelled、completed 不改；instance 不是本家的不改）、`computer_task_release_leases`。权限只给 service_role。
- `tests/test_cc_acp_handoff.py`（新，21 条）：seq 基线、断档不杀、id 不撞、拒绝恢复、draining 不抢回、attach-only miss、orphan done、release_all 不发 signal 且 code 为 reconnecting、detach 帧码、reclaim 在帧前、噪音/replay 不触发 reclaim、交接中丢流不入库（真失败入库）、只写一次 instance+scope、迁移缺失时降级、扫描只查本家/跳过有人续租的和真失败的、draining 不扫、只有认领到的才附着并领养、slot 没了不重试、**新色重开活回合时不发 session/load、不签令牌、不清屏，orphan 应答补 done，空闲后先 load 再 prompt**、真失败不领养。

#### 测试
- 后端（容器里没装 pytest；我用 `docker exec -w /app -e PYTHONPATH=/tmp/w2pyt oceanleo-api python -m pytest …` 跑，`/tmp/w2pyt` 是容器内软链到挂载 venv 的 pytest/pluggy/iniconfig，没重启容器）：`test_cc_acp_handoff/resume/jsonrpc/drain/hermes_catalog/home/launch/programs_link/rebind/translate/vanish`、`test_agent_dialog(_fail_text)`、`test_cc_agent_dialog_login`、`test_cc_dialog_cancel/inbox/open_fast/sessions/v2`、`test_cc_image_replay/occupancy/prompt_settle`、`test_computer_task_sessions`、`test_w2_acp_lifecycle`、`test_cc_node_ws`、`test_computer_tasks_every_site` → **284 passed**。
- HEAD 上本来就失败、和本改动无关（已用 HEAD 拷贝跑过对照）：`test_cc_run_headless::test_cancelled_turn_is_not_listed_as_busy`；`test_cc_registry_lease` 的 4 条（被 run_headless 的残留任务污染，单独跑能过）；`test_cc_delegate` 5 条和 `test_cc_claude_history_recovery` 1 条（密钥库不可用）。
- oceandino：`node --test scripts/tests/deploy-image-bluegreen.test.mjs` 40/40，`deploy-rollback-bluegreen` 16/16，`deploy-image-bluegreen-cutover` 14/14，`bash -n` 通过。

#### 脚本三条路径（桩 docker/curl，HANDOFF_BACKGROUND=0 内联跑；后台路径另有测试覆盖）
```
=== normal (drain 200, Leo 0)
handoff: ask live :8101 to stop taking new work (POST http://127.0.0.1:8101/health/drain)
handoff: live :8101 is draining; its /health now answers 503
https://api.oceanleo.com/health 200 (1/3) … (3/3)
handoff: waiting up to 900s for Leo turns on old :8101 (ACP turns do not block)
handoff: no Leo turns left on old :8101 (ACP turns: 1, the new color re-attaches them)
stop old color oceanleo-api-blue (grace 60s: …)
DONE service=oceanleo-api sha=abc1234 live=green port=8102 mode=handoff      exit=0
=== 404 fallback (old image)
handoff: live :8101 has no /health/drain (image predates handoff) -> pause flow
drain ACP on :8101 via http://127.0.0.1:8101/health/acp-drain (up to 1s, on timeout: abort)
ACP drain ceiling 1s reached; preserving live color with turns still open
deploy of abc1234 failed; previous color still serving                        exit=5   (twin conf swap 时照样换色)
=== Leo timeout (2 turns, ceiling 1s)
handoff: 2 Leo turn(s) still running on old :8101 (ACP: 1)
handoff: Leo drain ceiling 1s reached with 2 turn(s); stopping old color anyway (the new color resumes them)
stop old color oceanleo-api-blue (grace 60s: …)
DONE … mode=handoff                                                           exit=0
```
`bash scripts/deploy-image-bluegreen.sh --dry-run oceanleo-api <sha>` 加 `DRAIN_MODE=handoff`，能按顺序打印全流程（drain → 公网 → 观察 → live-color → 收尾：Leo 等待 → `docker stop -t 60 <id>`）。

#### 交接给 W1 / parent
- **W1**：脚本回滚时调用 `POST /health/undrain`（只允许回环，幂等，清掉 draining，返回同一 payload）。W1 现在写的是"drained 永不 undrain"，那脚本就走 `compose restart` 旧色（Leo 回合由 W1 的续跑接手），也能工作，只是更重。我只用到了 `background_workers.draining()`（getattr 读取，不存在时当作 False）。
- `/health/acp-drain` 需要带 `leo_turns`（W1 已有）。

#### parent 要做的（ws-host / 库）
1. 执行迁移：先跑 W1 的 0309，再跑 `backend/migrations/0310_computer_task_reattach.sql`（Supabase `oceanleo`）。迁移没跑也能部署：扫描、写 instance、reclaim 会自动关掉，其余照常。
2. 拷文件（顺序随意；活色镜像不认 drain 时会自动回到 pause 流程）：
   `scripts/deploy-image-bluegreen.sh` → `/opt/oceandino-deploy/bin/deploy-image.sh`；
   `deploy/ws-host/oceanleo-api.conf` → `/opt/oceandino-deploy/services/oceanleo-api.conf`；
   `deploy/ws-host/oceanleo-api-bluegreen.yml` → `/opt/oceandino-deploy/services/oceanleo-api-bluegreen.yml`（或用 `DEPLOY_FLAVOR=bluegreen bash deploy/install-deploy-target.sh ws-host deploy/ws-host`）。
3. 提交并推送 oceanleo backend 后：**第一次**发版时活色还是旧镜像 → 404 → pause 流程（30 s 后 swap），这是预期行为。**第二次**起走 handoff。看 `state/oceanleo-api.handoff.log`，`docker logs oceanleo-api-<新色> | grep '\[handoff\]'`（期望看到 `re-attached …`），以及 live-color。
4. 卡住的任务 `cts_a442bce0cb864aa598a19b0b8d3ec66a` 的 `gateway_instance`/`acp_scope` 现在是空的，扫描不会碰它。新代码上线后在分身上打开一次这个任务页就行：预绑定会写入 instance+scope，同 slot 附着时按"因断连 failed"领养（不发 load），第一条回合输出出现就改回 running。

#### 没证实 / 残留
- 全部基于桩和代码阅读，没有在真机上跑过换色（按红线不做部署）。claude-agent-acp 的指纹逻辑是读本机 0.90.0 源码确认的；节点 seq/attach 行为是读 `oceanleo-node/internal/acp` 源码确认的。
- 新色给同一台电脑签**任何** MCP 令牌都会吊销旧色签的（按 label）。被领养回合里的 OceanLeo 工具调用会 401，直到回合结束、重新 load 为止。根治需要可派生或按会话分 label 的令牌，留待后续。
- 换色那一刻如果 agent 正在等权限确认：那条请求已经被旧色 ack 收走，新色看不到，agent 会一直等到自己的超时。
- 领养判断依赖任务行状态或附着后的回合输出。如果任务行误显示 running 而 agent 实际空闲，页面最多会显示"忙"30 min（用户发一句话就会结束）。非托管的 Shell 对话里，如果正在跑一个长时间没有输出的工具，重开仍可能 load → 取消。
- 交接窗口里（活色是 green 时 blue 先接流量、drain 到达前几秒），在新色上开页面会和旧色抢 slot。现在不会杀 agent，最坏情况是某一侧报 `computer_reconnecting`，页面重连一次。
- 旧色 shutdown 刷归档依赖 uvicorn 20 s 优雅退出加 `stop -t 60`。如果 lifespan 还是没跑到，退路是租约 3 min 后过期 → 变成 failed/lease_expired → 新色扫描认领并 reclaim。
- `deploy-rollback-bluegreen.sh` 不知道有后台收尾进程；收尾期间手工回滚的话，先 `cat state/oceanleo-api.handoff` 看一下。

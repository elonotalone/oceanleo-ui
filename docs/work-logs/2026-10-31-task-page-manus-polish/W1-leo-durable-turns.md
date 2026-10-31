# W1 — Leo 云端回合：换色不丢、被打断自动继续跑、drain 计数与"只停接新客"开关

先读 `00-dispatch.md` 红线。仓库：`/root/projects/oceanleo`（backend）。

## 现状（parent 已核实）
- Leo 回合跑在网关进程里：`app/agent/engine_port.py::_spawn` → `asyncio.create_task(engine.run_task_loop(...))`；运行集合在 `app/agent_engine.py` 的 `_RUNNING` / `_RUNNING_TASKS`（约 94 行），停止 `request_task_stop`（135 行）只在本进程内存生效。
- 换色（oceandino `scripts/deploy-image-bluegreen.sh`）= 起闲色 → `docker pause` 活色 → 30 s 后 stop。旧色里的 Leo 回合随之死掉。启动时没有任何代码接手；库里有 `agent_tasks.status='running'` 永久卡住的行（1 个 agent 卡在 10-24、17 个 shell 卡在 9 月）。
- `/health/acp-drain`（`app/main.py` ~645 行，`app/cloud_computer/acp/drain_health.py`）只数 ACP 回合（`active_turn_count()`），不数 Leo。
- 数据库 Supabase `oceanleo` 被生产、孪生（api.oceanbizs.com）、开发网关共用。已有"每行记住属于哪家网关"的模式：`app/background_workers.py::instance_id()` + 迁移 `migrations/0308_gateway_instance_ownership.sql`（照抄它的写法和注释风格）。后台循环受 `background_workers.allow(...)` 控制（开发网关 `OCEANLEO_BACKGROUND_WORKERS=0`）。

## 要做
1. **租约 + 心跳**：Leo 回合开始时写下 `gateway_instance`（=`instance_id()`）、本进程标识（容器/颜色 + pid + 启动随机数）和心跳时间；运行中每 ~15 s 刷心跳；结束清掉。存哪由你定（新表或 `agent_tasks` 加可空列），迁移**只加不删**，写 `migrations/0309_*.sql`，不执行（parent 执行）。
2. **自动继续跑**：网关启动时 + 周期扫（~30 s，受 `background_workers.allow` 控制）认领"本 `gateway_instance` 的、`running`、心跳过期（> ~60 s）"的任务，用原子条件更新抢占（两色并跑时只能一家抢到），然后从库里已存的消息/步骤**接着跑**（不是重跑整个任务：不重复已完成的工具调用、不重复扣费；接续时给模型的上下文要说明"上一段在第 N 步被网关更新打断"）。用户页面上不需要点"继续"。没有租约的旧行（遗留卡死）**不要**自动续跑：超过最长回合时长的一律收成 `stopped`（或现有的"中断"状态），写清楚规则。别家 `gateway_instance` 的行永远不碰。
3. **停止跨进程**：新请求可能打到另一色，`request_task_stop` 要能停掉别的进程里的回合（例如库里写停止标记，回合循环每步检查）。现有用户停止语义不变。
4. **drain 计数**：`/health/acp-drain` 返回 `{"ok":true,"turns":<acp+leo>,"acp_turns":n,"leo_turns":m,"draining":bool}`，`turns` 语义保持"总数"兼容旧脚本。
5. **"只停接新客"开关**：新增仅回环可用（复用 `is_local_drain`）的 `POST /health/drain`（幂等，返回同上 payload）。进入 draining 后：`GET /health` 返回 503（Caddy 主动健康检查就会把新流量切到另一色）；本进程不再认领新的后台工作（续跑扫描、其它 `allow` 门的循环——至少续跑扫描必须停）；已在跑的 Leo 回合继续跑完；新进来的创建 Leo 回合请求若仍落到本进程（Caddy 切换前几秒），照常处理或转为由续跑接手，二选一写清楚。
6. 契约写给 W2（部署脚本）用：W2 会 `POST http://127.0.0.1:<live>/health/drain`，然后轮询 `GET /health/acp-drain` 直到 `leo_turns==0` 或超时，再 stop 旧色；旧镜像没有 `/health/drain`（404）→ W2 回退到旧的 pause 流程。ACP 回合不阻塞 stop（agent 在节点上，不会死；W2 负责重新附着）。

## 验证
- 新测试：租约写/刷/清；过期认领原子性（模拟两家同时认领只有一个成功）；别家 instance 不碰；遗留无租约行收口；跨进程停止；drain payload；`POST /health/drain` 后 `/health` 503、非回环 404。
- 跑相关已有测试（`tests/test_leo_turn.py`、agent engine / task service 相关、`test_background_workers*`、acp drain 相关），只跑相关的。

## 结果
（完成后在此追加；包括迁移文件名、W2 需要知道的接口细节、parent 需要执行的迁移 SQL 路径）

### W1 结果（2026-10-31，W1 子 agent）

**根因**：Leo 回合是网关进程里的 asyncio 任务，进程内存之外没有"谁在跑、还活着吗"的记录；换色 pause+stop 杀掉旧色后没人接手，`agent_tasks.status='running'` 永久卡住；停止只在本进程内存生效；drain 只数 ACP。

**改动文件**（仓库 `/root/projects/oceanleo/backend`，未 commit）
- 新 `migrations/0309_agent_task_leases.sql`（**parent 执行**）：新表 `agent_task_leases`（task_id PK → agent_tasks on delete cascade；gateway_instance / lease_owner / lease_token / heartbeat_at / started_at / resumes / stop_requested_at），一个索引，RLS 开、anon/authenticated revoke。纯新增，不改 agent_tasks。
- 新 `app/agent/turn_lease.py`：begin（写租约，新用户回合 resumes 归 0，换 token = 新回合赢）/ watch（每 3 s 读行：stop 标记或行被删 → 本地停止；token 被换 → 让出、不当作停止；每 15 s 在 token 条件下刷心跳）/ end（正常结束删行；被关机取消则保留，心跳自然过期）/ claim（条件 UPDATE：同 gateway_instance + 原 token + 心跳 > 60 s，两色同时抢只有一家拿到）/ request_stop / scan_stale。表缺失或库挂 → 回合照旧不带租约跑（fail open），绝不因存储错误停回合。
- 新 `app/agent/turn_resume.py`：续跑扫描（启动后 5 s 一次 + 每 30 s，每轮重新问 `background_workers.allow("agent.turn_resume")`，开发网关 / draining 时不扫）。规则写在模块头：本家过期租约 → 抢到后从库里接着跑（最后一条用户消息 + 其 turn settings / 附件重签 + 之前 10 条历史；本回合已有步骤列成清单放进 hidden_context，明确"在第 N 步被网关更新打断，已成功的工具调用/产物不要重做"；仍是 running 的步骤标 failed「服务更新打断」，半截流式文本收口；插一条可见 step「服务更新后自动继续」）；skill 模式同理；云端驱动的设备任务交给它自己的 checkpoint 续跑；抢占超过 3 次 → failed + `stop_reason='gateway_interrupted'`；任务已不在 running → 只删租约。**无租约的 running 行永不续跑**：`updated_at` 超过 6 h（引擎墙钟上限 50 min）且 mode ∈ agent/skill/shell/空、非 `engine='local'`、非 desktop → `stopped` + `stop_reason='gateway_interrupted'`（非 shell 行补一条提示）；有任何一家租约的行不碰；租约表读不到 → 一条都不收（fail closed）。别家 gateway_instance 的行永远不碰。
- `app/agent_engine.py`：`run_task_loop` / `skill_chat` 加 `lease_token=""`，开始 begin+watch，结束 end（区分 用户停止 / 关机取消 / 被接管）；`request_task_stop` 本地没有回合时写库里的停止标记（跨进程停止，现有停止语义不变）；`leo_turn_count()`；`resume_device_session(..., lease_token="")`；`resume_device_sessions()` 启动时先 `claim(missing_ok=True)`，旧色仍在驱动（新鲜租约）就跳过，避免两色同驱一个设备 run；新 `resume_device_task()` 给扫描用。
- `app/cloud_computer/acp/drain_health.py`：payload 改为 `{"ok":true,"turns":acp+leo,"acp_turns":n,"leo_turns":m,"draining":bool}`；新增 `begin_drain()`。
- `app/main.py`：`GET /health` draining 时 503 `{"ok":false,"draining":true}`；新增 `POST /health/drain`（仅回环，复用 `is_local_drain`，幂等，返回同上 payload）；受门控的 startup 里起 `turn_resume.sweep_loop()`。
- `app/background_workers.py`（交接：不在原独占清单，小改）：`begin_drain()` / `draining()`；`allow()` 在 draining 后一律 False（每轮重新问 allow 的循环立刻停接新活）。
- 测试：新 `tests/test_leo_turn_lease.py`（27 条）；`tests/test_cc_acp_drain.py` 的 payload 断言改为新形状。

**给 W2 的接口**
- `POST http://127.0.0.1:<live>/health/drain` → 200 + payload（幂等）；旧镜像 404 → 回退旧 pause 流程。带 `X-Forwarded-For` 也是 404。
- 然后轮询 `GET /health/acp-drain` 直到 `leo_turns==0` 或超时再 stop 旧色。`leo_turns` 含 agent 回合、skill、**云端驱动的设备 loop**（后者可能等电脑很久，靠你的超时兜底）。超时后 stop 也不丢：租约 ≤60 s 过期，新色 ≤30 s 扫到后接着跑（最坏约 90 s 延迟）。
- drain 后本进程 `GET /health` = 503：Caddy 主动健康检查切走新流量；**docker 自身 healthcheck 也会把旧色标 unhealthy**（没有 autoheal 就无影响，提醒一下）。
- 落到 draining 进程上的新 Leo 请求：**照常处理**（计入 leo_turns，被 stop 则由新色续跑）。
- 新色启动时的设备 run 恢复已改为先抢租约，旧色还在跑就不会双驱。

**测试**（容器里没有 pytest，用 `docker exec -w /app oceanleo-api python -m unittest ...`，未重启容器）
- `tests.test_leo_turn_lease` + `tests.test_cc_acp_drain`：33 条全过。
- 相关已有：`test_background_workers_flag`、`test_device_session_loop`、`test_tpp_w2_stream`、`test_agent_engine_honesty`、`test_agent_sessions`、`test_device_agent_tasks` 全过；`test_followup_latency_paths` 6 errors（fake repo 缺方法 → task not found；bench 读宿主路径 `scripts/triage_bench.py` 不存在）与 `test_leo_turn` 1 fail（provider openrouter≠bailian，配置相关）都在我没碰的代码路径上，判断为既有失败。

**未证实**
- 迁移未执行，真实库上的租约读写、条件 UPDATE 只在内存 fake（含双线程同时抢占）里验证过；执行 0309 前所有回合照旧无租约运行（fail open），续跑扫描空转。
- 没有真机换色演练（需要 W2 脚本 + parent 部署）；续跑后模型是否严格"不重做"取决于模型遵从提示，CodeAct kernel 内存状态不会恢复（产物指针仍会附上）。
- hidden_context（工作区上下文）原本不落库，续跑时拿不到。
- 已有测试直接调 `run_task_loop`（真实 uuid 任务号）时，begin 会对共享库发一次 upsert，因表不存在 / 外键而失败，不产生行。
- 迁移号 0309 若与 W2/W3 撞号，由 parent 改名。

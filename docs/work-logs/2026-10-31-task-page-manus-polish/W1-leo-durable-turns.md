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

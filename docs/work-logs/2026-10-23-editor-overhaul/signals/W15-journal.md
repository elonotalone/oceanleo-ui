# W15 journal（每条实测结论一行）

- Codex continuation [实现] oceanleo aee0bb6 +2c8bcb9：owner-private durable iteration job receipts、202 submit/GET result、原子幂等claim、16global/2owner上限、30min worker/31min client预算；原模型/审核/credits不改。取消/重启不自动重放；provenance恢复commit→receipt窗口；标题保留。backend12/12、client9/9，父独立复核。
- Codex continuation [实现] UI75254d2b +25ca072a +efe3fd97：GET-only resume opt-in、运行/重连16locale提示、订阅late runner registration。Game main-site19/19、core10/10、draft-key4/4、i18n结构4/4。
- 15:47Z [实测] acceptance root53931dfb，842a… job落ordinal9/90437…；15:49Z第二940d…job落ordinal10/41a998…；两次均保留“背景改成深蓝色。”标题，每job仅1版。实际51s/80s；>180s路径只在注入时钟定向测试覆盖，不冒充真实长模型运行。
- Codex continuation [验收纠正] 首轮harness终止前已发出842a提交，早先ledger文件不存在的检查不能证明之后没有提交；重启scenario又在新head发940d，属于2次独立base生成，非同base重试。已如实撤回“未生成”推断；不再任何生成POST，仅GET追踪。
- Codex continuation [实测] codex-job-status.py：authenticated latest/精确940d GET均200/succeeded，revision41a998/title一致；不同artifact locator→404；不输出token/URL。
- Codex continuation [验收中] reopen未见latest请求，补订阅registration回归；当前真实browser受并行ProfilePageEditor→ProfilePageSettings短暂未落盘的编译overlay影响。父已协调owner落盘，等batch settled后重跑，不把外部编译中断当W15完成或永久缺失。
- Codex continuation [已定位并修复] 稳定窗口真实fiber证实item durable/runner marker均正常。根因StrictMode replay：首次resume标记已设，cleanup abort异步defaultDependencies后的fetch，重放被标记拦住。新增StrictMode async-runner test先红0≠1，419721dd修后game-main20/20绿；最终browser13.6s已收到latest succeeded GET、POST0，继续完整reload。
- Codex continuation [最终实测通过] /tmp/codex-w15-resume-strict全场景132.4s PASS：latest GET共3次、POST始终0，offline恢复后全页reload→41a998/title一致/saved，再全页reload仍saved。已归档evidence/W15/codex-resume.log与codex-reopened.png；截图新green stars可见。追加整体deadline取消回归后backend13/13绿。无第三次生成、无push/deploy/operator数据写入。

- 05:17Z [实测] 开发槽 05:09–05:25Z 新请求超时（父 agent：会话代理连接池满，已扩容重启），之后 /library 0.4s。
- 05:27Z [实测] 开发槽的网关是 `https://api.dev.oceanleo.com`（本机 oceanleo-api，写生产库）。
- 05:28Z [实测] 没有任何可 fork 的公共游戏：206 个 public 平台游戏 root 全部 retired，`game_official_feed` / `game_official_catalog` 为空，`template_materials` 无 game。任务书「从公共游戏打开一份」做不到。
- 05:30Z [实测] 验收账号 `POST /v1/game-generate`（默认路由）→ 422 `game-generation-moderate-prompt`，两条 finding 都是「语义审核结果无法解析，fail-closed 转人工」（llm-semantic）。默认路由解析为 `openrouter / qwen/qwen3.7-plus`。同一问题会让编辑页「迭代这一版」对所有人失败。已写 `signals/W15-to-parent.md`。
- 05:33Z [实测] 同一 brief 显式 `provider=openrouter, model=qwen/qwen-2.5-72b-instruct` → 200，47s，验收账号得到游戏 `53931dfb-8ef2-4fb5-9db8-d88d98b990bf`（rev `61f9cc06…`，标题「W15 星星收集」）。场景 `evidence/W15/scenarios/make-game.mjs`。
- 05:34Z [读码] 父 agent 仲裁 A-1（面板型规范项用 inspector 子控件）与游戏无关：游戏没有文字/图片/形状选区。
- 05:56Z [实测] 复现根因：默认路由 openrouter/qwen/qwen3.7-plus 审核调用 text='' finish=length reasoning_tokens=200；qwen-2.5-72b-instruct 返回合法 JSON allow。修：game_generate_router 审核走非推理模型链（512 token），链全不可用回退生成模型+4096；pytest tests/test_game_moderation_route.py 等 22 passed。即将 docker restart oceanleo-api（A-2 许可的唯一一次）。
- 10:25Z [实测] R2 接班：oceanleo-api StartedAt 09:51:02Z（晚于 bb7937e 05:56Z），容器内 game_generate_router.py 已含 MODERATION_MAX_TOKENS/_moderation_chain；A-2 许可的那次重启不再需要，W15 未重启。
- 10:28Z [实测] 基线：Edit 页编辑栏只有「玩法」(未译)+AI；Code 页（aux 页）没有编辑栏，toolbox 里的运行/停止/重载点不到；深色下 Code 页中缝 border 是 currentColor 白线。
- 10:31Z [实测] 基线保存：Code 页两次改动都显示「已保存」，DB 只 +1 revision（ordinal 2）；复跑时两次上传都 409（typed_artifact_upload_replay 400）。根因 [读码]：幂等键 `game-draft:<seed>:<item.id>` 与内容无关，第二次换字节撞键。
- 10:36Z [实测] 后端修复生效：默认路由 POST /v1/game-generate/<id>/iterate 200（~40s），DB ordinal 3，版本列表出现 v2；但「新玩法已生成并保存」提示编辑页上看不到（只进 adapter.status）。
- 10:50Z [实测] focused：game-core-swap 10/10、game-main-site-1022 14/14、hidden-runtime 3/3、W6-r2 7/7 等 11 份绿；g3-portal-typed-editor 红在 material-library-standalone 循环依赖（W02 文件，非本人）。i18n 闸红 2 条均非游戏文件；tsc 本人文件 0 错。
- 12:31Z [实测] 修后 Code 页保存协议：两次改动 → 两次 upload 200 + 两次 POST revisions 200，DB ordinal 4、5；全新浏览器打开 Code 页两处标记都在；库条目数不变。
- 12:35Z [实测] 断网改动：saving→error（从未出现 saved），恢复网络后 error→saving→saved，DB ordinal 6。
- 12:36Z [实测] Code 页运行条：停止 → data-game-preview-paused=true 且显示「试玩已停止」；运行 → false；重载 → reloadKey 0→1。
- 12:38Z [实测] 第二次「迭代这一版」181s 后报「连接中断，未能确认修改结果…」（game 仓 runner 文案），错误现在在抽屉里可见；DB 无新 revision。生成模型 qwen3.7-plus 多轮调用 >3 分钟，超出前端/代理等待；非本人文件。
- 12:56Z [实测] 第三次迭代同样约 180s CORS 失败，服务器 12:50:58Z 落 ordinal 8，编辑器自行关回 /library 预览页；已写 W15-to-parent §2。交付已写。

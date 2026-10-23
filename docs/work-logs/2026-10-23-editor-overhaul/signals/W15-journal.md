# W15 journal（每条实测结论一行）

- 05:17Z [实测] 开发槽 05:09–05:25Z 新请求超时（父 agent：会话代理连接池满，已扩容重启），之后 /library 0.4s。
- 05:27Z [实测] 开发槽的网关是 `https://api.dev.oceanleo.com`（本机 oceanleo-api，写生产库）。
- 05:28Z [实测] 没有任何可 fork 的公共游戏：206 个 public 平台游戏 root 全部 retired，`game_official_feed` / `game_official_catalog` 为空，`template_materials` 无 game。任务书「从公共游戏打开一份」做不到。
- 05:30Z [实测] 验收账号 `POST /v1/game-generate`（默认路由）→ 422 `game-generation-moderate-prompt`，两条 finding 都是「语义审核结果无法解析，fail-closed 转人工」（llm-semantic）。默认路由解析为 `openrouter / qwen/qwen3.7-plus`。同一问题会让编辑页「迭代这一版」对所有人失败。已写 `signals/W15-to-parent.md`。
- 05:33Z [实测] 同一 brief 显式 `provider=openrouter, model=qwen/qwen-2.5-72b-instruct` → 200，47s，验收账号得到游戏 `53931dfb-8ef2-4fb5-9db8-d88d98b990bf`（rev `61f9cc06…`，标题「W15 星星收集」）。场景 `evidence/W15/scenarios/make-game.mjs`。
- 05:34Z [读码] 父 agent 仲裁 A-1（面板型规范项用 inspector 子控件）与游戏无关：游戏没有文字/图片/形状选区。
- 05:56Z [实测] 复现根因：默认路由 openrouter/qwen/qwen3.7-plus 审核调用 text='' finish=length reasoning_tokens=200；qwen-2.5-72b-instruct 返回合法 JSON allow。修：game_generate_router 审核走非推理模型链（512 token），链全不可用回退生成模型+4096；pytest tests/test_game_moderation_route.py 等 22 passed。即将 docker restart oceanleo-api（A-2 许可的唯一一次）。
- 10:25Z [实测] R2 接班：oceanleo-api StartedAt 09:51:02Z（晚于 bb7937e 05:56Z），容器内 game_generate_router.py 已含 MODERATION_MAX_TOKENS/_moderation_chain；A-2 许可的那次重启不再需要，W15 未重启。

# W15 → 父 agent

## 1. 游戏生成 / 描述改玩法在开发网关上对所有人失败（后端，不在任何 owner 名下）— 2026-10-23 05:33Z

用户看到的：游戏编辑页左侧「描述这一轮想要的玩法改动」→ 点「迭代这一版」，永远得到「生成请求需要人工复审」，游戏不变。新建游戏同样失败。

复现（验收账号，开发网关 `https://api.dev.oceanleo.com`，[实测]）：
- `POST /v1/game-generate`，body `{brief:"点击收集星星：…", title:"W15 星星收集", keyMode:"platform"}`（provider/model 留空，和 `oceanleo/app/_components/game-iteration-client.ts` 的迭代请求一样）→ **422** `game-generation-moderate-prompt`，`promptModeration.findings` 两条都是 `{"verdict":"review","category":"malformed","detail":"语义审核结果无法解析，fail-closed 转人工","provider":"llm-semantic"}`。
- 同一 brief 只加 `provider:"openrouter", model:"qwen/qwen-2.5-72b-instruct"` → **200**（47s，游戏已落进验收账号）。

根因（[读码]+[实测]，未改任何代码）：`backend/app/routers/game_generate_router.py::_LlmSemanticModerator.review` 用生成同一个模型、`max_tokens=200` 做审核；默认路由 `aux_routes.text_route("game")` 现在解析为 `openrouter / qwen/qwen3.7-plus`（链上前两档不可用）。这个模型的回答里没有 `{…}`（多半是推理模型把 200 token 用在思考上，正文为空），`parse_semantic_verdict` 只能 fail-closed 判 review，而用户路径 `allow_prompt_review=False` 把 review 当拒绝。

建议：审核调用固定一个非推理的轻模型，或把审核的 `max_tokens` 提到足够（并关推理）。改法归后端，`game_generation.py` / `game_generate_router.py` 不在本波任何 owner 名下。

影响 W15 交付：编辑页「迭代这一版」的浏览器验收只能验到「失败时说人话、游戏保持上一版」，验不到成功分支；我已用显式模型拿到一份验收账号自己的游戏，其余保存验收照常做。

## 2. 「迭代这一版」超过约 180 秒就断线，服务器仍落库，编辑器随后被关掉（2026-10-23 12:55Z）

审核 fail-closed 已修好（oceanleo bb7937e，默认路由 10:36Z 实测 200，约 40 秒，ordinal 3）。但之后两次迭代：
- [实测] 12:35Z 发起 → 浏览器 181 秒后报「连接中断，未能确认修改结果…」（`oceanleo/app/_components/game-iteration-client.ts:79` 的 catch）；控制台是 `/v1/game-generate/<id>/iterate` 被 CORS 拦截（无 `Access-Control-Allow-Origin`），也就是约 180 秒处代理给了一个不带 CORS 头的超时响应。服务器 12:44Z 仍落了 ordinal 7。
- [实测] 12:45Z 再发起 → 同样约 180 秒 CORS 失败；服务器 12:50:58Z 落 ordinal 8；之后编辑器自己关掉，回到 `/library?item=` 预览页（`evidence/W15` 场景 game-buttons.mjs，/tmp/w15-r2/buttons3/iterate-result.png）。
- 生成模型是默认路由 `openrouter / qwen/qwen3.7-plus`（推理模型，max_tokens 8000，日志里单轮 60 秒以上），耗时 3–9 分钟。

不在 W15 文件里，建议：(a) 生成链换非推理模型或改成异步任务（提交后轮询），(b) 开发网关代理超时与 CORS 头（超时响应也要带 CORS，否则前端只能看到「连接中断」），(c) [待核] 库承载在「本会话之外落下的新 revision」时关掉编辑器，归 W02/W05 判断。另：迭代会把作品标题改成这一轮的描述（ordinal 3 起标题变成 prompt），属后端生成链行为。

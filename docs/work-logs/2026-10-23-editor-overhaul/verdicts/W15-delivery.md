# W15 交付 — 游戏（R2）

## 做了什么（用户看得到的）

- **「玩法」抽屉（编辑页）**：编辑栏空态按钮「玩法 / Gameplay」打开描述框 →「迭代这一版」。生成成功或失败的提示现在**显示在按钮下面**（失败 role=alert）。以前提示只进 `adapter.status`，编辑页上没有任何地方显示，失败时用户什么都看不到。
- **Code 页运行条**：运行 / 停止 / 重载 + 参数滑块搬到代码舞台顶上。Code 是 aux 页，外壳不在 aux 页画编辑栏（`editBarVisibleOnPage`），按钮以前放在 toolbox 里，**根本点不到**。停止时显示「试玩已停止，点「运行」继续」。
- **Code 页第二次保存修好**：上传幂等键原来是 `game-draft:<seed>:<item.id>`，和内容无关；第二次保存换了字节却用同一把键，上传 409，保存成不了 revision。现在键跟着内容摘要走。
- **编辑页诚实的 dirty**：「未保存」= 当前显示的版本不是服务器最后确认的那一版（按信封摘要比）。撤销、重做、点版本列表回到旧版、恢复草稿，都会自动保存成新 revision。以前这些路径 dirty 不变：显示「已保存」，重开却是另一版。
- **深浅两档**：两页全部走 `--awb-*` token，没有写死的浅色回退。深色下 Code 页中缝的白线（`border` 默认 currentColor）已去掉。浅色站点下是浅色面板；游戏画面保持原样。
- **英文等 16 语**：路由、Code 页、抽屉、运行条的文案全部经 `tt`，`editor-overhaul-copy-w15.ts` 共 35 条。
- **后端（A-2，上一轮已交）**：oceanleo `bb7937e`，语义审核改用非推理轻模型链（512 token），链全不可用时退回生成模型 + 4096 token；解析失败仍然 fail-closed。pytest `tests/test_game_moderation_route.py` 等 22 passed（05:56Z）。`oceanleo-api` 09:51Z 已被别人重启，新代码在跑，**W15 没有用 A-2 那次重启**。

## 文件

- 改：`src/shell/advanced-routes/GameRoute.tsx`、`src/shell/game-editor/GameCodeStage.tsx`（1031 → 986 行）、`src/shell/game-editor/game-draft-save.ts`（加 `gameDraftUploadKey`）、`src/i18n/ui/messages/editor-overhaul-copy-w15.ts`
- 增：`src/shell/game-editor/GamePlayPanel.tsx`、`src/shell/game-editor/GameCodeRunBar.tsx`、`tests/game-draft-upload-key.test.mjs`
- 测试改：`tests/game-core-swap.test.mjs`（remix 标签现在是 `tt("另存为二创副本")`，因为保存菜单不替动作翻译；运行条的源码断言改读 GameCodeRunBar）；`tests/W6-r2-source-lifecycle.test.mjs`（游戏那一段同样改读 GameCodeRunBar，已随父 agent 的 W11 salvage bca942c4 入库）；`tests/game-main-site-1022.test.mjs`（壳桩多暴露 `persistence`，新增 3 条）
- 场景：`evidence/W15/scenarios/{_w15-lib,game-look,game-save,game-check,game-offline,game-buttons,game-iterate}.mjs`

## 提交

oceanleo-ui：`a325213c`（父 agent 抢救：产品代码 + 词典 + 场景）、`7edd5c4c`、`485eb125`、本交付提交。oceanleo：`bb7937e`。

## 统一栏（A）

- 游戏没有文字、图片、形状选区，所以**不出任何规范 id**。父 agent 仲裁 A-1 与游戏无关。
- 编辑栏（编辑页，空态）只有：「玩法」（icon `add`，不是规范图标）+ 外壳的 AI 键，没有重复图标。
- 特有控件：运行 / 停止 / 重载 / 参数滑块。它们在 Code 页舞台内，不在编辑栏，也不借规范图标。
- 删掉：Code 页 adapter 的 `toolbox`（「运行」抽屉）。aux 页没有编辑栏，它永远打不开，内容已搬进舞台。

## 按钮点测（浏览器，验收账号，开发槽）

| 按钮 | 结果 |
|---|---|
| 编辑栏「Gameplay」 | 打开抽屉，[实测] 两档 |
| 「Update this version」（默认路由） | [实测] 10:36Z 200，约 40 秒，DB ordinal 3，版本列表出现 v2，画面换成蓝色星星（`evidence/W15/iterate-success-light.png`，之后 `after-light-code.png` 里的源码也是新版）。之后两次超过 180 秒断线，见剩余问题 1 |
| 失败提示 | [实测] 「连接中断…」显示在抽屉里；[单测] 审核拒绝 → role=alert |
| 版本列表 / ↶ ↷ | [单测] 点回 v1 → dirty → flush 写 1 个 revision → 回到已保存。真机没点成：两次第二轮迭代都超时，历史里只有一版 |
| Code「Stop」 | [实测] `data-game-preview-paused` false→true，出现停止提示 |
| Code「Run」 | [实测] paused true→false |
| Code「Reload」 | [实测] reloadKey 0→1 |
| 页签 Edit ↔ Code | [实测] 来回切换，两页都正常 |
| 保存菜单「另存为二创副本」 | 未在真机点（会多建一个条目）；单测 group save 照旧 |

## 两档截图（`evidence/W15/`）

`after-light-edit-drawer.png`、`after-light-code.png`、`after-dark-edit-drawer.png`、`after-dark-code.png`、`dark-code-stop.png`；改前基线：`baseline-light-code.png`、`baseline-dark-code.png`（可见深色中缝白线、没有运行条）。

## 保存协议（§5，Code 页，游戏 `53931dfb…`）

1. [实测] 改一处 → saving→saved（upload 200 ×2 + POST revisions 200）→ 再改一处 → saving→saved（同上）；DB ordinal 4、5。全新浏览器打开（等同刷新整页）Code 页两处标记都在（`game-check.mjs`）。改前基线：两次「已保存」只有 +1 revision，复跑时上传 409。
2. 库卡片：标题随 revision 更新。封面在 Code 保存时沿用旧封面（`cover_stale: true`，原有行为）。
3. 无法真机：没有任何可 fork 的公共游戏（05:28Z 实测，206 个平台游戏全部 retired）。[单测] 别人的作品先 fork 一次，迭代和保存都落在副本上（game-main-site-1022）。
4. [实测] 断网改动 → saving→error，从未出现 saved；恢复网络后点保存状态 → error→saving→saved，DB ordinal 6（`light-offline-error.png` / `light-offline-recovered.png`）。
5. [实测] 验收账号的 game root 始终只有 1 个；该游戏共 8 个 revision = 1 初始 + 3 次迭代落库 + 4 次 Code 保存（含断网重试）。

## 验证命令与结果

- focused（`agent-io-guard run-light … --test tests/<f>.test.mjs`）：game-core-swap 10/10、game-main-site-1022 17/17、game-draft-upload-key 4/4、game-hidden-runtime-roundtrip 3/3、W6-r2-source-lifecycle 7/7、game-code-edit-roundtrip 2/2、collab-game-readonly 5/5、game-artifact-type-contract 12/12、game-runtime-hidden 5/5、eas-w20-game-video-canvas 2/2、advanced-adapter-contract 6/6、advanced-workbench-reachability 16/16、native-editors-guard 7/7、W6-r4-remaining-families 6/6、W6-r4-source-lifecycle 7/7、game-ide-import-filename 1/1。
- `g3-portal-typed-editor` 红：`material-library-standalone.tsx` 循环依赖（W02 的文件，不是游戏）。
- i18n 闸 `i18n-tt-key-coverage`：8 pass / 2 fail。缺口清单里没有任何游戏文件；第 10 条（184 条死基线）是全波的问题，请父 agent 处理。
- `tsc --noEmit -p .`：W15 的文件 0 错。
- 浏览器：`bash harness/mint.sh | OUT_DIR=/tmp/w15-r2/<x> THEME=light|dark node harness/run.mjs evidence/W15/scenarios/<场景>.mjs`，用到 game-look、game-save、game-check、game-offline、game-buttons、game-iterate。

## 素材插入（E）

游戏没有可插入的素材类型，D8 也规定全站不提供上传和导入入口，所以不登记 material adapter。左侧「我的库」切换由外壳负责。

## 转给别人的事

- `signals/W15-to-parent.md` §2：迭代超过约 180 秒时，代理返回不带 CORS 头的超时，前端只能显示「连接中断」，服务器却照样落库；第二次那回编辑器还被关掉了（[待核] 库承载遇到外来 revision 时的行为）。另外，迭代会把作品标题改成这一轮的描述。
- 预览宿主的「正在加载游戏……」和 game 仓 runner 的报错文案都是中文、没进 i18n。它们在 oceanleo 仓（`UgcGameFrame` / `game-iteration-client.ts`），不在本册。

## 请父 agent 代改的公共文件

无。

## 如实的剩余问题

1. 迭代耗时 3–9 分钟（默认生成模型是推理模型），超过开发网关约 180 秒的限制。用户看到「连接中断」，但版本其实已经落库，见信号 §2。
2. 编辑页「点回旧版 = 存成新 revision」只有单测，没有真机。
3. §5.3（从公共素材 fork）无法真机：没有公共游戏。

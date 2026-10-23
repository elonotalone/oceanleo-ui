# W01 交付：顶栏一行 + `···` 菜单 + 页签进顶栏 + 主题跟随站点（D1 D7）

2026-10-23，R2 接班收口。代码与测试主体是第 1 轮（含父 agent salvage）做的，R2 没有重做，只补了浏览器两档验收，和验收里发现的一处缺陷（门户没有 toast，分享 / 收藏点了看不见反馈）。

## 1. 用户看得到的变化

- 每个编辑器顶部只有**一行**，高 44px：`←` ｜ 素材库 · 我的库 ｜ 页签 ……… `↶ ↷` ｜ 协同头像与锁 ｜ 保存状态 ｜ `···` ｜ 全屏 ｜ `×`。原来的第二行页签行整行删掉了。
- 页签只在多模式编辑器上出现：PDF 和表格是「编辑 | 专业编辑」（英文界面为 Edit | Pro edit），游戏是「编辑 | Code」。演示、视频这类单模式编辑器不画页签。
- `···` 菜单的顺序是：邀请一起改、生成回放（只在有协同时出现）、分享、收藏 / 取消收藏、下载 ▸（子菜单列出各格式，默认格式标「默认」）。每项都有图标和文字，键盘可用（方向键移动，Esc 关闭，→ / ← 开关子菜单）。
- 没有主题按钮了。编辑器的明暗一直跟着网站当前主题：站点是 auto 时按系统解析，切换后编辑器当场跟着变，不用刷新。
- 保存状态槽一直显示。recovery 没就绪时也在，这时如实显示「尚未确认保存」，不会显示「已保存」。
- **R2 新增**：门户页面上此刻没有任何 toast 在渲染（实测如此，见 §7）。这时 `···` 会把同一句反馈画在按钮旁边，约 2.4 秒后消失，比如「已复制」「已加入收藏」「已取消收藏」。错误会一直留着，用红色显示。页面上有 toast 时，这个兜底自动让位，只留给读屏用，不会重复显示。

## 2. 文件清单

- **增**：`src/shell/plugin-chrome/PluginMoreMenu.tsx`、`PluginPageTabs.tsx`、`more-menu-registry.ts`；测试 `tests/plugin-more-menu.test.mjs`、`tests/plugin-theme-follows-site.test.mjs`；场景 `evidence/W01/scenarios/{accept,chrome,upload}.mjs`。
- **删**：`src/shell/plugin-chrome/PluginPageRow.tsx`。
- **改**：`AdvancedWorkspaceActionBar.tsx`、`InlineAdvancedWorkbenchHeader.tsx`、`plugin-chrome/{PluginGlobalRow,PluginChromeFrame,plugin-pages,types,tokens}.ts(x)`、`editor-item-social-chrome.tsx`、`workspace-download-icon-button.ts`、`collab/{CollabActionSlot,CollabActionSlotInner,CollabInviteButton}.tsx`、`replay/work/GenerateReplayButton.tsx`、`plugin-theme.tsx`、`advanced-workbench-chrome.ts`，以及文案册 `src/i18n/ui/messages/editor-overhaul-copy-w01.ts`（16 语）。
- 测试改动（断言新行为）共 25 份：advanced-adapter-contract、advanced-canva-interactions、advanced-editor-v7、advanced-editor-v8-shared-edit-bar（三处，见 `signals/W01-to-W03.md`）、d1-r4-pending-save-state、d4-inline-shell-page-feedback、eas-w16-static-plugin-pages、editor-core-flags-and-mode、editor-repair-20261021-acceptance-download、editor-repair-acceptance-chrome、editor-repair-acceptance-social、game-code-edit-roundtrip、one-task-library-image-runtime、plugin-chrome-agent-drawer、plugin-chrome-frame-host、plugin-chrome-global-row-allowlist、plugin-chrome-page-row、plugin-chrome-save-menu、plugin-theme-registry、rebuild-global-history、tpp-w1-page-layers、W3-editor-chrome-library-share-favorite、W4-20261021-download-icon。

## 3. 提交号

R2 的提交：
- `a6a24b19`：门户没有 toast 时，`···` 把反馈画在按钮旁；附回归断言和 R2 场景。
- `e2a26735`：反馈的颜色改走兜底链（顶栏被 portal 出 `--awb-*` 作用域后颜色会丢）；给 W07、W08、W10 的信号；场景加固。
- `ac252bee`：两档截图、运行日志，以及给父 agent 的信号。
- 本交付文件的提交（与 state / journal 同一提交）。

R1 的提交：`de605de5` `cbc07b39` `c4ae71f9` `5906d9f1`（三个 salvage 由父 agent 提交）、`565a1565` `71a956e5` `e7c534bc` `a4c1b36e` `97d4e10e` `4931fbe4` `21bf39d3` `31e64fb0` `4d105440` `f00b071e` `0ccc8d8d` `1db78336` `3149f811` `d1989564`。

## 4. 验证

### focused tests（`agent-io-guard.sh run-light -- node … --test tests/<f>.test.mjs`）

R2 跑过的：
- W3-editor-chrome-library-share-favorite：11/11（R2 新断言：没有 toast 时 `[data-more-menu-feedback="notice"]` 显示「已复制」；页面上有 `[data-leo-toast-viewport]` 时不出现。去掉 `MoreMenuFeedback` 会变红）。
- plugin-more-menu 5/5、plugin-chrome-frame-host 5/5、editor-repair-acceptance-social 2/2、plugin-chrome-global-row-allowlist 2/2、advanced-editor-v7 9/9、advanced-adapter-contract 6/6、one-task-library-image-runtime 1/1。
- i18n-tt-key-coverage：7 过 3 红，红项里没有一个是 W01 的文件（是 messages/**、website-local/**、AudioTranscriptSection 等别人的文件）。

R1 的全部结果见 journal（W01 相关 60 份测试里，属于 W01 这片的全绿；仍红的那些开工前就红，或不归 W01，逐条列在 journal 里）。

### 类型检查

`agent-io-guard.sh run-heavy -- npx tsc --noEmit -p .` R2 跑了两次。两次都只有 W16 `workflow-carrier/video-project-doc.ts` 的 3 个已知错误，W01 文件 0 错。

### 浏览器（验收账号，开发槽，生产域名一律 abort）

命令：
```
bash harness/mint.sh | OUT_DIR=/tmp/w01/r2-<theme> THEME=<light|dark> node harness/run.mjs evidence/W01/scenarios/accept.mjs \
  pdf=6334d8f0-…:write grid=39c6a3c8-…:write deck=fa40a165-…:write game=53931dfb-… video=16cfec58-… website=6b16c807-… --live-theme
```
写操作（下载、分享、收藏）只对 W01 自己上传的三件做。游戏（W15 的）和视频（W11 的）只看不写，邀请和回放只打开窗口再关掉，不发送、不生成。日志在 `evidence/W01/logs/{r2-light,r2-light2,r2-dark}.log`。

| 编辑器 | 一行 / 无页签行 / 无主题键 | 页签与往返 | `···` 各项 | 跟随主题（light / dark） |
|---|---|---|---|---|
| PDF | ✔ 槽位 back library pages history collab save-state more maximize close | Edit* ↔ Pro edit，往返都选中，切页后仍是一行 | 邀请：弹窗 ✔；回放：面板 ✔；分享：剪贴板 = `…/library?item=6334d8f0…`，按钮旁显示「Copied」✔；收藏：false→true（light）、true→false（dark），按钮旁显示「Added to / Removed from favorites」，菜单文字跟着翻转，数据库 `artifact_favorites` 里有这一行 ✔；下载：拿到文件 `[W01] sample.pdf` ✔ | ✔ / ✔；站点设为 auto 后切系统明暗：html 与编辑器同步 dark↔light，不刷新 ✔ |
| 表格 | ✔ | Edit* ↔ Pro edit ✔ | 邀请 ✔、回放 ✔、分享 ✔、收藏 false→true ✔（dark 那次服务器回「素材请求超时」，按钮旁如实显示红字错误，状态没翻，也没假成功）、下载 `[W01] sample.xlsx.xlsx` ✔（文件名重复扩展名，转 W10） | ✔ / ✔ |
| 演示 | ✔（单模式，不画页签） | — | 邀请 ✔、回放 ✔、分享 ✔、收藏 false→true→false ✔、下载 `[W01] sample.pptx.pptx` ✔（扩展名转 W07） | ✔ / ✔ |
| 游戏 | ✔ | Edit* ↔ Code ✔ | 只有分享和收藏（没有协同、没有下载动作，所以不出这些项）；只看不点 | ✔ / ✔ |
| 视频 | ✔（单模式） | — | light：邀请弹窗 ✔、回放面板 ✔，分享、收藏、下载都在（重跑 `logs/r2-video-light.log`）；dark 那次协同块还没加载完，只有分享、收藏、下载。两格式在素材没加载完时 disabled（`sourceReady`，W11 的路由逻辑）。分享、收藏、下载只看不点 | ✔ / ✔（浅色站点下视频编辑器是浅色） |
| 网站 | ✔（开发槽 09:58Z 恢复后重跑，`logs/r2-web-{light,dark}.log`） | Edit* ↔ Pro edit ✔ | 只有分享和收藏（平台公共件，没有协同、没有下载动作）；只看不点 | ✔ / ✔ |

截图（`evidence/W01/`）：
- `light/`：`light-pdf-01-header`、`light-pdf-04-download-menu`、`light-pdf-05-share`（按钮旁的「Copied」）、`light-pdf-07-invite`、`light-pdf-08-auto-dark`（auto 切暗，整页连编辑器一起变暗）、`light-grid-02-tab-pro`、`light-deck-04-download-menu`、`light-game-02-tab-code`、`light-video-01-header`。
- 网站：`light/light-website-02-tab-pro`、`dark/dark-website-01-header`。
- `dark/`：`dark-pdf-01-header`、`dark-pdf-07-replay`、`dark-pdf-08-auto-light`、`dark-grid-06-favorite-feedback`（错误反馈）、`dark-deck-03-more`、`dark-game-02-tab-code`、`dark-video-03-more`。
- 其余截图只留在 `/tmp/w01/r2-{light,light2,dark}/`，没有提交。
- 两档下 `···` 菜单、子菜单、邀请弹窗、回放面板都跟着主题走，没有浅色岛。dark 下邀请弹窗与回放面板是深底；light 下菜单是白底、浅色站点。

## 5. 保存协议

W01 不是编辑器 owner，只负责顶栏的保存状态槽。六件编辑器在两档下都有 `[data-global-row-slot="save-state"]`。实测看到的状态有 saved、unconfirmed（PDF 首开、视频、表格 dark）和 error（表格 dark 那次超时：红色云朵）。没有出现在服务器确认之前就显示「已保存」的情况。各编辑器的 §5 逐条由各 owner 和 V02 判。

## 6. 删掉的测试和原因（都换成了断言新行为的用例）

- `plugin global row renders undo and redo ahead of save/download/share/favorite`：下载、分享、收藏已经不在第一行，改成「undo/redo 排在 save-state 和 ··· 之前」。
- `共用顶栏第二行：只有 grid / pdf / website 有专业编辑页；第一行不再挂开关`：第二行没了，改成「共用顶栏一行：只有 grid / pdf / website 有专业编辑页签；不再挂开关」。
- `未就绪四个页签按钮 disabled + aria-disabled，点击不切页`：灰按钮违反红线 7，改成「aria-disabled、不是灰按钮，点击不切页而是说出原因」。
- `页签行单行契约：固定 36px…`：页签行删了，改成「页签进第一行：没有第二行，排在库按钮之后，单行不裁」，另加「单模式编辑器第一行不画页签」。
- `既没有 save 组也没有持久化时，保存槽只是状态，不弹菜单`：改成「不画保存槽（不说假的已保存）」。
- `D1 R4: before the draft receipt, the shared header does not claim saved or expose saving`：槽现在一直在，改成「槽在，但绝不说已保存」。
- plugin-theme-registry 里断言本命默认、localStorage、`PluginThemeToggle` 的部分：这些行为按 D7 删掉了，改由 `plugin-theme-follows-site.test.mjs` 断言跟随站点。

## 7. 转给别人的事

- **W07**（`signals/W01-to-W07.md`）：演示的下载子菜单在英文界面下全是中文。`DeckRoute.tsx:422` 用模板串拼标签，菜单里的 `tt()` 查不到键。另外默认格式下载的文件名是 `.pptx.pptx`。
- **W08**（`signals/W01-to-W08.md`）：`RichDocRoute.tsx` 有同样的模板串拼标签。
- **W10**（`signals/W01-to-W10.md`）：表格格式名 `{fmt}` 没过 `tt()`，界面上是「Download Excel 工作簿 (.xlsx) directly」。文件名是 `.xlsx.xlsx`。
- **W11**（读码，没写信号）：视频格式名「MP4 视频 (.mp4)」在英文界面没翻译，同类问题。
- **W03**：R1 已写 `signals/W01-to-W03.md`。

## 8. 请父 agent 代改

1. **门户挂 toast（这个问题影响全门户，不只是 W01）**：`oceanleo/app/layout.tsx` 只挂了 sonner 的 `<Toaster>`，没有挂 `@oceanleo/ui` 的 `<ToastViewport />`，也没有调 `registerToastHost()`。结果所有 `useToast()` 都被静默丢掉。实测控制台警告「toast 已入队，但没有任何 <ToastProvider> / <ToastViewport> 在渲染它」。请挂一次 `<ToastViewport />`，或者用 `registerToastHost` 桥到 sonner。挂上之后 W01 的兜底会自动让位。
2. **`artifact-client.ts:802`** 的「素材请求超时，请重试。」不在任何语种册里，英文界面会直接显示中文（W01 的 `···` 旁实测如此）。请让它的 owner 补 `tt()` 和译文。
3. **oceandino `tests/plugin-chrome-adoption.test.mjs`**（W01 只读跑过：9 过 2 红）：
   - #5「网站两档 accent 与统一表一致」是 W01 造成的。表改成了单行（`website: { accent: { light, dark } }`），`defaultTheme` 按 D7 删掉了。改法：取表项的正则改成 `/\n {2}website: \{([^\n]*)\},/`（或同时兼容多行）；删掉 `table.default` 和 `assert.equal(table.default, "dark")`，换成 `assert.doesNotMatch(specs, /defaultTheme/)`，并断言没有 `oceanleo.plugin-theme.` 这个 localStorage key。
   - #8「13 件插件」：表在 W01 开工前就只有 11 件，与 W01 无关。
4. **规范文档**（oceandino `docs/architecture/`）：
   - `oceanleo-plugin-chrome-pages-spec.md`：
     - §0 / §1 的「第一行 + 第二行」改成「一行」。
     - §2 槽表改成 `back` `library` `pages` `history` `save-state` `collab` `more` `maximize` `close`。`download` / `share` / `favorite` 写成 `more` 里的项（附顺序：登记项 → 分享 → 收藏 → 下载 ▸），`theme` 删掉。
     - §3「第二行（页面行）契约」改成「第一行页签（`PluginPageTabs`，在 library 之后，只有一页时不渲染，未就绪时 aria-disabled 并说出原因）」，删掉 `PluginPageRow` 36px 那一条。
     - §3 编辑栏停靠改成「顶栏下 8px」。
     - 补一条：save-state 槽一直显示。
   - `oceanleo-plugin-theme-contract.md`：v1 的「不跟随站点 / localStorage / 本命默认 / 插件内切换器」整段作废，按 D7 改成「编辑器明暗只跟随站点外观：读 ThemeProvider，没有 Provider 时读 `<html>` 主题类并用 MutationObserver 跟随；auto 按系统解析；没有切换器、没有 localStorage」。`PLUGIN_THEME_SPECS` 只保留 accent。
5. 公共出口：R1 已经确认 `public-api.snapshot.json` 里 `PluginThemeToggle / setPluginTheme / pluginThemeStorageKey` 这几个已删的导出需要父 agent 改快照（consumer 快照里没有消费方）。R2 没有新增出口。

## 9. 如实的剩余问题

- 开发槽在 09:4x–09:58Z 不通（父 agent 已确认是预览会话代理泄漏连接，已修好）。这段时间失败的网站和视频场景，恢复后都已重跑通过。
- 网站舞台在截图时还停在「正在读取远程网站工程。」：这句是中文，没翻译，且加载较慢。归 W14，不是顶栏的问题。
- 收藏 PUT 在开发槽上要 3–6 秒才回，期间按钮只有 `aria-busy`，没有可见的「进行中」。结果回来后，按钮旁的反馈和菜单文字都会翻。
- 页签切换只核了「选中状态 + 仍是一行 + 主题对」，没有逐件核专业编辑页的内容（那是各编辑器 owner 的）。

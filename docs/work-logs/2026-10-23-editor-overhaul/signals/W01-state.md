# W01 state（接班文件）

更新：2026-10-23 开工

## 已确认的事实

- [实测] bootstrap 通过；oceanleo-ui 在 `main`，开工时工作区只有别人的 `signals/W0x-state.md` 未跟踪。
- [读码] 第一行 = `AdvancedWorkspaceActionBar.tsx`（`PluginGlobalRow` 包一层）；第二行页签 = `PluginPageRow.tsx`；装配在 `InlineAdvancedWorkbenchHeader.tsx`。
- [读码] save-state 槽在 `adapter.persistence?.recovery?.ready === false` 时整个不渲染（AdvancedWorkspaceActionBar.tsx:215）。
- [读码] 主题：`plugin-theme.tsx` 每插件本命默认 + localStorage `oceanleo.plugin-theme.<id>` + `PluginThemeToggle`；消费者 = InlineAdvancedWorkbenchShell(W02)、anchored-popover(父)、PluginChromeFrame(我)。`setTheme/toggle` 在 src 内无人用。
- [读码] `./shell/plugin-theme` 是 package 子路径出口；`public-api.snapshot.json` 登记了 `PluginThemeToggle / setPluginTheme / pluginThemeStorageKey`；consumer-imports 快照里 36 个消费站没有一个 import `@oceanleo/ui/shell/plugin-theme` 或 `plugin-chrome`。删出口需父 agent 改快照。
- [读码] `useTheme()` 无 Provider 时回落 `resolved: "light"`，分不出「有 Provider 且 light」与「无 Provider」；ThemeProvider.tsx 不归我。站点 `applyClass` 同步写 html class，ThemeScript 首帧写 html class。
- [读码] 59 个测试文件引用我这片代码/选择器（清单 `/tmp/w01-tests.txt` 的生成命令见下）。

## R2（08:58Z 接班）

- [实测] 代码、测试、tsc 已在 main（见 journal）；不重做。
- [实测] 上一轮浏览器 `chrome.mjs` 全部 NO HEADER：`/library?item=` 只开到详情预览，需点铅笔（编辑「…」）才进编辑器。
- 正在做：`evidence/W01/scenarios/accept.mjs`（铅笔进编辑器 → 顶栏报告 → 页签往返 → `···` 每项：分享/收藏/下载/邀请/回放 → 站点 auto+系统切暗跟随），light / dark 各一遍。
- 素材：[W01] pdf 6334d8f0…、xlsx 39c6a3c8…、pptx fa40a165…（写操作只对这三件）；只看：游戏 53931dfb…(W15)、视频 16cfec58…(W11)、网站 6b16c807…(平台公共)。
- 下一步：写 `verdicts/W01-delivery.md` 并提交。

## 正在做（06:0xZ 恢复后，已完成）

- 新文件已在 main（cbc07b39 salvage）：plugin-chrome/{PluginMoreMenu,PluginPageTabs,more-menu-registry}。
- 改动暂存于 `/tmp/w01/stage/src/...`（overlay tsc 0 错：`node /tmp/w01/scripts/overlay-tsc.mjs /tmp/w01/stage`），正在整批落盘：
  ActionBar 一行化、Header 删第二行与 tools 注册、GlobalRow 透传页签、social 改 hook、collab 邀请/回放进 `···`、PluginChromeFrame 去主题键走 `···`、tokens 接受 null 主题、GLOBAL_ROW_SLOTS 新表。

## 下一步

1. 落盘后删 PluginPageRow.tsx；plugin-theme.tsx 跟随站点（删 toggle / localStorage / defaultTheme）。
2. W01 文案册；改测试；tsc；浏览器验收 light/dark。
3. 信号给 W03（readPluginChromeRowsBottom 不再有 page-row）。

## 复现命令
```bash
cd /root/projects/oceanleo-ui
grep -lE "AdvancedWorkspaceActionBar|PluginPageRow|data-plugin-page-row|GLOBAL_ROW_SLOTS|PluginThemeToggle|plugin-theme-toggle|defaultTheme" tests/*.mjs
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<file>.test.mjs
```

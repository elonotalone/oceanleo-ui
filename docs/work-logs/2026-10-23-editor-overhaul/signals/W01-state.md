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

## 正在做

- 读测试与周边（anchored-popover、ui/Button、AdvancedEditorIcon 图标名），设计 `···` 菜单与一行顶栏。

## 下一步

1. 写 `plugin-chrome/PluginMoreMenu.tsx`（`···`）+ 邀请/回放的菜单项形态。
2. 改 `AdvancedWorkspaceActionBar` 一行化、页签进第一行、save-state 恒在。
3. `InlineAdvancedWorkbenchHeader` 删 PageRow 行与 tools 注册。
4. `plugin-theme.tsx` 跟随站点。
5. `PluginChromeFrame` 去主题键、走 `···`。
6. 文案册、测试、类型检查、浏览器验收。

## 复现命令

```bash
cd /root/projects/oceanleo-ui
grep -lE "AdvancedWorkspaceActionBar|PluginPageRow|data-plugin-page-row|GLOBAL_ROW_SLOTS|PluginThemeToggle|plugin-theme-toggle|defaultTheme" tests/*.mjs
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<file>.test.mjs
```

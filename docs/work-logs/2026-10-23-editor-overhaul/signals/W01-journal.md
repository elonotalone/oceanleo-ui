# W01 journal（每条实测结论一行）

- 2026-10-23 开工：bootstrap OK；`main` 干净（仅别人的 state 未跟踪）。
- [实测] 基线：58 份相关测试里 9 份开工前就红（e2-result-canvas-stability / e2-right-pane-claims / eas-w13-right-maximize 因 anchored-popover 桩缺 `runAfterOverlayExit`；W3-r3 因 material-library-standalone 循环依赖；focus-ring / hit-target / i18n / lightweight-office / motion-token 是全仓棘轮），日志 `/tmp/w01/baseline/`。
- [实测] i18n 闸基线里属于我文件的缺口：「关闭右侧面板」（AdvancedWorkspaceActionBar / PluginChromeFrame）、「松开以停靠编辑栏」（PluginChromeFrame）16 语全缺，W01 册补。
- 父 agent 通知 05:09–05:25Z 开发槽代理连接池满；W01 此前未跑浏览器，无需重跑。

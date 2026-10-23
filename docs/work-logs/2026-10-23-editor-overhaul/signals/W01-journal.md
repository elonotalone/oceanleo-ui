# W01 journal（每条实测结论一行）

- 2026-10-23 开工：bootstrap OK；`main` 干净（仅别人的 state 未跟踪）。
- [实测] 基线：58 份相关测试里 9 份开工前就红（e2-result-canvas-stability / e2-right-pane-claims / eas-w13-right-maximize 因 anchored-popover 桩缺 `runAfterOverlayExit`；W3-r3 因 material-library-standalone 循环依赖；focus-ring / hit-target / i18n / lightweight-office / motion-token 是全仓棘轮），日志 `/tmp/w01/baseline/`。
- [实测] i18n 闸基线里属于我文件的缺口：「关闭右侧面板」（AdvancedWorkspaceActionBar / PluginChromeFrame）、「松开以停靠编辑栏」（PluginChromeFrame）16 语全缺，W01 册补。
- 父 agent 通知 05:09–05:25Z 开发槽代理连接池满；W01 此前未跑浏览器，无需重跑。
- [实测] 恢复后 overlay tsc：W01 文件 0 错；全仓仅 W16 video-project-doc.ts 3 个已知错。plugin-theme 跟随站点、PluginPageRow 删除已在 main（salvage 5906d9f1/c4ae71f9）。
- [实测] 测试改完：W01 相关 60 份里我这片全绿；仍红的都不是 W01（W09 image：canva-interactions#3 / v7#2；W06 删 mode-switch-gate；advanced-workbench#8 saveBeforeNewConversation；e2-* / eas-w13 / W3-r3 开工前就红；四个全仓棘轮无 W01 文件）。日志 `/tmp/w01/after2/`。
- [实测] `npx tsc --noEmit -p .`：仅 W16 video-project-doc.ts 3 错（已知）。
- R2 [实测] 上一轮 `chrome.mjs` 全 NO HEADER 的原因：`/library?item=` 只到详情预览，须点铅笔「Edit “…”」。新场景 `evidence/W01/scenarios/accept.mjs` 先点铅笔。
- R2 [实测] 门户页面没有任何 toast 在渲染（控制台：`toast 已入队，但没有任何 <ToastProvider> / <ToastViewport> 在渲染它`；DOM 无 `[data-leo-toast-viewport]`）：分享复制成功、收藏成功都看不见反馈。W01 修：`···` 在页面没有 toast 时把同一句话画在按钮旁（`[data-more-menu-feedback]`），有 toast 时退回读屏。根因（门户没挂 ToastViewport / 没 registerToastHost）写进交付请父 agent 代改。
- R2 [实测] 收藏 PUT 在开发槽上要 3–6 秒才回；之前 2.5 秒就读状态，误判为没翻。结果正确：`/v1/library/favorites` 前后对得上。
- R2 [实测] tsc：仅 W16 video-project-doc.ts 3 错（已知）；W3-editor-chrome-library-share-favorite 11/11、editor-repair-acceptance-social 2/2、plugin-chrome-frame-host 5/5、advanced-editor-v7 9/9、advanced-adapter-contract 6/6、one-task-library-image-runtime 1/1。
- R2 [实测] oceandino `tests/plugin-chrome-adoption.test.mjs`（只读跑）：#5 网站 accent 因 W01 删 defaultTheme、表改单行而红（改法写交付）；#8「13 件」开工前就是 11 件，非 W01。

# ED-B5c 视频画布子任务

你负责 `/root/wt/ED-B5c-oceanleo-ui` 的 `wt/ED-B5c`，与时间线子任务并行，共享文件系统。
先读 `/opt/cursor-workspaces/oceandino/AGENTS.md`，执行 bootstrap，读 operator-rulings.md 最新 Convergence 裁定及 oceanleo/parallel-rollout/deploy packs。当前任务显式授权 worktree 分支，绝不改 `/root/projects/*`、绝不 push、绝不开分支、不开浏览器、不构建安装原生客户端、不打印密钥。

只允许改以下产品文件：
- src/shell/video-canvas/engine/canvas-selection-adapter.ts
- src/shell/video-canvas/engine/command-registry.ts
- src/shell/video-canvas/engine/CanvasProductViews.tsx
- src/shell/video-canvas/engine/CanvasCreateMenu.tsx
可新增 tests/ed-b5c-canvas-parity.test.mjs（独占），报告 docs/work-logs/2026-11-16-ed-b5c/out/canvas.md。不要改共享 canon、project-model.ts、其他 tests。父进程负责集成及全量门禁。

目标：文字/script/subtitle 节点声明真实生效的文字组能力；图片补齐其余真实可用能力；文字/音频在创建菜单及栏上可达；Director 镜头计划合并 Storyboard 卡片；History 提供恢复到版本，真实写回 project.versions/head。尊重不可变历史、revision/selectionEpoch、只读、既有保存合同；避免只在 UI 多按钮。

先追踪真实合成/保存/重开链（project-model.ts 可读不可改）。后端 convert/timeline.py 目前 drawtext 只读 font_size/color/background/x/y/align/bold；不能随意声称新文字样式已进入导出。能在允许文件内接通则完成，否则 adapter 不报该能力并在报告列明引擎缺口与准确跨界文件。
参考：/root/projects/oceandino/docs/work-logs/2026-11-15-editor-audit/30-ED-TOOLBAR-report.md §A/G，10-ED-BUGS-report.md §8；ED-B2 报告 /root/projects/oceandino/docs/work-logs/2026-11-16-convergence-wave2/out/ED-B2-report.md。字号/行距/字距外部 px，透明度百分数。

每新增能力测试 parity + 保存重开往返；使用真实引擎命令/生成合同，不写镜像实现测试。通过 agent-io-guard.sh run-light 执行专项，重任务 run-heavy。不要运行全量/typecheck（父进程运行）。只 stage 自己文件，中文 commit；有疑问及时发父进程，至少每分钟回报。最终报告含改动 file:line、测试命令与结果、引擎缺口及未做。

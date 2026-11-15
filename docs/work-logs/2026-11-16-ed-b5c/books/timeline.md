# ED-B5c 视频时间线子任务

你负责 `/root/wt/ED-B5c-oceanleo-ui` 的 `wt/ED-B5c`，与画布子任务并行，共享文件系统。
先读 `/opt/cursor-workspaces/oceandino/AGENTS.md`，执行 bootstrap，读 operator-rulings.md 最新 Convergence 裁定及 oceanleo/parallel-rollout/deploy packs。当前任务显式授权 worktree 分支，绝不改 `/root/projects/*`、绝不 push、绝不开分支、不开浏览器、不构建安装原生客户端、不打印密钥。

只允许改产品文件：
- src/shell/video-editor/video-edit-bar.ts
- src/shell/video-editor/types.ts
- src/shell/video-editor/timeline-model.ts
- src/shell/video-editor/VideoTimelineStage.tsx
- src/shell/video-editor/use-video-timeline-selection-adapter.ts
可新增 tests/ed-b5c-timeline-parity.test.mjs（独占），报告 docs/work-logs/2026-11-16-ed-b5c/out/timeline.md。不要改其他文件/共享 canon/后端。父进程负责集成及全量门禁。

目标：时间线文字 font-family/italic/underline/strike/list/line-height/link/letter-spacing/case/indent/clear-format/justify；贴图 replace/crop/radius/border/adjust/image-fit。每项必须预览/保存/重开/导出正确，不加空按钮；不能支持的 adapter 不报 id，并在报告引擎缺口表列明。
重要已查事实：预览实现是 preview-engine.ts（不在允许修改列表）；后端 /root/projects/oceanleo/convert/timeline.py 的 drawtext 目前只读 font_size/color/background/x/y/align/bold，图片路径目前支持翻转/旋转/透明度。这些文件只读不可改。请首先判断在允许文件内可真实实现什么；优先安全完成 clear-format、可转为文本的大小写/列表/缩进、replace 等完整能力；其余扩展模型字段只能在不谎报 adapter 的条件下进行。若实质链路全部要求越界，报告父进程准确边界，避免做虚假样式落地。不要将有损文字变换当保真格式而不说明。

参考：/root/projects/oceandino/docs/work-logs/2026-11-15-editor-audit/30-ED-TOOLBAR-report.md §A/G；ED-B2 报告 /root/projects/oceandino/docs/work-logs/2026-11-16-convergence-wave2/out/ED-B2-report.md。字号/行距/字距外部 px，透明度百分数。
每新增项测试 parity + 真模型保存重开往返/渲染合同。使用真实命令与 normalize。通过 agent-io-guard.sh run-light 执行专项，重任务 run-heavy。不要跑全量/typecheck（父进程负责）。只 stage 自己文件，中文 commit；至少每分钟回报进度。最终报告含 file:line、测试结果、引擎缺口与未做。

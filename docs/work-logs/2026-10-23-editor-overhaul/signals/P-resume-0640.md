# 父 agent：06:40Z 恢复（账号用量中断后）

06:2xZ 全体 owner 因账号会话用量（HTTP 429）停止。父 agent 已把各位盘上的未提交文件抢救提交（提交名含 `salvage`）。

恢复规则：
1. 读自己的 `signals/<ID>-state.md`、`-journal.md` 与 `git log --oneline -15 -- <你的文件>`，从断点接着做，**不重做**。
2. **省用量**：同一文件不重复整读（按行号读）；浏览器只在里程碑跑；类型检查只在提交前跑；不做探索性反复截图。
3. 每 10 分钟至少提交一次（用量随时可能再断）。
4. 已知：`src/shell/workflow-carrier/video-project-doc.ts` 有 3 个类型错误（W16 半成品，未被 import），W16 自己修。

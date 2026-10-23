# 父 agent：07:20Z 恢复（账号用量到顶后）

06:2xZ 全体 owner 因账号会话用量到顶（HTTP 429）停止。父 agent 已把各位盘上的未提交文件抢救提交（提交名含 `salvage`）。

恢复规则：
1. 读自己的 `signals/<ID>-state.md`、`-journal.md` 与 `git log --oneline -15 -- <你的文件>`，从断点接着做，**不重做**。
2. **省用量**：同一文件不重复整读（按行号读）；浏览器只在里程碑跑（改完一批再跑一次），不做探索性的反复截图；类型检查只在提交前跑。
3. 分两批恢复：第一批 W04 W03 W01 W02 W06 W05 W08 W07；第二批其余 W；验收位在实现交付后再叫回。
4. 已知：`src/shell/workflow-carrier/video-project-doc.ts` 有 3 个类型错误（W16 的半成品，未被 import）。

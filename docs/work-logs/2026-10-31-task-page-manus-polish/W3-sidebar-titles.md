# W3 — 左侧 My Tasks 仿 Manus + 所有任务自动总结标题

先读 `00-dispatch.md` 红线。看图：`/root/oceanleo-inbox/20261031T083951Z-粘贴图片-20261031163950.png`（Manus 目标样式）、`/root/oceanleo-inbox/20261031T084035Z-粘贴图片-20261031164034.png` 和 `…092522Z…`（我们现在的样子）。

## 负责
- 前端（oceanleo-ui）：`src/shell/HistoryMasterDetail.tsx` 的左侧任务列表部分（行渲染、选中态、分组头）、`src/shell/history-model.ts`、左侧导航里 "My Tasks" 可折叠分组所在的文件（自己找：`WorkspaceSession.tsx` / 主站侧栏 / `nav-source`；若在主站 `/root/projects/oceanleo/app/**`，那部分也归你）。`HistoryMasterDetail.tsx` 右侧详情区/头部/加载归 W5。
- 后端（oceanleo）：任务标题生成（`agent_tasks.title`，Leo 云端任务 + 电脑任务；电脑任务已有 `computer_task_sessions.auto_title_pending/auto_title_seed` 字段，找到现有标题链路再改）。

## 要做（前端）
1. 任务行默认**不显示时间**（现在每行第二行是 `10/31 16:24 · home-agent`，删掉这一行）。
2. 任务名字号大一些（对照 Manus 图，和我们侧栏其它主导航项同级或略小一点；单行省略号截断）。行高、内边距仿 Manus。
3. 左侧不应有竖线（现在 My Tasks 下的任务列表左边有一条竖线/缩进线），删掉。
4. 选中任务：对应任务行显示**灰色**圆角底（项目现有中性灰 token，接近 Manus 的浅灰），不要蓝底白字。悬停：更浅的灰。"My Tasks" 分组头本身**永远不显示灰底**（现在选中某个任务时 My Tasks 头是灰的）。
5. 悬停任务 → 弹出新"气泡"（浮层，仿 Manus：白底、细边、阴影、圆角），内容 = 完整任务名（可换行）+ 时间（右侧或下方，用户本地时区，今天显示时间，其他日期显示 "Oct 20" 这种短日期，按语言本地化）。气泡要贴着行右侧出现，不被侧栏裁掉（portal 到 body），悬停延迟 ~300 ms，移开即收。键盘焦点也能出现。
6. 上一批 C 加的"在干活"动效（`SessionRunningIcon` 小人，任务名左侧 12px 槽）保留，选中灰底上颜色要可见（不再是白色）。"…"更多按钮保留（悬停/选中才显示）。
7. 若任务行有图标需求：Manus 每行有类型图标；我们是否加由你判断，若加，用现有图标体系表达任务类型（云端 Leo / 电脑程序 Claude Code、Codex 等），不要引入新视觉体系。

## 要做（标题）
1. **所有任务默认自动总结标题**：用户自己电脑上的（Claude Code / Codex / Hermes / Cursor / Terminal 对话）+ 我们云端的 Leo 任务。现在一大片 "hi"、"elon · codex"、"elon · Terminal"、"https://oceanbizs.com/history?task=…"。
2. 规则建议：第一轮用户输入 + agent 回复后生成简短标题（中文对话用中文，≤ 20 字；英文 ≤ 6 词，参考 Manus "Greeting"/"如何将svg文件转换为png"）；首条输入信息量太低（如 "hi"）时，等到出现有意义的内容再生成或在后续轮次更新一次；用户手动改过名的永远不覆盖（找现有重命名字段/标志）。用现有的便宜模型调用通道（找现有标题生成或 `auto_title` 代码），走现有计费/不计费规则。
3. 已有任务：列表拉取时对可见的、未总结的任务懒补（排队、限速、只补本用户的），不要写一次性全库批处理。
4. 共享库规则：只碰本 `gateway_instance` 能处理的行（参考 `backend/app/background_workers.py` 与 `migrations/0308_gateway_instance_ownership.sql`）或按请求用户懒补（请求路径天然只碰自己的行）。迁移只加不删，不执行。

## 验证
- 前端：相关测试（`tests/history-model.test.mjs`、`history-working-mark`、`history-*`、`sko-w11-history-projects`、`project-history-scope` 等）改成锁定新行为 + 新测试（无时间行、选中灰底类名、分组头无高亮、悬停气泡含完整名和时间、无竖线）。
- 后端：标题生成单测（低信息首句延后、手改不覆盖、电脑任务也生成）。

## 结果
（完成后追加）

# W10 state（项目页布局大改）

更新：2026-10-23 开工

## 已确认的事实
- 共享 `ProjectWorkspaceFrame`（src/shell/project-workspace.tsx）只有门户 ProjectWorkspace 一个消费方；导出名由 public-api.snapshot 记录，只记名字不记 props，所以只能给现有导出加可选 props，不能新增导出（src/shell/index.ts 不许改）。
- hit-target-budget.test：project-workspace.tsx 登记 2 处写死 <44px 的交互元素（抽屉关闭、弹窗关闭），不许再加写死 h-N 的按钮。
- 共享 Modal 走 portal 到 body、z-[1000]，打开态面板无 transform，所以嵌在里面的 fixed 对话框（计划页 TodoEditor 等）不被裁。
- 资产列表接口只返回根目录一层（folder 在前）+ usage；待办接口一次最多 100 条（含状态），计数在前端数。
- 门户测试 project-workspace-feed-tasks.test.mjs 把四个页签、config={configPanel}、bottom 等写死，布局改后需小范围精确替换（只改我负责的断言；任务页签那几条归 W11）。

## 正在做
- 读完全部上下文，准备跑基线测试。

## 下一步
1. 跑基线（primitives / i18n gate / hit-target / 门户 project-* 测试）。
2. 改共享框架：bottom 只占主列、plain 去白底、抽屉 Escape 让位于上层弹窗。
3. 门户：新建 ProjectSide* 卡片、改 ProjectWorkspace / ProjectConfigEditor / ProjectFeedTab。
4. 词条 lbp-w10-copy.ts（17 语）。
5. 测试：primitives 小改 + 新增 lbp-w10-project-layout.test.mjs；typecheck 两仓。
6. 交卷 verdicts/W10-delivery.md。

## 复现命令
见 _COMMON.md §2。

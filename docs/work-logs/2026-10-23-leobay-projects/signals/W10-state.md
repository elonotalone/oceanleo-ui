# W10 state（项目页布局大改）

更新：2026-10-23 重派接手（上一轮只读完上下文，无代码落地；工作区干净，边界内无遗留改动）

## 已确认的事实
- 共享 `ProjectWorkspaceFrame`（src/shell/project-workspace.tsx）只有门户 ProjectWorkspace 一个消费方；导出名由 public-api.snapshot 记录，只记名字不记 props，所以只能给现有导出加可选 props，不能新增导出（src/shell/index.ts 不许改）。
- hit-target-budget.test：project-workspace.tsx 登记 2 处写死 <44px 的交互元素（抽屉关闭、弹窗关闭），不许再加写死 h-N 的按钮。
- 共享 Modal 走 portal 到 body、z-[1000]；Escape 监听在 document 上且 stopPropagation（同节点上抽屉的 Escape 监听拦不住它），所以抽屉的 Escape 要自己让位给上层 aria-modal。
- 资产列表接口只返回根目录一层（folder 在前）+ usage；待办接口一次最多 100 条（含状态），计数在前端数；动态接口 scope=members 是全量（超集），mine 是与我相关；动态 summary 是后端写死的中文（activity_plan.py，不在我边界，交卷里提）。
- 词典里项目页大量文案本来就没有译文（项目配置/专家/自动化/动态/资产/邀请…共约 60 条 MISSING，/tmp/w10-scripts/check-keys.mjs 可复核），都要进 lbp-w10-copy.ts；W11 也可能登记同一批（待办/邀请/删除中…），重复登记英文保持一致即可。
- 门户测试 project-workspace-feed-tasks.test.mjs 把四个页签等写死，布局改后只改我负责的断言。
- 页面底色 --bg #faf8f5，--card 白：白卡片落在底色上才有分隔感。
- 基线（改前）：oceanleo-ui primitives 9/9 绿；门户 5 个 project-* 测试 33/33 绿。

## 设计决定
- 框架默认就是新样式（唯一消费方）：顶栏无白底无下边线；左列 = main + bottom 叠放（输入框只占左列）；右列 aside 桌面端无白底无边框无阴影，高度铺满到底、内部自滚；窄屏仍是抽屉（页底色 + 左边线 + 阴影）。grid 列宽类名不变。
- ProjectToolbar 去掉白底边框（筛选行不加白底，§5.3）；ProjectModal 加可选 size="wide"（宽 60rem、高 min(52rem, 视口-2rem)）。
- 门户：新建 ProjectSideActivityCard / ProjectSidePlanCard / ProjectSideAssetsCard / ProjectSideCards（容器 + 三个 ProjectModal）。侧卡片放在 <fieldset disabled> 之外（只读成员也要能点开看）。
- 动态卡：scope=members 最近 3 条 + 查看全部（弹窗里 ProjectFeedTab initialScope 可选 prop）；计划卡：按状态计数 + 前 3 条（进行中>待处理>已完成>已取消）+ 打开，空态主操作「添加待办」= 卡内一行输入直接 createProjectTodo；资产卡：根层条目数 + 用量 + 最近 3 个 + 打开，空态主操作「上传文件」= 直接 uploadProjectAsset 到根目录。
- ProjectWorkspace：去四个页签，左列「任务」白色圆角卡片（标题「任务」+ ProjectTasksTab）；右列 configPanel = 项目配置标题（仅桌面）+ 只读提示 + ProjectSideCards + fieldset(ProjectConfigEditor)。顶栏去掉重复的 pl-14（外壳 main 已让位）。
- ProjectConfigEditor：addAction 的 title 变量过 tt（原来英文界面会出现「Add 指令」）；模板标签等过 tt 的 key 补词条。
- 词条：17 语写进 lbp-w10-copy.ts；动态/资产/项目配置/专家/自动化等原本缺的一并补。

## 正在做
- 写好设计后开始实现：先共享框架（project-workspace.tsx）+ 它的测试。

## 下一步
1. 共享框架：project-workspace.tsx（column/bottom 只占主列、plain 样式、抽屉 Escape 让位、ProjectToolbar 去白底、ProjectModal size）+ primitives 测试小改。
2. 门户：ProjectSide* 卡片、ProjectWorkspace、ProjectConfigEditor、ProjectFeedTab。
3. 词条 lbp-w10-copy.ts（17 语）。
4. 测试：共享 UI + 门户各一份 lbp-w10-project-layout.test.mjs；门户 project-workspace-feed-tasks 小范围替换；typecheck 两仓；文案闸；hit-target。
5. 交卷 verdicts/W10-delivery.md；两仓各提交。

## 复现命令
见 _COMMON.md §2。词条检查：`cd /root/projects/oceanleo-ui && node --experimental-strip-types /tmp/w10-scripts/check-keys.mjs <每行一个中文key的文件>`（脚本在 /tmp，若丢失重写：register 测试 loader 后 import UI_MESSAGES 逐语种查）。

# W10 state（项目页布局大改）

更新：2026-10-23 21:15

## 已确认的事实
- 共享 `ProjectWorkspaceFrame`（src/shell/project-workspace.tsx）只有门户 ProjectWorkspace 一个消费方；导出名由 public-api.snapshot 记录，只记名字不记 props，所以只能给现有导出加可选 props，不能新增导出（src/shell/index.ts 不许改）。新增的弹窗尺寸类型因此不导出。
- hit-target-budget：project-workspace.tsx 登记 2 处写死 <44px（抽屉关闭、弹窗关闭），未动，没新增写死 h-N 的按钮。
- 共享 Modal 走 portal 到 body、z-[1000]；Escape 监听在 document 上且 stopPropagation（同节点上抽屉的 Escape 监听拦不住它），所以抽屉的 Escape 自己让位给上层 aria-modal。
- 资产列表接口只返回根目录一层 + usage；待办接口一次最多 100 条；动态接口 scope=members 是全量（超集），mine 是与我相关；动态 summary 是后端写死的中文模板（activity_plan.py，不在我边界），门户按同一批模板认回来再译。
- 词典里项目页大量文案本来就没有译文（项目配置/专家/自动化/动态/资产/邀请…），103 条已全进 lbp-w10-copy.ts（16 语）。
- 门户消费的是共享 UI 编译好的 src/theme/ui.css：本波共享 UI 里新用到的类名要父 agent 最后 `pnpm build:css` 才会进产物（theme-artifact-in-sync 在 HEAD 上本来就红，别的 owner 的类名同样没编）。
- 当前红的闸（hit-target / focus-ring / motion-token / motion-no-raw / i18n-tt-key-coverage 的全仓缺口 / i18n-key-collision 的 work-chat 与 bay 两条）全是别的文件、别的 owner 的在途改动，列表里没有 project-workspace.tsx 或我的门户文件。

## 已完成（已提交）
- 共享 UI 50468279：外框改造（bottom 只占主列、顶栏/右列无白底、抽屉 Escape 让位、ProjectToolbar 去白底、ProjectModal size="wide"）。
- 共享 UI 6655579e：lbp-w10-copy.ts（103 条 × 16 语）+ tests/lbp-w10-project-layout.test.mjs（17 条，已做 6 种变异反面验证）。
- 门户 fa9e6ec：ProjectWorkspace / ProjectFeedTab / ProjectConfigEditor + ProjectSide{Resource,ActivityCard,ActivityText,PlanCard,AssetsCard,Cards,Preview} + tests/lbp-w10-project-layout.test.mjs（13 条）+ project-workspace-feed-tasks 两条断言更新。

## 正在做
- 两仓 typecheck（共享 UI 在 heavy 队列里；门户第一次已过：只有基线 3 条 supabase/next 重复类型错，重构后要再跑一次）。

## 下一步
1. 共享 UI typecheck 结果；门户 typecheck 复跑。
2. 复核一遍最终 UI 细节（窄屏、只读成员、空态）。
3. 交卷 verdicts/W10-delivery.md，提交；两仓各记最后提交号。

## 复现命令
见 _COMMON.md §2。词条检查：`cd /root/projects/oceanleo-ui && node --experimental-strip-types /tmp/w10-scripts/check-keys.mjs <每行一个中文key的文件>`（脚本在 /tmp，若丢失重写：register 测试 loader 后 import UI_MESSAGES 逐语种查）。
共享 UI 新测试：`cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/lbp-w10-project-layout.test.mjs`
门户新测试：`cd /root/projects/oceanleo && node --experimental-strip-types --test tests/lbp-w10-project-layout.test.mjs tests/project-workspace-feed-tasks.test.mjs`

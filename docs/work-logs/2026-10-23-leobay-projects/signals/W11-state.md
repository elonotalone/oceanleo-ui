# W11 state（实现 owner：项目页各选择框 + 计划页翻译 + 项目列表页筛选）

更新：2026-10-23 21:12（门户 7 个文件 + 4 个旧测试已改并提交 65a976f；分表与新测试待做）

## 已确认的事实
- bootstrap 已跑。W11.md / _COMMON.md / 00-contract.md 已读。两仓边界文件在开工时都是干净的（门户只剩他人的 4 个未提交文件：package.json、pnpm-lock.yaml、.github/workflows/oceanleo-cn-frontend.yml、backend/scripts/retire_operator_examples_20261021.py）。
- 门户 `app/projects/page.tsx` 已由父提交 3dc343e 入库（共享卡片），现在归我。
- W01 的 `MenuSelect` 正式实现与 `CollectionFilterSelect` 的 `defaultValue` 在 20:34 还没落地（menu-select.tsx 仍是占位的原生 select；collection-chrome.tsx 无 defaultValue）。我按合同 I-1/I-2 的 props 写，交卷前再核对。
- 门户 `tt()` 查的是共享词典（`loadUiMessages` 与 `UI_MESSAGES` 同一份清单）。闸 `tests/i18n-tt-key-coverage.test.mjs` 只扫共享 UI 与同级插件仓，不扫门户。
- **词典大缺口（实测）**：我边界 7 个文件里已经在用 `tt()` 的键，有 183 条在 16 个非中文语种全缺（例：「全部任务」「搜索项目」「测试运行」「项目成员」「项目配额」），加上计划页 0 处 tt() 的 76 处写死中文，英文界面这些全是中文。所以「接上翻译」要给整个边界补词条，不止计划页。审计工具：/tmp/w11-tools/audit.mjs（抽 tt 键 + 查词典 + 找 tt 外中文）、/tmp/w11-tools/dict.mjs（查某条中文的现有译文）。
- 词典合并次序：W11 分表最后合并，会覆盖同名中文原文的别处译文 → 只放词典里没有的新原文；与 W10 分表重名要在交卷时核对。
- 任务页「来源」原始值 = `agent_tasks/app_sessions.site_id || kind`。库里实测取值（全库，项目内任务当前为 0 条）：oceanleo、''、app、website、word、ppt、home、word-ai、design、excel、travel、agent、image、meeting、make、threed、converter、bizdev、asset、ecommerce、video、music、resume、edu、finance、game、aihuman、chat、plugin-gallery、interior，以及 LeoDev 槽 `p-<32hex>.dev`。后端 `app/talent/bay_sites.py::TASK_SITE_ALIASES` 给出别名：ecommerce-assets→ecommerce、ppt-maker→ppt、slide→ppt、excel-ai→excel、word-ai→word、converter-suite→converter、aihuman-studio→aihuman、money→finance、home/portal→oceanleo。显示名取门户 `lib/sites.tsx` 的 SITE_CATALOG.name（产品名），认不出的归「其他来源」。
- `timeAgo(iso)` 任务页没传 tt → 相对时间永远中文，要改成 `timeAgo(iso, tt)`。
- 弹窗里的嵌套对话框：共享 Modal 在 document 上听 Escape（会一起关掉）；嵌套对话框要在自己的 onKeyDown 里（目标在自己 DOM 内时）stopPropagation。MenuSelect 在弹窗里还需要层级高于 z-[1000] 与 Esc 只关菜单 —— 这是 W01 的件，写进交卷「给父 agent 的请求」。
- 项目列表页：`CollectionViewOptions` 里本来就只有那四项，搬走后菜单为空 → 页头不再渲染这个按钮（交卷说明）。

## 设计决定
- 项目列表筛选行：[类型 ⌄ 全部类型] [项目范围 ⌄ 全部项目]。归属四项改成离开名称也看得懂的值：全部项目 / 星标项目 / 我拥有的项目 / 与我共享的项目（保留计数）。
- 任务页 `<details>` 行菜单 → `FloatingMenu / FloatingMenuItem`（`@oceanleo/ui/ui`，portal，不被裁）。
- 计划页：筛选 3 个用 CollectionFilterSelect（全部负责人 / 全部来源 / 全部状态），编辑抽屉与批量状态用 MenuSelect；h2 标题在弹窗里改 sr-only（弹窗头已有标题）。

## 正在做
- 门户代码已完成并提交（portal 65a976f）：门户相关 7 个测试文件 49 条绿，门户 typecheck 无新增错误（基线 7 条，全在别人文件）。
- 现在写分表 `lbp-w11-copy.ts`：审计得到 257 条词典里没有的新原文（/tmp/w11-out/keys-3.json）。其中 14 条别的 owner（W10 等）在工作区已定义，不在我清单里；交卷前要再核对重名。

## 下一步
1. （已完成）改 7 个门户文件。
2. 生成 `lbp-w11-copy.ts`（17 语，257 条）；生成器在 /tmp/w11-tools/ ，校验占位符一致、非 CJK 语种不含汉字。
3. 新增 `tests/lbp-w11-project-selects.test.mjs`（共享 UI 仓）；门户旧测试小范围精确替换：project-plan-tab、project-assets-tab、project-index-membership（该条 HEAD 就是红的，按新结构重写）、project-workspace-feed-tasks（只动任务页那几条）。
4. 两仓 typecheck（基线：共享 UI 3 条错在 video-project-doc.ts；门户基线在 /tmp/w11-out/portal-typecheck-baseline.txt）。
5. 交卷 `verdicts/W11-delivery.md`，两仓各提交。

## 复现命令
- 门户 typecheck：`cd /root/projects/oceanleo && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- pnpm typecheck`
- 门户单测（node --test 会被判重活，用 run-heavy）：`cd /root/projects/oceanleo && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- node --test tests/project-plan-tab.test.mjs …`
- 共享 UI 单测：`cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/lbp-w11-project-selects.test.mjs`
- 文案审计：`cd /root/projects/oceanleo && node --experimental-strip-types --experimental-loader /root/projects/oceanleo-ui/tests/ts-extension-loader.mjs /tmp/w11-tools/audit.mjs <门户文件…>`（/tmp 工具丢了可按 _state 描述重写）

## 已知的外部依赖 / 要写进交卷的请求
- W01 的 `CollectionFilterSelect` Esc 仍是冒泡阶段 window 监听、不 stopPropagation：计划页筛选在 W10 的弹窗里，开着筛选菜单按 Esc 会连弹窗一起关（MenuSelect 已用捕获阶段，没这问题）。
- W10 的词条把「项目成员」定成 "Project member"（单数，动态事件用），我的成员弹窗标题改用新原文「管理项目成员」避免冲突。
- 「负责人」现有英文是 "Lead"（组织角色用），待办编辑器改用新原文「待办负责人」(Assignee)；「每天」现有英文 "Per day"，自动化频率改用「每日」(Daily)。

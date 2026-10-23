# W11 journal（每得到一条实测结论追加一行）

- 2026-10-23 开工：文案闸不扫门户（只扫共享 UI src + 同级仓），但门户 tt() 仍查同一本词典，词条必须 17 语齐全。
- 2026-10-23 开工：门户旧测试 project-plan-tab / project-assets-tab 断言了旧结构（import 形态、aria-label 字面量、option value 字面量），改完要精确替换到绿。
- 20:40 重派实测：门户 HEAD 上 `tests/project-index-membership.test.mjs` 的「project index combines four categories…」就是红的（6 条断言对不上 80ab77c 之后的页面：onClick={() => setOwnershipFilter(item.id)}、normalizeProjectKind(project.kind)、ROLE_LABELS、更新于 {time} 等），其余 6 个相关门户测试文件 48 条绿。我按新结构重写这一条。
- 20:42 重派实测（审计工具）：我边界 7 个门户文件里已经在用 tt() 的键有 183 条在 16 个非中文语种全缺（「全部任务」「搜索项目」「测试运行」「项目成员」…），计划页 76 处中文写死 → 英文界面这些全是中文。接上翻译要覆盖整个边界。
- 20:44 重派实测：库里 agent_tasks / app_sessions 的 site_id 取值含 oceanleo、''、app、home、word-ai、asset、plugin-gallery 与 LeoDev 槽 `p-<hash>.dev`；后端 TASK_SITE_ALIASES 是别名权威表。项目内任务当前 0 条，所以线上看不到来源下拉的实例。
- 20:45 重派实测：W01 的 MenuSelect 正式实现与 CollectionFilterSelect.defaultValue 尚未落地（menu-select.tsx 自 18:26 未变）。
- 20:58 实测：W01 已提交 4880411a（MenuSelect 正式实现、CollectionFilterSelect.defaultValue）；门户 typecheck 对我的改动无新增错误。MenuSelect 菜单 zIndex 高过弹窗、Esc 捕获阶段只关菜单；CollectionFilterSelect 的 Esc 仍是冒泡 window 监听（弹窗里会连弹窗一起关）。
- 21:05 实测：W10 提交 fa9e6ec 时把整份 tests/project-workspace-feed-tasks.test.mjs 提交了，带上了我那一行 `timeAgo(..., tt)` 断言 → 那一行在我提交任务页前 HEAD 上是红的；我的 65a976f 补上。
- 21:12 实测：门户相关 7 个测试文件 49 条全绿（node --test 在重活槽排队时用 OCEANDINO_FORCE_LIGHT=1 走轻活槽，只读源文件）；门户 typecheck 无新增（基线 7 条错在别人的文件里）。
- 21:12 实测：待办截止日期存成「所选日期T23:59:59Z」，原回显按本地时区取日期，东八区会多一天；改成按 UTC 读写。

# W10 journal

- 2026-10-23 开工：读完任务书/合同/共同须知与 project-workspace.tsx、ProjectWorkspace、ProjectConfigEditor、ProjectFeedTab；基线 git：共享 UI HEAD 552ef24c，门户 HEAD 34ac742。
- 2026-10-23 20:40 重派接手：上一轮没有代码落地（两仓边界内 git status 干净）。基线实测：共享 UI primitives 9/9 绿，门户 project-* 5 个测试 33/33 绿。
- 实测：词典里「项目配置 / 专家 / 自动化 / 动态 / 资产 / 邀请 / 待办 / 文件夹」等约 60 条本来就没有译文（门户英文界面显示中文），都要进 lbp-w10-copy.ts。
- 实测：后端 feed scope=members 是全量超集，scope=mine 只是与我相关；summary 句子由后端 activity_plan.py 写死中文（不在我边界，交卷里提请求）。
- 实测：词典里 103 条项目页文案（含右列新卡片）在 16 语里全缺，已全部补进 lbp-w10-copy.ts；`i18n-tt-key-coverage` 只扫共享 UI 与同级插件仓，不扫门户，所以门户文案的完整性由 tests/lbp-w10-project-layout.test.mjs（共享 UI 侧，跨读门户源码）兜底。
- 实测：theme-artifact-in-sync 在改动前的 HEAD 上就是红的（别的 owner 的类名没编进 ui.css）；门户读的是编译好的 ui.css，所以共享 UI 里新用到的类名要父 agent 最后重编才在页面上生效。
- 实测：门户第一次 typecheck 只有基线 3 条（lib/oceanleo-ai.ts、lib/supabase.ts、proxy.ts：supabase/next 两份版本的类型不兼容），没有落在 W10 文件里。
- 实测：共享 UI 新测试 6 种变异（顶栏白底回来 / 右列面板回来 / 筛选行白底回来 / 去掉 Escape 让位 / 大弹窗尺寸还原 / 输入框挪回两列之下）都当场红；门户新测试 5 种变异（顶栏白底、卡片顺序、卡片进只读 fieldset、上传框给只读成员、输入框外层白底）也都红。


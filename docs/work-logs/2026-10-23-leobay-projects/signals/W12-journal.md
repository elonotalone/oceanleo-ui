# W12 journal（每得到一条实测结论追加一行）

- 开工：读完任务书/_COMMON/合同/W01–W11 任务书与 state/journal/W07 交卷；W12 无旧进度，从零开始。
- 实测：帮助文比本波落后得更多——10-10 站点下拉已替掉类目芯片，10-14「我的」已拆成 发布/卖出/买到/收藏/主页/数据面板 且「我发布的」不再含需求，10-15 一价一单没有分档/加购。本波相关的句子一律按已提交代码改；本波之外的过时点只在交卷里列「待父核」。
- 实测：门户 CN 仍拦 LeoChat（app/leochat/page.tsx cn→notFound；WorkspacePages.tsx:178 与 clone-shell.tsx:261 在境内隐藏侧栏项），而合同第 5 条要求两版一样；帮助文按合同写、交卷列「待父核」。
- 实测：后端 notifications._talent_link 仍把 money/vetting/profile 事件指到 /bay?bay=settings:money|vetting|profile，W05 让旧深链落到「付款卡+收款账户」单页，所以核验/资料类通知点开落不到核验块（后端不在我的边界，交卷提）。
- 父补充（21:3x）：what-is-bay 第 40 行「五块」、my-homepage 第 10 行「个人卡片」、bay-portal-help.test.mjs 第 178 行钉的旧句，都按「我的 = 交易/我的主页/数据面板」更新（任务书第 4 条允许的情形）。
- 父第二条补充：content-cases.md 第 8 行改成「LeoChat 通知里先收到一条消息，点开就是这件案子；也可以打开 通知 → 内容处置（oceanleo.com/leochat?im=cases，境内站走 oceanleo.cn 同一路径）」；父已在境内打开 LeoChat 整页与侧栏入口（门户 ffd66ed、共享 UI 08835f09），所以帮助文里「境内没有 LeoChat」（bay/leochat.md 第 16 行）要删，写成两版一样；不再需要把 CN 的 LeoChat 句子列「待父核」。
- 实测：tests/account-content-cases.test.mjs 只断言 content-cases.md 的 category: account 与文末收口句；改正文不影响它。

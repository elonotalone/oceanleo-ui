# W09 journal

- 2026-10-23 08:30Z R2 接班：main 上已有 c0086af3 / fa872c0d / c8934dc6 / ad36afaf，不重做。
- [实测] focused：rebuild-image-actions 14/14、image-editor-integrity 11/11、advanced-editor-v7 9/9、editor-repair-acceptance-edit-bar 5/5 绿。
- [实测] advanced-native-editors #3 红：读不到 `media-editors/use-pdf-workbench-collab.ts`（W06 文件被删/改名），不是 W09。
- [实测] i18n-tt-key-coverage #8–#10 红，缺口列表里没有 image-editor / ImageRoute / copy-w09 的条目。
- [实测] advanced-canva-interactions #3 红在图片两行（仍断言 image-filters / image-fonts 抽屉）→ 改为断言抽屉已删、`adjust` 面板在栏里；4/4 绿。
- [实测] r2a（w09-save.mjs，08:19Z）：第 1 次改 = staging×2 + revisions（rev4）；第 2 次改走草稿层 `/v1/database/upload`（`advanced-draft.ts`，标题「…草稿」，editorInternal 隐藏 root）；硬跳转离开 → 版本没发布。
- [实测] p1（w09-protocol.mjs，08:22Z）：两次改 → 两个新 revision（rev5 立即；rev6 = 草稿层 20 s 空闲后发布），× 关闭；重开/刷新内容都在（canvas 采样 = rev6）。但重开后保存态 error「最新服务器草稿暂时无法恢复，自动保存已暂停。请点重试。」。
- [实测] d1–d3（w09-recovery-diag.mjs）：草稿层保存后 IndexedDB 留一条本机恢复记录；版本发布、关闭后仍在（`use-advanced-recovery.ts` 卸载/脏→净时的兜底写盘与删除竞速）。重开：协同房间把上一场的副本当「别人的改动」套进来，摘要 `bedywdg0:hasControls,hoverCursor;2ptwutwr:oceanleoDependency`（控制柄样式 + 过期签名，非内容）→ dirty、revision++；本机旧记录随后被恢复，和房间的套用竞速 → 偶发 DRAFT_READ_FAILED。
- 修（W09 文件）：远端套用只比内容（`image-remote-delta.ts::collabComparableSnapshot`，同 digest 保留本机未过期签名）；恢复回调对「与画布相同」返回 unchanged（并删记录）、对「比所基于版本旧」返回 stale，都不标未保存；恢复期间只认本人编辑计数（别人的同步不算打断）。舞台加 `data-editor-dirty / -revision / -collab-tick / -remote-delta` 诊断属性。新测 image-editor-recovery-collab 5/5。
- 每个编辑会话仍新建 1 个隐藏「[W09] sample.png草稿」root（advanced-draft.ts 走 /v1/database/upload），W08 已报，转 W04/父。
- [实测] p2（修后，08:45Z）：重开不再报错、不再套房间副本；两次改 = rev13、rev14（rev14 由草稿层空闲发布、在 × 之后才落）；重开/刷新内容都在。但 ① 关窗后版本回执没写回会话，指针残留 → 刷新时把同一内容又发布成 rev15（无人改动）；② 断网改动 120 s 一直「保存中」，从不转「保存失败」（草稿层对可重试失败无限重试且不报 failedAttempt）。
- 决定：ImageRoute 不再接草稿层（同 W07 c3fc5215）。每次保存直接提交版本；断网走版本 flush → failedAttempt → 「保存失败，点击重试」。本机恢复改走非草稿 IndexedDB 路径。旧测 image-route-merge #? 改为断言不接草稿层。
- [实测] p3/p4（去草稿层后）：两次改 = 两个 revision（rev18/19）；离线改动仍停「保存中」120 s：版本已提交、卡在会话快照 PUT（离线失败重试，不经 flush 失败，不报 failedAttempt）→ 转 W04。会话快照 PUT 偶发 409（p3 一次直接显示「保存失败」，p5 一次重试后成功）。
- [实测] W02 契约接上后（w09-insert.mjs）：素材库「插入」可点 → 图层 1→2，面板「Inserted “[W09] sample.png”」→ 已保存；撤销 → 图层 2→1 → 已保存。保存中点撤销偶发无效（控制器 restoring 中拒绝）。
- [实测] w09-reload-edit.mjs（09:16Z）：一次改动出了 rev27 + rev28（会话快照还在记时外壳又要一次保存，图片照样提交相同内容）→ 修：画布自上次提交没动过就交回上次回执。
- [实测] 新上下文首开：协同房间副本的两个对象 id 与载入版本不同（`+wsdnojjo;+e226fbf8;-wpsa89ob;-0rd3n7uk`）→ 套用 → dirty=true（不触发保存）。根因在房间保留上一场的对象模型、重开载入的版本对象 id 不同；属于 use-entity-collab 对齐策略，写进交付剩余问题。

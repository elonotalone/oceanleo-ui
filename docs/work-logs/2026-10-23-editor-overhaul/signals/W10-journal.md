# W10 journal（每条实测/读码结论一行，UTC）

- 2026-10-23 [Codex最终实测] 18ad8f0b消除Undo/Redo手动bump：实际handler回归每次native移动=1person-write，no-op=0，17/17；stage/wiring批30/30，父最终Grid四文件43/43。material-dedup-final FULLPASS77.7s，三动作三200、native/published状态一致、Undo/Redo editRevision各+1、真实close/reopen图像可见且原cells保持。fork-final FULLPASS75s，UI一fork+两200、重开/reload保原cells和两mark；SQL private2582122f恰3版/acceptance owner/public原件仍1版。library-ready-final FULLPASS34s：owner-ready查询稳定、img解码及当前revision grant绑定、零写。首轮早填搜索被hydration清空不计产品结论；所有Chrome关闭、source/copy窗口释放，CODEX-W10已完成。

- 2026-10-23 [Codex红→绿] 冻结source567be的material场景真实插图1→Undo0、各200通过，但Redo按钮disabled。4f6c7c3c诊断确认native actualHistory={false,true}，publishedHistory={true,false}；无操作期间collab replace。原因是CommandExecuted最后mutation早于原生popUndoToRedo，顶栏没收到稍后栈变更。6ed2d7bd只订阅既有undoRedoStatus$再走原observe，保持baseline/blocked和栈顶引用去重，清理订阅；late-event回归先红后绿，3focused文件33/33。待原生图片整条终验，不把之前半场当最终通过。
- 2026-10-23 [Codex实测] 最终loader-only offline-stable PASS64.3s：首次offline→error零版本、online一次retry三staging200+revision923610bc200，fullreload新增mark和全部非覆盖原cells保持。source567be全程一致；初始FastRefresh在stage出现前完成，交互区间无HMR。merge-final PASS40.1s，真实mergeData新增/Undo去除，各200，共2版本，无409；数据不变。

- 2026-10-23 16:38Z [Codex红→绿] strict offline首次保存确有新红：native开表未加载ExcelJS，离线import失败被Turbopack缓存，上线后staging重试但交付生成始终chunk失败、零revision。daccb3b6在未加载exporter且offline时拒绝首次import；成功module缓存后仍可离线CPU导出，不缓存reject promise。新回归先红后绿，14/14 XLSX真实roundtrip绿。广guard初版实际offline→error零revision→online一次retry200→fullreload保内容PASS；最终loader-only版继续稳定快照观察复测，不将途中界面离开算通过或先推共享原因。

- 2026-10-23 16:25Z [Codex strict实测] 父64657726共享ids-v2首alignment修复后，fresh验收root73b709be两次编辑各200，无CAS重试，SQL ordinal5→6 e4f0aa9d→7 21690c97父链。实际close→reopen→fullreload均逐坐标核对所有非覆盖原cells及W10a54183/W10b54183，零额外revision。截图目视内容正常。开发nextjs-portal遮挡close时仅在证据脚本执行真实button.click fallback；不改产品交互。
- 2026-10-23 16:20Z [Codex observer实测] 单次保存后意外回详情此前未复现。复测加入auth/library/DOM/navigation/close观察，host-repro及strict全程保持stage；只观察到验收账号SIGNED_IN/INITIAL_SESSION及预期revision事件，无异常close/auth失效。不基于猜测改共享权限清理。

- 2026-10-24 [Codex实测] native manifest503故障注入：2次真实拒绝，错误面板出现、无空白canvas；等8s并CtrlS，staging/revision均0（codex-w10-source-fail）。补W01明确signal里的下载格式16语与重复扩展名问题；source等待换项不保留旧ready标记。

- 2026-10-23 [Codex纠正/确认] pageSize假设未解释白字，已移除其专用规范化与测试；Univer上游本就处理null。补probe在remote套用完成后读真实模型：d8bf00e4源46cells，collab-remote后liveCells=0、dirty=true；确认为首套room覆盖，证据codex-w10-live-diagnose2，已交父处理共享collab。初始probe的两mark不能当成功重开证据。

- 2026-10-23 [Codex根因] native工程原cell.p.documentStyle.pageSize的Infinity经JSON成为null；重开精确该字段是null，Univer内核默认用Infinity。probe初始v虽在，截图cells全白，不能据probe判pass。W10加载时只恢复这些pageSize null sentinel→Infinity，保留文本/富文本/有限尺寸且不改原JSON；25focused通过，正在视觉/完整协议复核。

- 2026-10-23 [Codex实测] Shared focused reconciliation c3d47eba完成后接W10；读原任务/交付/state/journal与共同合同。b13b20b5两存DB1→3，但第二存先409后重试200；新浏览器打开白屏，继续编辑触发Univer line-layout递归RangeError。只读取ordinal3源XLSX与native manifest均保留两mark；失败诊断后ordinal4/5已是空白模型，不再使用该head验收。
- 2026-10-23 [Codex修复] 5e024e3c：从typed editor_manifest恢复native project入口、schema与sheet维度验证；源未ready/失败不save或capture，invalid模型不flush；保存成功推进本地head。65 focused tests通过。
- 2026-10-23 [Codex实测] fresh验收fixture d8bf00e4两存均200，无CAS409；SQL ordinal1→2→3父链正确；close/reopen两mark在。旧场景fullreload落详情页，等待stage并非产品失败，补再点编辑继续严格验收。

- 2026-10-23 05:10 [实测] bootstrap 通过；HEAD `377b212b`；没有转给 W10 的信号。
- 2026-10-23 05:20 [实测] 05:09–05:25Z 槽请求超时（父 agent：代理连接池满，已修）；重跑后上传成功：`b13b20b5-c492-4126-9f80-fa5d9d4caf9c`「[W10] 保存验收.xlsx」、`85a058e9-ae06-473a-bc5c-b2814860a5e9`「[W10] 预算配色.xlsx」，都是 grid、ordinal 1（只读 SQL）。
- 2026-10-23 05:25 [读码] Univer 0.25.1 暗色：`createUniver({darkMode})` / `univerAPI.toggleDarkMode()`；UI 走 `univer-dark` 类（挂在 `<html>` 和 workbench-layout 上）；画布走 `ICanvasColorService.getRenderColor`，暗色时对**所有**颜色做保色相的明度反转（黄底→橄榄、深蓝表头→浅蓝），会改掉用户设的颜色。
- 2026-10-23 05:30 [读码] 画布默认色：表头底 `rgb(248,249,250)`、表头字 `#000000`、表头边 `rgb(217,217,217)`、网格线 `rgb(214,216,219)`、默认字 `rgb(0,0,0)`；格子区是透明清屏，底色来自容器。
- 2026-10-23 05:35 [读码] 不能用 CELL_CONTENT 拦截器改显示色：单元格编辑器用 `getCell()`（含拦截结果）+ 合成样式建文档，提交时 `getCellStyleBySnapshot` 把覆盖全文的文字样式写回 `cell.s` → 显示色会被写进存储。暗色只能在画布取色那一层做。
- 2026-10-23 05:40 [读码] 直接在格子里打字：舞台没有订阅 Univer 命令（只有协同绑定器订阅）。非协同时打字是否触发保存，要实测。
- 2026-10-23 08:25 [实测] R2 接班：focused tests 除 `grid-univer-agent-review-gate` §5（59e9e746 加了源失败前置，正则太死）和 `i18n-tt-key-coverage`（全仓闸，W10 无新缺口）外全绿；已把 §5 正则改成只放行「源失败拒绝」前置，禁写清单不变。
- 2026-10-23 08:30 [实测] 开发槽 light `85a058e9…`：统一栏 font-family/font-size/bold/italic/underline/strike/text-color/highlight/align + grid-valign/grid-wrap/grid-border/type/数据验证；值跟选区（A1 粗体白字深蓝底、B4 红字）；选 B3:C4 才出「合并单元格」。
- 2026-10-23 08:32 [实测] 顶栏专业页签原叫「Univer」（第三方品牌）→ 改成 `专业编辑`，槽上英文显示 Pro edit。
- 2026-10-23 08:35 [实测] 编辑栏停靠在舞台顶 +2..+41px，盖住列头与第 1 行 → 普通模式舞台上边距 46px（`gridStageTopInset`）；实测栏底 105、画布顶 110。
- 2026-10-23 08:36 [实测] 普通 ↔ 专业：同一个 canvas 元素（打标签前后一致），无载入遮罩。
- 2026-10-23 08:38 [实测] 深色：黄底「Travel」、浅绿底「due」默认黑字被换成浅字看不清；`#D9D9D9` 用户填充（= 表头边色）被当默认色变深。改为背景扩展这一趟原样画用户填充（白底除外）、字体扩展逐格按填充对比度决定默认黑字留黑；重跑截图三格都清楚。
- 2026-10-23 08:45 [实测] 点测（light，`85a058e9…` H3）：bold/italic/underline/strike/grid-wrap 按下状态翻转、顶栏 ↶ 撤回；font-size 11→16→11；font-family Arial→Times New Roman→Arial；align left→center；grid-valign Bottom→Top；grid-border 无→所有框线；type Auto→Percent；text-color #000000→#c00000；highlight #ffffff→#ffff00；全部撤销复原。merge-cells 那一步场景的拖选落在偏移格上（场景问题，probe 里 B3:C4 选区已出合并）。
- 2026-10-23 08:50 [实测] 打开即「最新服务器草稿暂时无法恢复，自动保存已暂停」：外壳恢复草稿读 IDB 期间，协同房间首同步把上次未存的格子套进画布 → editRevision +1 → 恢复判失败。修：`recovery.ready` 等房间套用完成（`grid-univer/open-settle.ts`）。
- 2026-10-23 09:00 [实测+探针] 打开就有 14 次 `collab-local` 活动（Univer 载入后的回写），每次 +editRevision、标脏 → 打开即自动存一版。修：本地侧活动不标脏（本人改动只认撤销栈）；等首同步期间打字照算本人改动。
- 2026-10-23 09:20 [实测+探针] 保存 8 s 后房间把本页自己存出的 revision 当「别人的新版本」回送 → `binder.adopt` 整本换回 → 刚打的第 2 次改动被冲掉。修：记下本页存出的 revision，回送时不换。
- 2026-10-23 09:25 [实测] 场景自身问题：首次编辑后 Univer 在 (-737,-890) 放一张 88×24 的单元格编辑画布，`canvas >> visible` 取到它 → 点击落在屏外；改成取最大画布。
- 2026-10-23 09:30 [实测] 会话快照 `PUT /v1/agent/sessions/<id>/snapshot` 多次 409 `session revision conflict`，偶发保存报错；开发槽 09:30Z 起反复超时（/library 60s 无响应）。

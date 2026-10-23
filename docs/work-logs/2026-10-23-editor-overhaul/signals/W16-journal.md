# W16 journal（每条实测结论一行）

- 2026-10-23 [实测 SQL] workflow 在用条目 96 个全是 `oceanleo.video.project.v2`；公共模板 41 个，kind 只有 prompt/generate/timeline/delivery，0 asset。
- 2026-10-23 05:27Z [实测 浏览器 R0 light] 素材库公共模板「观点解说·四段反转」点「编辑」→ 地址栏立即换成 `item=1d2dbe1f…`（还没改任何东西就 fork 了一份，库里 +1 条 workflow，ordinal 1）；画布显示「视频工程含有无法投影的节点；未改用旧图覆盖当前版本。，未改用空白图画覆盖原件。」+ Reload，0 节点；网站是浅色、画布是深色（`data-plugin-theme=dark`）；保存状态槽不显示（`data-save-state` 为空）。截图 `evidence/W16/r0-light-public-template-open-fails.png`。
- 2026-10-23 [实测 浏览器 R0] 库详情里视频画布条目的预览区直接显示原始工程 JSON（Chrome JSON 查看器），归 W05 的 library viewer。
- 2026-10-23 12:25Z [实测 浏览器 s1 light] 验收账号自己的副本 `1d2dbe1f…` 打开即是可编辑 v2 画布：7 节点 9 连线、小地图在、画布 rgb(243,244,246)、节点卡白底；选中节点编辑栏 = 位置与尺寸 / 锁定 / 复制一份 / 删除 / 节点参数；空选区出「加节点」抽屉（7 种）。
- 2026-10-23 12:33Z [实测 浏览器 s2 + SQL] 移动 → saving→saved，改名 → saving→saved，第三处 → saving→saved；整页刷新后移动与改名都在；revision 1→4（+3 = 保存 3 次）。断网改动 → saving→error（未显示已保存）。
- 2026-10-23 12:33Z [实测 SQL] 每次保存另多出一个 `…草稿` 隐藏 root（`editorInternal:true`，`advanced-draft.ts::uploadAdvancedDraft`，由 recovery.draftSchema 触发）→ 已去掉 draftSchema，只留本地恢复；内核问题转 W04。
- 2026-10-23 12:34Z [实测 浏览器 s2] 连线拖不出：节点卡 overflow-hidden 把半露在外的把手裁掉了，拖到的是节点本身 → 已去掉裁切、把手加大。
- Codex 接班 [实测] 旧 s7-material 完整保留；网关恢复后重跑仍无 search 请求，素材面板只有当前 workflow 卡，已把截图与查询证据交父 agent 修共享承载。
- Codex 接班 [读码+测试] 素材原来只有 materialRef，现补 fresh full → private staging → immutable asset+node 单次历史 → exact closure 引用；重开按依赖读真实媒体、签发地址不进工程。v2 安全私有草稿与保存基线前移同步补齐。专项 10/10、durable-save 1/1、workflow E9 安全测试通过；3D E9 VM binding 错误归父/W13。
- Codex 最终 [实测] PNG链路90.8s PASS，MP4链路56.3s PASS，深色MP3链路85.5s PASS；各有两次真实版本，Undo/Redo及重开保留媒体。曾发现 Undo 撤销 objectURL 导致短暂缺图，已修为编辑器生命周期缓存，新增真实 hook 回归通过。
- Codex 最终 [实测] 深色公共模板协议57.4s PASS：1次fork回执复用现存副本，2次修改与离线恢复各一版，刷新保留；最终控件场景61s PASS（加节点/参数/位置/锁定/复制/删除/撤销重做/连线/删线撤销）。
- Codex 最终 [实测 SQL] active workflow root只有1个；闭包从入口1项变成入口+3媒体共4项，均ready；近期各版本preview=1，最终ordinal31。专项12/12、workflow E9 1/1通过。交付CODEX-W16.md。

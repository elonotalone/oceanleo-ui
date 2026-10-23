# W09 交付 — 图片（Fabric，含原设计画布）

R2 接班（08:30Z 起），第 1 轮的成果（c0086af3 / fa872c0d / c8934dc6 / ad36afaf）没有重做。

## 1. 用户看得到的变化

- **统一栏**（第 1 轮落码，R2 实测）：选中图片 = `replace crop flip-x flip-y rotate radius border opacity adjust` → 对象组 `arrange position lock duplicate delete`，「更多」里 `image-fit shadow`。文字图层：文字组 → 形状里适用的 `stroke` → 对象组；形状：`fill stroke radius opacity` → 对象组；表格/便签 `bar: object`。
- **空态抽屉**：画笔 / 形状 / 线条 / 便签 / 文字 / 签名 / 表格 / 图层 / 画布（W02 已按 W09-to-W02 扩到 9 个）。「图片调整」「字体」两个抽屉删掉（调色是栏里的 `adjust` 面板，字体是 `font-family` 下拉）。
- **保存**
  - 改自己上传的图片：在同一个库条目上出新版本，标题不再拼「-编辑版」。
  - 每次保存都是服务器上的一个新版本：图片不再接草稿层（同 W07 演示）。之前第 2 次改动只上传一份「…草稿」隐藏文件就显示「已保存」，版本要等 20 秒空闲才发；断网一直转圈不报失败；每个会话还多出一个隐藏「…草稿」root。
  - 重开图片不再被标成未保存、也不再偶发「最新服务器草稿暂时无法恢复，自动保存已暂停」：协同房间里上一场的副本只差控制柄样式和过期签名时，不算别人的改动；保存后残留的本机恢复记录，内容和画布一样就删掉，比画布所基于的版本还旧就不套用。
  - 外壳在会话快照重试后会再要一次保存，画布没动过的话交回上次回执，不再多出一个内容相同的版本。
- **素材库**：点一下「插入」把图片放进画布，选中图片时「替换」可用（接上 W02 的 command 契约）；撤销能撤回。
- **外语界面**：图片调整面板（像素化 / 黑白 / 复古 / 反相）、画笔 / 线条 / 便签 / 签名 / 表格 / 导出抽屉的说明，共 45 句，以前在英文界面里显示中文，现在有 16 种语言的译文。

## 2. 文件清单（R2）

- 改：`src/shell/advanced-routes/ImageRoute.tsx`、`src/shell/image-editor/{fabric-controller-core,use-fabric-image-editor,types,FabricImageStage}.ts(x)`、`src/i18n/ui/messages/editor-overhaul-copy-w09.ts`、`tests/advanced-canva-interactions.test.mjs`（只改图片那几行）、`tests/image-route-merge.test.mjs`。
- 增：`src/shell/image-editor/image-remote-delta.ts`、`tests/image-editor-recovery-collab.test.mjs`、场景 `evidence/W09/scenarios/{w09-protocol,w09-recovery-diag,w09-reload-edit,w09-insert,w09-fork,w09-theme,w09-buttons}.mjs`、`signals/W09-journal.md`、`signals/W09-to-W04.md`。
- 删：无文件。

## 3. 提交

第 1 轮：c0086af3 fa872c0d c8934dc6 ad36afaf。R2：31b748fc db2d9bc9 b3fac2df bd17805b f20b7134 445ef810 5f71282c 5ecc8d97（以及本交付的提交）。

## 4. 验证

### focused tests（全部 `agent-io-guard.sh run-light`）

| 测试 | 结果 |
|---|---|
| image-editor-recovery-collab（新） | 7/7 |
| rebuild-image-actions | 14/14 |
| image-editor-integrity | 11/11 |
| rebuild-image-save-history | 5/5 |
| image-route-merge | 8/8 |
| image-design-merge | 11/11 |
| collab-visual-readonly | 20/20 |
| advanced-editor-v7 | 9/9 |
| editor-repair-acceptance-edit-bar | 5/5 |
| advanced-canva-interactions | 4/4 |
| editor-overhaul-w02-material-command | 3/3 |
| i18n-tt-key-coverage | 7/10：#8 列表里没有图片文件；#9 现在多出我补了译文的 45 条（要从基线摘，见 §8）；#10 里 像素化 / 反相 / 复古 是 `tt(label)` 间接引用 |
| advanced-native-editors | 4/5，#3 读不到 W06 的 `use-pdf-workbench-collab.ts`，与图片无关 |
| e9-draft-safety | #3 `model3dAdmitted is not defined`（W13）、#4 工作流，与图片无关 |

### 类型检查

`npx tsc --noEmit -p .`：3 个错误，全在 `workflow-carrier/video-project-doc.ts`（W16），图片文件 0 个。

BROWSER_SECTION

## 5. 保存协议（§5，验收账号，LeoDev 槽，数据库只读核对）

| 条 | 结果 | 证据 |
|---|---|---|
| 1 自己的图：改 → 已保存 → 再改 → 已保存 → 关闭 → 重开 → 刷新 | **通过**。p4：rev18、rev19；重开、刷新后画布采样都是第 2 次改动后的样子 | `/tmp/w09-p4/w09-protocol.log`、`p4-reopen-open.png`、`p4-reload.png` |
| 2 库卡片跟着更新 | 见 §4 浏览器部分的库截图 | |
| 3 公共素材只 fork 一次 | **通过**。公共图「Plains Sunset」`530789e5…`：点「编辑」时 `:fork` 一次 → 副本 `8bd5a879…`，地址栏切过去；3 次改动 = 副本 ordinal 4（fork + 3 个 revision），验收账号新增 root 只有这一个 | `/tmp/w09-f1/w09-fork.log` |
| 4 断网 → 保存失败 → 重试 → 已保存 | **部分**。断网时从没显示过「已保存」；但如果断网时卡住的是会话快照那一步，顶栏一直「保存中」，不转「保存失败」（共享内核，已转 W04 §3）；恢复网络后自己存上（p4 rev21） | `/tmp/w09-p4` |
| 5 保存次数 = 新增 revision 数，没有多余条目 | **修后通过**。修之前一次改动出过 rev27 + rev28（重复 flush），修了（445ef810）。去掉草稿层以后不再生成隐藏「…草稿」root | SQL 见下 |

数据库核对（只读、只查验收账号）：

```
supabase-sql oceanleo "select ordinal, created_at from artifact_revisions where artifact_id='03e7bab9-4fd8-401b-ac5f-cee1b319a184' order by ordinal"
```

（上传是 ordinal 1；R2 的每次运行和对应的 ordinal 记在 `signals/W09-journal.md`。）

## 6. 删掉的东西与测试改动

- `ImageRoute` 的 `recovery.draftSchema`（不接草稿层）。`tests/image-route-merge.test.mjs`「persists … through the server draft receipt tier」改成断言**不接**草稿层，本机恢复还在。原因：草稿层让「已保存」先于新版本出现、断网不报失败、每个会话写一个隐藏 root。
- `tests/advanced-canva-interactions.test.mjs` #3 图片两行：原来断言 `image-filters` / `image-fonts` 抽屉存在，改成断言它们已经删掉、`adjust` 面板在栏里（抽屉是第 1 轮按 D3/D9 删的）。
- 「图片调整」「字体」抽屉（第 1 轮）。

## 7. 转给别人的事

- **W04**（`signals/W09-to-W04.md`）：① 本机恢复记录在版本发布后仍留在 IndexedDB（清理和写盘竞速），下次打开时 `useLocal` 不跟已载入版本比时间；② 草稿层每个会话建一个隐藏 root；③ 断网时卡在会话快照那一步的保存一直「保存中」；④ 会话快照 409 让已经提交的版本显示「保存失败」。
- **W02**：图片空态有 9 个抽屉，1440 宽并打开左侧面板时，栏右端「画布」被截掉（截图 `/tmp/w09-ins/w09ins-0-materials.png`）。
- **W05**：库加载失败的空态文案「暂时无法加载我的库 / 请稍后重试…」在英文界面里显示中文（`/tmp/w09-t-dark/failure.png`）。

## 8. 请父 agent 代改的公共文件

- `tests/i18n-tt-key-coverage.test.mjs` 历史基线：把我已经补了译文的 45 条摘掉（#9 会逐条列出：上传签名图片、先选择线条类型…、列表、单元格、图片质量、在签名板书写…、填充、导出尺寸、应用裁剪、手写签名、投影、拖过网格…、插入便签、插入文字签名、插入表格、文件格式、文字内容、滤镜调整、画布背景、笔触大小、签名板、签名颜色、绘制、背景图层、自由、行距、表头、表格样式、表格结构、裁剪比例、解锁图片图层、请先解锁图层…、输入姓名、选择交付格式…、选择后插入…、选择文字层级…、选择绘制或擦除…、选择颜色后插入…、重置滤镜、锁定图层、键入或上传、黑白，以及 像素化 / 复古 / 反相）。
- `public-api.snapshot.json`：没有新的公共出口，不用改。

## 9. 如实的剩余问题

- **协同房间对齐**：新的浏览器上下文首次打开时，房间里上一场的副本对象 id 和载入的版本不同（`+wsdnojjo;+e226fbf8;-wpsa89ob;-0rd3n7uk`）→ 被当成别人的改动套进来，画布被标成未保存（不会触发保存，看上去一样）。根因是 `use-entity-collab` 的首次对齐策略：房间留着上一场的对象模型。不在我的文件里，没改。
- 保存还没结束就点撤销，偶尔没反应（控制器 `restoring` 期间不接撤销）；保存完再点就正常（w09-insert i4）。
- 版本回执在 × 关闭之后才落时，会话里的指针没清（草稿层时期）；图片不接草稿层以后不再走这条路，已有的残留指针会被忽略。
- 槽上会话快照 `PUT` 偶发 409，期间顶栏会短暂显示「保存失败」（W04 §4）。
- 链接（`link`）、竖排、缩进不出：Fabric 的图片文字层没有这些能力。

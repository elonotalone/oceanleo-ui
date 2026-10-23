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
  - 连着点几下不再显示「保存失败」：保存一次只跑一个（上一次没结束就等它结束），生成预览期间画布又变了就重新抓一次。
  - 协同房间把本页刚提交的版本当作「外部版本」推回来时不再套回画布（以前保存过程中做的撤销会被盖掉）。
- **素材库**：点一下「插入」把图片放进画布，选中图片时「替换」可用（接上 W02 的 command 契约）；撤销能撤回。
- **外语界面**：图片调整面板（像素化 / 黑白 / 复古 / 反相）、画笔 / 线条 / 便签 / 签名 / 表格 / 导出抽屉的说明，共 45 句，以前在英文界面里显示中文，现在有 16 种语言的译文。

## 2. 文件清单（R2）

- 改：`src/shell/advanced-routes/ImageRoute.tsx`、`src/shell/image-editor/{fabric-controller-core,use-fabric-image-editor,types,FabricImageStage}.ts(x)`、`src/i18n/ui/messages/editor-overhaul-copy-w09.ts`、`tests/advanced-canva-interactions.test.mjs`（只改图片那几行）、`tests/image-route-merge.test.mjs`。
- 增：`src/shell/image-editor/image-remote-delta.ts`、`tests/image-editor-recovery-collab.test.mjs`、场景 `evidence/W09/scenarios/{w09-protocol,w09-recovery-diag,w09-reload-edit,w09-insert,w09-fork,w09-theme,w09-buttons,w09-undo,w09-card}.mjs`、截图 `evidence/W09/shots/*.png`（9 张，每张 ≤150KB）、`signals/W09-to-parent.md`、`signals/W09-journal.md`、`signals/W09-to-W04.md`。
- 删：无文件。

## 3. 提交

第 1 轮：c0086af3 fa872c0d c8934dc6 ad36afaf。R2：31b748fc db2d9bc9 b3fac2df bd17805b f20b7134 445ef810 5f71282c 5ecc8d97 9a94c6df d900d389（以及本交付的提交）。

## 4. 验证

### focused tests（全部 `agent-io-guard.sh run-light`）

| 测试 | 结果 |
|---|---|
| image-editor-recovery-collab（新） | 9/9 |
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

### 浏览器（验收账号，LeoDev 槽，`harness/run.mjs`，场景都在 `evidence/W09/scenarios/`）

| 场景 | 结果 | 证据 |
|---|---|---|
| `w09-buttons.mjs`（浅色），图片栏逐个点 | `replace` → 打开素材面板；`crop` → 进入裁剪态（`crop-apply crop-ratio crop-cancel`），取消后画布原样；`flip-x` / `flip-y` / `rotate` → 画面变了，撤销能撤回；`radius` / `border` / `opacity` / `adjust` / `position` → 打开面板；`arrange` → 打开下拉；`lock` → 选区被锁（撤销不撤锁定，见 §9）；`duplicate` 图层 1→2，`delete` 2→1；连点一轮后保存落定、没有一次 autosave.error（修之前同一轮 7 次） | `/tmp/w09-b4`、`/tmp/w09-b6`、`evidence/W09/shots/crop-mode.png` |
| `w09-undo.mjs` | 翻转 → 等保存 → 撤销，以及翻转 → 保存中立刻撤销：两种情况保存落定后都回到翻转前（像素 hash 一致），每一步一个 revision | `/tmp/w09-u1` |
| `w09-insert.mjs` | 素材库「插入」可点 → 图层 1→2，面板显示「Inserted “[W09] sample.png”」→ 已保存；撤销 → 2→1 → 已保存 | `/tmp/w09-i4`、`evidence/W09/shots/insert-after.png` |
| `w09-fork.mjs` | 见 §5 第 3 条 | `/tmp/w09-f1` |
| `w09-protocol.mjs` / `w09-reload-edit.mjs` / `w09-recovery-diag.mjs` | 见 §5；诊断过程记在 journal | `/tmp/w09-p1…p5`、`/tmp/w09-r1`、`/tmp/w09-d1…d3` |
| `w09-theme.mjs` 深色 | 舞台四周、编辑栏、空态抽屉条、左侧「调整」面板都是深色，图片保持原色；扫描编辑器内大于 6000 px² 的不透明白底元素，结果为 0（空态、调整面板两处） | `evidence/W09/shots/dark-empty.png`、`dark-image-bar.png`、`dark-adjust.png` |
| `w09-theme.mjs` 浅色 | 浅色舞台 `#f3f4f6`、白色面板；调整面板的「Black & white / Vintage / Invert / Pixelate」已经是英文 | `evidence/W09/shots/light-empty.png`、`light-image-bar.png`、`light-adjust.png` |
| `w09-card.mjs` | 库里只有一张「[W09] sample.png」，缩略图是最新一版（含插入的图层），标题没有「-编辑版」 | `evidence/W09/shots/library-card.png` |

空态抽屉条（深浅两档都一样）：`image-brush image-shapes image-lines image-notes image-text image-signature image-tables image-layers image-canvas`，即 Brush / Shape / Lines / Note / Text / Signature / Table / Layers / Canvas。

数据库（只读）：`03e7bab9…` 现在一共 47 个 revision（ordinal 1–47）。修之前出现过 3 个没有对应改动的多余版本：rev15（草稿指针残留后重新发布）、rev20（刷新后多提交了一次）、rev28（重复 flush），对应的修复是 bd17805b 和 445ef810；修完以后每个 revision 都对应一次改动或撤销，记录见 journal；08:52Z 去掉草稿层以后，验收账号再没有新增「[W09]…草稿」隐藏 root（查询结果 0）。


## 5. 保存协议（§5，验收账号，LeoDev 槽，数据库只读核对）

| 条 | 结果 | 证据 |
|---|---|---|
| 1 自己的图：改 → 已保存 → 再改 → 已保存 → 关闭 → 重开 → 刷新 | **通过**。p4：rev18、rev19；重开、刷新后画布采样都是第 2 次改动后的样子 | `/tmp/w09-p4/w09-protocol.log`、`p4-reopen-open.png`、`p4-reload.png` |
| 2 库卡片跟着更新 | **通过**。库里只有一张卡片，缩略图是最新一版，标题不变 | `evidence/W09/shots/library-card.png` |
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
- 「锁定」不进撤销历史：点了锁定以后，撤销撤不掉锁定（要再点一次解锁）。
- AI 快捷按钮（一键多尺寸 / 换配色 / 去水印/擦除 / 生成同款 / 导出全部尺寸，来自 `design-mode/l4-chips.ts`）在英文界面里还是中文：渲染它们的 quick-actions 外壳没有用 `tt()`，不在我的文件里。
- 版本回执在 × 关闭之后才落时，会话里的指针没清（草稿层时期）；图片不接草稿层以后不再走这条路，已有的残留指针会被忽略。
- 槽上会话快照 `PUT` 偶发 409，期间顶栏会短暂显示「保存失败」（W04 §4）。
- 链接（`link`）、竖排、缩进不出：Fabric 的图片文字层没有这些能力。


## 第 3 轮（2026-10-23 13:00Z 起，父 agent 转来 W04 §7）

**问题**：只打开图片（自己的或 fork 来的）、不做任何改动，重开或刷新之后也会多出 1 个内容没变的 revision。

**根因**（[读码] + [实测]）：
1. 重开时载入的版本给对象发了新 id，协同房间里还是上一场的 id。首次对齐时，房间副本被当成「别人的改动」套进画布，画布被标成未保存。
2. 未保存状态让本机恢复记录写进了 IndexedDB。没有人改，也就没有保存，这条记录从不删除。
3. 下次打开时，这条记录被当作「恢复的未存改动」套回画布，然后发布成一个新版本。

**修法**（64bd2feb，全部在我的文件里）：
- `image-editor/image-remote-delta.ts`：新增 `imageIdRelabelMap` / `relabelImageSnapshot`，比较时可以忽略对象 id 和跟着 id 走的来源凭证 id。
- `image-editor/fabric-controller-core.ts`：远端与画布画面相同、只差对象 id 时，把本地对象换成房间的 id（撤销栈一起换），不算改动，不触发 `onRemoteApplied`。
- `image-editor/use-fabric-image-editor.ts`：
  - 本人这次打开还没动过手时，别人的改动只更新画布，不标未保存。自动保存本来就只在本人编辑后才存，标脏只会留下恢复记录。
  - 编辑计数每次打开清零。
  - 恢复比较也忽略 id，与画布相同的记录直接删掉。
- `collab/adapters/image.ts` / `vector.ts` 没有改动：对齐的比较发生在图片控制器里，适配器本身不用改。

**回归测试**：`tests/image-editor-recovery-collab.test.mjs` 新增 2 条（共 11/11）：
- 只差 id 的同一画面会被换 id，翻转之类的真改动仍算改动。
- 远端套用先尝试换 id；没有本人编辑就不标未保存；每次打开清零编辑计数。

其它测试：collab-visual-readonly 20/20、collab-image-adapter 6/6、image-editor-integrity 11/11、rebuild-image-actions 14/14、rebuild-image-save-history 5/5。类型检查 0 个错误。

**浏览器实测**（验收账号，场景 `evidence/W09/scenarios/w09-open-only.mjs`）：

| 对象 | 过程 | `/revisions` 次数 | 数据库 ordinal |
|---|---|---|---|
| 自己的图 `03e7bab9…`（浅色） | 打开 40 s → × → 重开 40 s → 刷新 40 s，全程不改 | 0 | 47 → 47 |
| fork 副本 `8bd5a879…`（深色） | 同上，每段 30 s | 0 | 4 → 4 |

- 全程 `dirty=false`，IndexedDB 里没有恢复记录。截图：`evidence/W09/shots/open-only-dark.png`。
- 改动照常保存：`w09-reload-edit.mjs` 跑「改 → 刷新 → 改」，正好得到 2 个 revision（ordinal 48、49）。

**仍然存在**：房间里保留着上一场的对象模型，所以重开时房间副本仍可能套进画布（`collab-tick` 增加，画面不变）。现在它不标未保存、不写恢复记录、不发布版本。真正多人同时编辑时，别人的改动在本人第一次动手之后才算进本人这边的保存，这和「自动保存只在本人编辑后才存」的既有规则一致。

提交：64bd2feb（修复和测试），以及本节所在的交付提交。

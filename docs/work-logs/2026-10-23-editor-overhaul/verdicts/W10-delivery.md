# W10 交付 — 表格（Univer）

R1（前任，已在 main，未重做）+ R2（本次接班，08:20Z–）。

## 1. 用户看得到的变化

**统一文字栏（编辑页，选中单元格）**
- 规范 id、§4 顺序：`font-family` · `font-size` · `bold` · `italic` · `underline` · `strike` · `text-color` · `highlight`（= 单元格底色）· `align`；之后是表格特有控件 `grid-valign`（垂直对齐）· `grid-wrap`（自动换行）· `merge-cells`（只在多格 / 已合并时出）· `grid-border`（边框，显示当前框线）· `type`（数字格式）· 数据验证面板；「更多」里 `clear-format`。
- 值跟着当前格子（实测：A1 粗体按下、白字、深蓝底；B4 红字；多格选区才出「合并单元格」）。
- 做不到而不出的规范项：`list`、`line-height`、`link`（Univer 单元格没有这几样的格子级写口）；图片组、形状组、对象组不适用于单元格。
- 特有控件都不借规范图标（文字按钮 / 表格图标）。

**顶栏页签**：专业页原叫「Univer」（第三方引擎品牌）→ 改为「专业编辑」（英文 Pro edit），与 PDF、网站一致（R2）。

**专业编辑无缝**：普通 ↔ 专业是同一个 Univer 实例、同一个 canvas 元素（R2 实测打标签前后一致），没有载入遮罩。

**编辑栏不再盖住列头**（R2）：普通模式下编辑栏停靠在舞台顶边（实测 +2..+41px），原来盖住列头和第 1 行；舞台在普通模式留 46px 上边距，栏底 105、画布顶 110。专业模式不留（ribbon 取代浮动栏）。

**深色**（D6）
- 格子、表头、网格线、ribbon、菜单、页脚变深；默认黑字显示为浅字；存储内容不改（只在画布取色层映射）。
- R2 修：用户浅色填充（黄底、浅绿底）上的默认黑字原来被换成浅字看不清 → 字体扩展逐格把填充色告诉取色层，黑字 / 浅字按对比度选；用户恰好用了与默认色同值的填充（Excel 常用灰 `#D9D9D9` = 表头边色）原来被当默认色变深 → 背景扩展这一趟里的颜色一律当用户填充原样画（白底除外）。
- 让出的上边距条在深色下与格子同色。

**保存**（R2 修三处、都在表格自己文件里）
1. 打开即「最新服务器草稿暂时无法恢复，自动保存已暂停」：外壳恢复草稿读本机记录期间，协同房间首同步把房间内容套进画布（编辑序号 +1）→ 恢复判失败、自动保存停住、房间里的改动永远存不进去。`recovery.ready` 改为等协同首同步并由绑定器套用完毕（`grid-univer/open-settle.ts`）。
2. 只是打开就标脏、自动存一版：协同绑定器的「本地侧活动」在载入后被 Univer 自己的回写触发 14 次，每次 +编辑序号、标脏。改为本地侧活动不标脏（本人改动只认撤销栈）；等首同步期间打的字照算本人改动（原来被挡掉、静默不存）。
3. 保存后第二次改动被冲掉：保存约 8 s 后房间把本页自己存出的 revision 当「别人的新版本」回送 → 整本换回 → 刚打的字没了。改为记下本页存出的 revision，回送时不换（收到时、取完版本后各判一次）。

**素材库插入**（D2 / W02 契约，R2）：素材库点一张 PNG / JPEG / GIF 图片 = 在活动格子处插浮动图片。走 Univer `insertImage`（插图命令进撤销栈 → 撤销能撤回、算本人改动会保存）；图片存成 data URL（库地址是会过期的签名地址；XLSX 导出也只认 data URL）；≤5 MB；登记 `withEditorHistoryCommand`（目标 = 这份表格，基线 = 当前 revision）。原来的「拿另一份 xlsx 整份替换」不进撤销历史，不再作为素材库动作（本地表格仍从顶栏上传打开）。

## 2. 文件清单

R2 新增：`src/shell/doc-editors/grid-univer/open-settle.ts`、`grid-univer/material-image.ts`、`grid-univer/use-grid-material.ts`、`grid-univer/acceptance-probe.ts`（把编辑序号 / 脏 / 协同阶段 / 事件计数挂到 `__oceanleoGridUniverPaint`，不含单元格内容）、`tests/grid-univer-open-and-material.test.mjs`。
R2 改：`GridUniverStage.tsx`（R2 起点 1,396 → 1,406 行；素材适配器抽出到 hook）、`grid-univer/{same-document,chrome,dark-canvas,use-grid-univer-live}.ts`、`src/i18n/ui/messages/editor-overhaul-copy-w10.ts`、测试 `grid-univer-text-bar` / `grid-univer-same-document` / `grid-univer-wiring` / `grid-univer-agent-review-gate` / `grid-univer-stage-runtime` / `W5-20261021-grid-person-edit.mjs` / `editor-repair-20261021-acceptance-remaining-autosave.mjs`（后两个与 stage-runtime 只给 Univer 桩补 `IRenderManagerService` 导出）。
R1（前任）：`grid-univer/{text-bar,text-commands,selection-style,dark-canvas,edit-watch,use-grid-univer-live}.ts`、`stage-plan.ts`、`facade-commands.ts`、`grid-format/xlsx-style-overlay.ts`、`grid-model.ts`、文案册、`tests/grid-univer-text-bar.test.mjs`、`tests/grid-xlsx-style-import.test.mjs`。
删：无文件。

## 3. 提交

R2：`269fe048` `a42de951` `93062f53` `f52d4947` `1304e47c` `068f2c0e` `53b7824d` `c0fb4946`（+ 本交付提交）。
R1：`8b19ac66` `de68b085` `3d61797e`，父 salvage `36444696` `d8111092` `506a6b2f`。

## 4. 验证

**focused tests**（`agent-io-guard.sh run-light`，逐个）全绿：grid-univer-text-bar 15、grid-univer-open-and-material 7、grid-xlsx-style-import 3、grid-univer-wiring 10、grid-univer-icons 2、grid-univer-stage-runtime 3、grid-univer-agent-review-gate 22、grid-univer-facade-commands 32、grid-univer-stage-mode 8、grid-univer-same-document 16、grid-univer-presets-chrome 7、grid-univer-l4-chips 14、grid-univer-xlsx-export 13、grid-xlsx-round-trip 10、grid-format-toolbar 11、grid-univer-snapshot-conversion 39、grid-univer-date-import 4、grid-carrier-contract 37、advanced-editor-v7 9、advanced-editor-v8 4、advanced-workbench 20、W5-20261021-grid-person-edit 2、editor-repair-20261021-acceptance-remaining-autosave 8。
- `i18n-tt-key-coverage`：W10 无新缺口；红的 3 条是全仓基线（别人的新文案缺译、基线死条目——其中「合并单元格」「边框」是 W10 册补齐后该从 `PRE_EXISTING_GAPS` 删掉的，见 §8）。
- `advanced-project-autosave` 第 4 条红在 `use-rich-doc-editor.ts`（W08），与表格无关。

**类型检查**（09:3xZ，`run-heavy npx tsc --noEmit -p .`）：W10 文件 0 错；全仓只剩 `website-local/website-site-save.ts`（W14）1 个、`workflow-carrier/video-project-doc.ts`（W16）3 个。

**浏览器**（开发槽、验收账号，场景 `evidence/W10/scenarios/w10-grid.mjs`，模式 probe / layout / buttons / save / offline / trace2 / diag）
- 统一栏点测（light，`85a058e9…` H3，`buttons`）：bold、italic、underline、strike、grid-wrap 按下翻转，顶栏 ↶ 撤回；font-size 11→16→11；font-family Arial→Times New Roman→Arial；align left→center（图标随值）；grid-valign Bottom→Top；grid-border 无→所有框线；type Auto→Percent；text-color #000000→#c00000；highlight #ffffff→#ffff00；全部撤销复原。merge-cells：probe 里 B3:C4 选区出现「合并单元格」；buttons 里那一步因场景取错画布（见 §7）没点到，未单独复测。
- 无缝切换（dark，`layout`）：RESULT same-canvas，载入遮罩 0。
- 截图：`evidence/W10/light-text-bar-a1.png`、`light-text-bar-range.png`、`light-buttons-final.png`、`dark-normal-fills.png`（修后：黄底 / 浅绿底黑字、#D9D9D9 灰保留、列头不被盖）、`dark-pro.png`、`dark-before-fill-fix.png`（修前对照）、`open-paused-before-fix.png`（修前打开即暂停）、`save-run1-edit2-lost.png`（修前第 2 次改动丢失）。

## 5. 保存协议（§5）逐条

文件：`9823a576…`「[W10] 保存协议R2.xlsx」、`128ddc66…`「[W10] 保存协议R2b.xlsx」（都在验收账号库里，上传即 ordinal 1）。
1. 改一处 → 已保存 → 再改一处 → 已保存 → 重开两处都在：**修前不通过**（第 2 处被房间回送整本换回冲掉，`save-run1-edit2-lost.png`；只读 SQL：`9823a576` 当时只有 rev 2）。修后（`1304e47c`）复测时开发槽 09:33Z 起无响应，**未能复测**；探针已确认修后不再出现 `external-adopt`（`save-r2h`：保存后无整本换回）。
2. 库卡片更新：未单独核（槽不可用）。
3. 公共素材首改 fork：未测（表格公共模板未在本轮打开）。
4. 断网 → 保存失败 → 恢复 → 重试 → 已保存：场景 `offline` 已写好，**未跑**（槽不可用）。
5. 每次保存 = 新 revision：修前 `128ddc66` 多次运行中出现过「只是打开就存一版」（`f52d4947` 修）；SQL 显示 `128ddc66` 现有 rev 1–7（多次调试运行累计，含修前打开即存的版本）。修后打开不再存版本（`save-r2d`：打开 3 s 内 revision POST = 0，编辑序号 0，未脏）。

## 6. 删掉的测试 / 改了断言的测试

- `grid-univer-same-document`「专业页签名字」：`"Univer"` → `"专业编辑"`，并断言不含引擎名（D1 + 10-22 不出第三方品牌）。
- `grid-univer-agent-review-gate` §5：正则只允许 `59e9e746`（「源失败不许空白保存」，非 W10）加的「源失败直接拒绝」前置；禁写清单不变，保护没放松。
- 没有删测试。

## 7. 场景自身问题（已修，记下免得验收位再撞）

- 首次编辑后 Univer 在 (-737,-890) 放一张 88×24 的单元格编辑画布，`canvas >> visible` 会取到它，点击落在屏外 → 场景改为取最大画布。
- 编辑后立刻 `waitSaved` 会在防抖前读到旧的「已保存」→ 场景改为先等到一次 `POST …/revisions` 再等已保存。
- 重开后 `/library?item=` 先出详情页，要点右上铅笔进编辑器（`openGrid` 已处理）。

## 8. 转给别人 / 请父 agent 代改

- `signals/W10-to-W04.md`：会话快照 `PUT /v1/agent/sessions/<id>/snapshot` 409「session revision conflict」导致偶发保存失败；`advanced-draft-restore.ts` 第 82 行在「无本机记录也无服务器指针」时仍判编辑序号，建议挪到 `if (!local && !pointer)` 之后（其它开协同的编辑器同样会撞）。
- `signals/W10-to-parent.md`：开发槽 09:33Z 起无响应。
- 请父 agent 代改：`tests/i18n-tt-key-coverage.test.mjs` 的 `PRE_EXISTING_GAPS` 删掉「合并单元格」「边框」（W10 册已 16 语齐全）。
- W03：选择控件里的读屏文字「当前值：」在英文下仍是中文（W03 的 `SelectionToolbarSelectControl`），点测时 textContent 可见。

## 9. 如实的剩余问题

- §5 第 1、3、4 条修后没有在浏览器里复测成功（槽不可用）；修复有单测与探针佐证，但仍需 V02 判。
- Univer 的 locale 固定 `zh-CN`：英文站点下专业页 ribbon（开始 / 插入 / 公式 / 数据）和专业页状态栏统计（求和 / 计数）是中文。这是 10-22 起就有的；要改得在舞台叶子里加 11 个 en-US locale import，本轮没做。
- 协同房间按 artifact 持久：上一会话没存成版本的格子会在下次打开时由房间套回并自动存一版（这是「恢复未存改动」，但用户会看到打开后顶栏走一次「保存中」）。若房间内容比库里最新版本旧（别处存了新版），房间套回会盖掉新版本——这属于协同适配器（`collab/adapters/grid.ts`，非 W10 文件）的判定，建议只在房间基于当前 revision 时才套用。
- 素材库插图没有在浏览器里点测（槽不可用）；单测覆盖了取图、类型 / 大小校验、插在活动格、契约登记。
- `merge-cells` 在 buttons 场景里未点到（场景取错画布，已修场景，未复跑）。

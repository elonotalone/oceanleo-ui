# W08 journal

- 开工：bootstrap 通过，`main` HEAD `60b0d1dc`，无转给 W08 的信号。
- [实测 node] 旧 txt 写回（`createRichDocDeliveryFile`）去标签后把所有空白压成一个空格：存一次整篇变一行，`&` 写成 `&amp;`。
- [实测 node] 旧 md 写回（默认 turndown）：GFM 表格压成散字（`A\n\nB\n\n1\n\n2`）、删除线丢失、列表写成 `-   ` 加只有空格的行（读回是松散列表）、`<br>` 写成行尾两空格、`a_b` 写成 `a\_b`。
- [实测 node] 新 `rich-doc-text-delivery.ts`：sample.txt / sample.md 经真 schema 载入再写回逐字节相同；GFM 表格（含合并单元格）写回仍是表格；`tests/richdoc-text-delivery.test.mjs` 7/7。
- [读码] 后端 DOCUMENT 合同：不送 preview 时 preview/thumbnail 默认取 full（text/markdown、text/plain 在原生封面白名单里）→ txt/md 不画 PNG，封面就是源文本。
- [实测] tsc：W08 文件无错（唯一错误在 W01 的 `plugin-chrome/PluginMoreMenu.tsx`）。
- [读码] W03 canon 已在盘上（`edit-bar-canon*.ts`），投影丢弃 disabled 控件、把可上栏的规范项从 inspector 拉回栏上；`link`(kind text) 成规范面板。
- 统一栏改写（0ec30af1 抢救提交）：规范 id、`bar`、font-family、list 下拉、link 面板含移除链接、图片组 replace/radius/border(面板)/opacity、对象组 duplicate/delete；特有控件不带规范图标。
- docx：高亮改走 `w:shd` 底纹（`w:highlight` 只认命名色），textStyle 字号→半磅、字体栈首→`w:rFonts`。
- 深色：`RICHDOC_CSS` 改用 `--richdoc-*` token；`rich-doc-theme-ink.ts` decoration 只改显示（默认黑字→前景，低对比色提亮到 4.5:1，高亮/单元格底色压暗，白底透明）；`tests/richdoc-dark-ink.test.mjs` 6/6。
- [实测] tsc：W08 文件无错（其它错在 PdfRoute / use-pdf-collab，W06 进行中）。i18n 门：W08 缺口清零（21 个 key，16 语）。
- R2 接班（08:3xZ）：读 state/journal/信号；focused tests 8 个 W08 相关文件全绿（advanced-canva-interactions 唯一红在 W09 image-filters，i18n 门红项无 W08 文件）。
- [实测 浏览器 R2] txt `54424e1a…`：两次保存各到 saved，关掉重开/整页刷新两处都在；断网 → error「网络不通，稍后自动重试」，恢复后点重试 → saved。DB：本轮 3 次保存 = revision 6/7/8，每个都带 `metadata.text_excerpt`，source_format 仍 txt。
- [实测 DB] 每个编辑会话 `advanced-draft.ts::uploadAdvancedDraft` 新建一个隐藏 `…草稿` root（txt 3 个会话 → 3 个；非 W08 文件，转 W04/父）。
- [实测 浏览器 R2] md `c3e0c65b…`：两次保存 = revision 8/9，重开/刷新两处都在；断网 error → 重试 4s 后 saved = revision 10（上一轮 15s 窗口内没动，probe 显示恢复网络约 3s 后自动重试即成功；场景重试窗口放宽到 60s）。turndown 预载后不再报 chunk 失败。
- [实测 DB] docx `2e894b64…` 上一轮（07:55Z）3 次保存只有 2 个 revision（save2 的 saved 没有对应 revision），待复测。

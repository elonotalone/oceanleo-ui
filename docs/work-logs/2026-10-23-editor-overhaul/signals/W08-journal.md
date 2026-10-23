# W08 journal

- 开工：bootstrap 通过，`main` HEAD `60b0d1dc`，无转给 W08 的信号。
- [实测 node] 旧 txt 写回（`createRichDocDeliveryFile`）去标签后把所有空白压成一个空格：存一次整篇变一行，`&` 写成 `&amp;`。
- [实测 node] 旧 md 写回（默认 turndown）：GFM 表格压成散字（`A\n\nB\n\n1\n\n2`）、删除线丢失、列表写成 `-   ` 加只有空格的行（读回是松散列表）、`<br>` 写成行尾两空格、`a_b` 写成 `a\_b`。
- [实测 node] 新 `rich-doc-text-delivery.ts`：sample.txt / sample.md 经真 schema 载入再写回逐字节相同；GFM 表格（含合并单元格）写回仍是表格；`tests/richdoc-text-delivery.test.mjs` 7/7。
- [读码] 后端 DOCUMENT 合同：不送 preview 时 preview/thumbnail 默认取 full（text/markdown、text/plain 在原生封面白名单里）→ txt/md 不画 PNG，封面就是源文本。
- [实测] tsc：W08 文件无错（唯一错误在 W01 的 `plugin-chrome/PluginMoreMenu.tsx`）。

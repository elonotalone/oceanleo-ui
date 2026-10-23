# W05 journal（每条实测结论一行）

- 2026-10-23 [实测] bootstrap OK；oceanleo-ui `main` 干净；无转给 W05 的信号。
- 2026-10-23 [实测] 词典：「表格」en=Table、「游戏」en=Games（合并后）；「视频画布」除 en 外 15 语缺；其余类型名 16 语齐全。
- 2026-10-23 [实测] D5 focused：tests/library-editor-category 7/7 绿；相关 library-* 6 份绿；cross-site-library #7（SplitWorkspace 字串）与 sidebar-v5-contract #4（ArtifactLibrary 注释字串）在 HEAD 上同样不成立，非 W05 引入。
- 2026-10-23 [实测] D8 focused 全绿：document-cover-runtime 1/1、document-cover-excerpt 3/3、library-document-open 3/3、library-render-stability-1022 2/2、material-cover-rendering 12/12、media-aspect-stability 11/11、library-document-card-w05 4/4；i18n 闸里 W05 文件 0 条缺口（闸其余红项属别的 owner / 基线）。
- 2026-10-23 [实测] backend pytest 45 passed（新增 test_typed_upload_text_excerpt 9 + 既有 upload 三份）；oceanleo 提交见交付。07:26Z 记：即将 docker restart oceanleo-api（W05 唯一一次，生效 typed_uploads 摘要）。
- 2026-10-23 [实测 07:3xZ] 槽整站 Build Error（use-pdf-collab 未提交改动删导出，非 W05），已写 W05-to-parent §1；07:33Z 由 owner 自行恢复。
- 2026-10-23 [实测] 浏览器（验收账号，LeoDev 槽）：上传 [W05] 卡片a.txt/md/docx → 库里 6s 内即文字卡片，首帧 coverState=ready、标题在、0 帧转圈/<img>/「正在读取」；摘要 txt/md 走 text、docx 走 docx。light 卡片 #fff/#1c1917，dark #202020/#ececec。
- 2026-10-23 [实测] Type 菜单 zh：全部 视频 网站 演示文稿 文档 表格 图片 PDF 音频 视频画布 3D 模型 游戏；en：All Video Website Presentation Document Spreadsheet Image PDF Audio Video canvas 3D model Game。深色下拉为深色。
- 2026-10-23 [实测 SQL 只读] 三份上传的当前 revision metadata.text_excerpt 均已写入（后端 8191e59 生效）。
- 2026-10-23 [实测] 文档编辑器改 [W05] 卡片a.txt 首行→已保存→回库：仍是文字卡片且首行是新内容；revision 2 renditions 全为 text/plain、metadata.text_excerpt 已更新（W08/W04 保存路径已落）。验收账号无 PNG 预览的文档，PNG 情形由单测覆盖。

# W05 journal（每条实测结论一行）

- 2026-10-23 [实测] bootstrap OK；oceanleo-ui `main` 干净；无转给 W05 的信号。
- 2026-10-23 [实测] 词典：「表格」en=Table、「游戏」en=Games（合并后）；「视频画布」除 en 外 15 语缺；其余类型名 16 语齐全。
- 2026-10-23 [实测] D5 focused：tests/library-editor-category 7/7 绿；相关 library-* 6 份绿；cross-site-library #7（SplitWorkspace 字串）与 sidebar-v5-contract #4（ArtifactLibrary 注释字串）在 HEAD 上同样不成立，非 W05 引入。
- 2026-10-23 [实测] D8 focused 全绿：document-cover-runtime 1/1、document-cover-excerpt 3/3、library-document-open 3/3、library-render-stability-1022 2/2、material-cover-rendering 12/12、media-aspect-stability 11/11、library-document-card-w05 4/4；i18n 闸里 W05 文件 0 条缺口（闸其余红项属别的 owner / 基线）。
- 2026-10-23 [实测] backend pytest 45 passed（新增 test_typed_upload_text_excerpt 9 + 既有 upload 三份）；oceanleo 提交见交付。07:26Z 记：即将 docker restart oceanleo-api（W05 唯一一次，生效 typed_uploads 摘要）。

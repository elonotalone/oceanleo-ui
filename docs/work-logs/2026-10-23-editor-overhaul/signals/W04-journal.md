# W04 journal

- 06:47Z [实测 API，dev 网关 127.0.0.1:8008，验收账号，PDF 952e4481] 照抄编辑器保存链、基线不前移：3 次上传 → 3 个隐藏 root（881301de / e2049167 / c4ded237），只有第 1 次 commit 200（rev c3dcbfcf），第 2、3 次 409。与操作员 10-23 03:29Z 现象一致。脚本 `evidence/W04/scenarios/api-repro-pdf.py`。
- 06:49Z [实测 API] 同一链、基线每次前移到返回的新 revision（`--fixed`）：3/3 commit 200（ea3dd249→2e754ae0→46c4af97）。仍然 3 个隐藏 root（bb36ccd3 / 030c38c9 / 1916d763）。
- 06:50Z [实测 API] `/v1/database/private-upload register_asset=false` 拒收 PDF（422，只收 JSON/PNG）→ 交付件进私有 staging 需要后端新口子。
- 06:50Z [实测] 浏览器复现暂缓：槽里他人半成品编译错（SelectionToolbar.tsx 缺导出）+ 05:09–05:25Z 连接池满；里程碑后再跑浏览器。
- 07:30Z [后端] oceanleo 473f3d1：staging 口子 / revision metadata 白名单 / 网站闭包继承；pytest 144 passed。即将 docker restart oceanleo-api（W04 第 1 次）。
- 07:37Z [focused] tests/editor-overhaul-w04-save-kernel.test.mjs 9/9；advanced-session/W2-*/persistence/model3d/w2-save-contract 全绿；tsc 我的文件 0 错。
- 07:38Z [实测 API，重启后] `--fixed --stage`：3 次保存 → staging 3 次（无 hidden root）→ 3 个 revision（4d921631→f6596a2b→c85be1b4）；DB：952e4481 共 8 个 revision，W04 近 3 分钟新增 editorInternal root 0（唯一新增的是 W07 草稿层 `[W07] sample.pptx草稿`，走 advanced-draft.ts，非本内核路径）。
- 07:45Z [后端] a396ef7 网站新图进闭包；pytest 146 passed。即将 docker restart oceanleo-api（W04 第 2 次）。

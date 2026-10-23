# W09 state (图片 / Fabric，含原设计画布)

## 已确认的事实
- [实测] 验收账号上传 `[W09] sample.png` → root `03e7bab9-4fd8-401b-ac5f-cee1b319a184`（single_file_image，ordinal 1，editability bounded）。
- [实测] `/library?item=` 先落库详情；要等账号与库加载完（`[data-library-retry]` 重试），点「预览「…」」再点「编辑」。场景 `evidence/W09/scenarios/w09-save.mjs` 已按此写。
- [读码] 自己的图片走 `persistImageProject` → typed CAS revision（同一 root）。标题已不再拼 `-编辑版`（fa872c0d）。
- [读码] W03 已落 `bar` 字段与投影；A-1 仲裁：面板型规范项 = 子控件 `slot:"inspector"` + `inspectorGroup:<规范 id>`。
- [读码] `design-composite-commit.ts` 运行期无人引用（只有测试）。
- [读码] `tests/advanced-canva-interactions.test.mjs` 断言 image-filters / image-fonts 抽屉存在 → 父 agent 文件，需代改。
- [读码] 已在 main：c0086af3 + fa872c0d（规范 id、bar、A-1 面板、删 图片调整/字体 抽屉、画布改名、标题不拼编辑版、签名板纸色）、c8934dc6（测试改规范 id + 回归）、ad36afaf（文案册）。

## 已完成（R2）
- 9a94c6df 保存串行、预览期间改动就重抓；d900d389 自己的版本不被房间回推套回；31b748fc canva 测试跟删掉的抽屉；db2d9bc9 重开不再标脏/暂停自动保存（远端只比内容、恢复 unchanged/stale）；bd17805b 不接草稿层；f20b7134 素材命令契约；445ef810 无改动不重复提交；5f71282c 45 句译文；b3fac2df 等 W04 信号。
- [实测] 保存协议：自己的图 2 改 = 2 revision、重开刷新都在；公共图 fork 一份、3 改进同一份；素材库插入 + 撤销可用。

## 正在做
- 无。交付已写：`verdicts/W09-delivery.md`。

## 下一步
- 等父 agent / 验收位复核；转给 W04 / W02 / W05 和请父 agent 代改的事见交付 §7–§8。

## 复现命令
- 按钮：`bash harness/mint.sh | OUT_DIR=/tmp/w09-b THEME=light node harness/run.mjs evidence/W09/scenarios/w09-buttons.mjs 03e7bab9-4fd8-401b-ac5f-cee1b319a184`
- 两档：`… THEME=dark node harness/run.mjs evidence/W09/scenarios/w09-theme.mjs 03e7bab9-4fd8-401b-ac5f-cee1b319a184 dark`
- 保存：`… node harness/run.mjs evidence/W09/scenarios/w09-protocol.mjs 03e7bab9-4fd8-401b-ac5f-cee1b319a184 p 5`

## 第 3 轮（10:30Z 起）
- 已完成：只打开不改 = 0 个新版本（64bd2feb，实测见交付「第 3 轮」）。

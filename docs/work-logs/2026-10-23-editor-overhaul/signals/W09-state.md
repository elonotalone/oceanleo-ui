# W09 state (图片 / Fabric，含原设计画布)

## 已确认的事实
- [实测] 验收账号上传 `[W09] sample.png` → root `03e7bab9-4fd8-401b-ac5f-cee1b319a184`（single_file_image，ordinal 1，editability bounded）。
- [实测] `/library?item=` 先落库详情；要等账号与库加载完（`[data-library-retry]` 重试），点「预览「…」」再点「编辑」。场景 `evidence/W09/scenarios/w09-save.mjs` 已按此写。
- [读码] 自己的图片走 `persistImageProject` → typed CAS revision（同一 root）；但 title 拼 `-编辑版`（回执 item.title 被改名，第二次存变 `-编辑版-编辑版`；非 durable 旧件走 saveCreations 会新建「-编辑版」条目）。
- [读码] W03 已落 `bar` 字段与投影；A-1 仲裁：面板型规范项 = 子控件 `slot:"inspector"` + `inspectorGroup:<规范 id>`。
- [读码] `design-composite-commit.ts` 运行期无人引用（只有测试）。
- [读码] `tests/advanced-canva-interactions.test.mjs` 断言 image-filters / image-fonts 抽屉存在 → 父 agent 文件，需代改。

## 正在做
- 控件改规范 id + `bar`（`fabric-image-toolbar-controls.ts` 重写、`fabric-image-commands.ts`、`image-mutation-policy.ts`、控制器补 highlight / 有序列表 / justify / 虚线 / 矩形圆角 / 置顶置底 / 清除格式）。

## 下一步
- 抽屉精简（删 图片调整、字体 两个抽屉；导出面板保留）、标题不再拼「-编辑版」、深色、测试、浏览器保存协议。

## 复现命令
- 浏览器：`cd docs/work-logs/2026-10-23-editor-overhaul && bash harness/mint.sh | OUT_DIR=/tmp/w09-x THEME=light node harness/run.mjs evidence/W09/scenarios/w09-save.mjs 03e7bab9-4fd8-401b-ac5f-cee1b319a184 <label>`
- focused：`bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/rebuild-image-actions.test.mjs`

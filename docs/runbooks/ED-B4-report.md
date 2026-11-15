# ED-B4：RichDoc 文档编辑器专项

结论：RichDoc 支持项已实现；最终 typecheck、API/consumer 检查通过，新增专项 13/13、末次四文件 40/40，协同/评论三文件 43/43。全量 npm test 与 comm 因规则冲突待授权，验收尚未完成。
工作树 `/root/wt/ED-B4-oceanleo-ui`，分支 `wt/ED-B4`，基线 `7be10456`。未 push，由父进程合并与部署。
任务书没有实际 `-o` 参数，暂用本工作树此报告；报告路径已向操作员异步说明。

## 改动（路径均相对本 worktree）

- `src/shell/doc-editors/RichDocControls.tsx:89`：移除来源专用上传和说明、Insert 内字体与查找；保留 `importSource` 底层能力；Table 初始行列数可选；只读可查找但禁止替换、插入。
- `src/shell/advanced-routes/RichDocRoute.tsx:100`、`src/shell/doc-editors/use-rich-doc-find-shortcut.ts:6`：查找独立同级浮层；常驻快捷键不依赖 Insert 挂载。
- `src/shell/doc-editors/use-rich-doc-editor.ts:387`：TableKit `resizable: true`；沿用 tableWrapper/overflow、resize handle 和 colwidth schema。
- `src/shell/doc-editors/use-rich-doc-selection-adapter.ts:249`、`src/shell/doc-editors/rich-doc-model.ts:1326`：字距以 px 数值持久化到 textStyle；大小写改写所选文字，保留原有 marks。
- `src/shell/doc-editors/use-rich-doc-selection-adapter.ts:100`、`src/shell/doc-editors/rich-doc-image-transform.ts:78`、`src/shell/doc-editors/RichDocControls.tsx:283`、`src/shell/advanced-routes/RichDocRoute.tsx:537`：图片矩形裁剪、水平/垂直翻转、90°旋转、亮度/对比度/饱和度、contain/cover/fill；JSON/HTML 保存、重开保留。crop/flip/case 均与既有动作控件形态一致；裁剪浮层经同一 adapter 选区/版本校验，不增加创建域裁剪按钮。
- `src/shell/doc-editors/rich-doc-image-style.ts:53`：变换图片的圆角、边框、透明度从裁剪框重读，避免 HTML 重开丢样式。
- `src/shell/doc-editors/rich-doc-docx.ts:31`：RichDoc 专用 DOCX 补充写入字距（1px=15 dxa），变换图片转 PNG 嵌入；data URI 图片使用真实媒体部件；失败时拒绝导出，保留工程 attrs。未修改共享 docx-export。
- `src/shell/doc-editors/richdoc-review/track-changes.ts:609`：监听原生 AddMarkStep/RemoveMarkStep，统一调用 trackedFormat；覆盖文字栏、快捷键、agent 字号；保留最早 before，合并待决区域并保留多位参与者（`src/shell/doc-editors/richdoc-review/review-marks.ts:172`），支持接受/拒绝/撤销；加载、远端、历史事务沿用跳过规则。
- `src/shell/doc-editors/richdoc-review/track-changes.ts:321`：清除格式保留批注与修订标记；格式移除仍被记录。
- `src/shell/doc-editors/richdoc-review/RichDocCommentRail.tsx:225`：提示选中文字即可批注，面板内提交真实评论；无选区/只读禁用。
- `src/i18n/ui/messages/editor-overhaul-copy-w08.ts:7`、`src/i18n/ui/messages/editor-panels-copy-base.ts:72`、`src/i18n/ui/messages/editor-panels-copy-western.ts:41`、`src/i18n/ui/messages/editor-panels-copy-eastern.ts:41`：16 语移除来源/旧表格名/两项排版文案；补 Table 行列与图片调色文案。
- `tests/richdoc-toolbar-engine-parity.test.mjs:1`：新增 13 项真实引擎、adapter、浮层、DOCX archive 与保存重开测试。

## 验证（进行中，完成后填入退出码与基线对照）

所有重任务通过 agent-io-guard；新增专项使用 run-light。未安装依赖。
末次四文件实际命令（退出 0，40/40）：
```sh
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test --test-concurrency=2 tests/richdoc-toolbar-engine-parity.test.mjs tests/editor-toolbar-profile-parity.test.mjs tests/doc-selection-adapters.test.mjs tests/richdoc-track-changes.test.mjs
```

- 新专项 `tests/richdoc-toolbar-engine-parity.test.mjs`：13/13 通过，无 React/DOM 错误；日志 `/tmp/ed-b4-parity-final.log`。
- 首轮四文件（track-changes、doc-selection-adapters、find-replace、table）：58/58 通过，日志 `/tmp/ed-b4-focused-first.log`。
- 新专项真实执行：空选区字体/字号只进入 storedMarks 并作用后续输入；有选区仅修改所选文字；JSON 重开原样。
- 新专项真实执行：文字字距 JSON/HTML 往返与 DOCX w:spacing；大小写 JSON/DOCX 往返；三种入口格式修订的拒绝、重开、单步撤销。
- 新专项真实执行：TableKit 拖拽由 192px 改至 240px，出现 resize handle，重开仍为 240px，DOCX w:tcW=3600 dxa。
- 新专项真实执行：图片各新增 canon 的真实命令，JSON/HTML 样式往返；首次变换保留图片已渲染尺寸，裁剪按原比例缩小可见窗口、旋转更新边界不截图，位图最长边 1024px，DOCX 按正文框等比缩放且不改工程尺寸；同源不同变换的 DOCX 媒体/关系不串图，光栅化失败不输出错误交付件。
- 新专项真实执行：data URI PNG/SVG 无网络、无光栅替身写入真实 DOCX，SVG 与 fallback PNG 媒体关系、命名空间有效；评论真实 hook 的锚点、正文和 sidecar 序列化；16 语清理/新增 key。
- `npm run typecheck`：最终通过，退出 0；`/tmp/ed-b4-typecheck-verified.log`。
- `npm run api:check`：通过，退出 0；`/tmp/ed-b4-api-check.log`。
- `npm run consumers:check`：通过，退出 0；35 consumers / 38 exported specifiers；`/tmp/ed-b4-consumers-check.log`。
- 20 份相关测试首轮 207/208（退出 1）；唯一 case 控件形态差异已修。末次新专项 + 共享 parity + doc-selection + track-changes 四文件 40/40（退出 0，`/tmp/ed-b4-parity-final.log`）；其余文件首轮均通过。未启动的重复批次已取消（pid 1429676），`/tmp/ed-b4-richdoc-final.log` 只有排队记录，不计作通过结果。
- `tests/collab-richdoc-review.test.mjs tests/collab-richdoc-adapter.test.mjs tests/richdoc-docx-comments.test.mjs`：使用同一 node/loader 参数实际复跑，43/43（退出 0，`/tmp/ed-b4-review-collab-final.log`）。
- 多作者格式修订：单个待决区域保存参与者列表，JSON/HTML 重开仍保留 Alice/Bob，拒绝该区域还原最早格式；这是合并后的区域修订，不提供逐次动作独立历史。

- `npm test` 全量：尚未实际启动；已取消排队（guard pid 1199520），`/tmp/ed-b4-full-test.log` 仅有排队记录。
- 全量失败清单及 comm 对照未生成，不得据此宣称“无新增失败”；基线原件 `/tmp/ui-baseline-fails.txt` 未改。
- `git diff --check` 与 `git diff --cached --check`：通过。既有未跟踪 node_modules 链接未加入提交。

## 引擎缺口与边界

| 能力 | 范围 / 缺口 |
| --- | --- |
| vertical-text | 未申报。当前缺完整段落/页面竖排布局与 DOCX 对应实现，不用 CSS 按钮冒充完整能力。 |
| case | 仅有选中文字时申报动作按钮，在大写/小写间切换；实际改文字（修订按文字增删记录），Unicode 大小写可改变长度；不承诺空光标后续输入自动转换。 |
| 图片 crop / rotate / adjust | 只做矩形百分比裁剪、90°动作和亮度/对比度/饱和度；无抠图/任意形状裁剪。HTML 渲染与 DOCX 光栅计划共用几何参数。 |
| 自动修订 | 行内 ReplaceStep（openStart/openEnd=0）及非审阅 mark 变更；自动跨块删除、合并段落、删整行/表格等结构变更不追踪。显式留痕删除标记行内文字，不提供块结构修订。 |
| 格式修订 | 待决区域可合并多次/多作者操作，参与者保留、按区域整体处理；字体/字号/粗斜下删/颜色/高亮/链接/字距/清除内联格式可记录；段落对齐、列表、段距、表格与图片 attrs 不冒充行内格式修订。 |
| 文本格式 | JSON 工程保留完整状态；HTML/DOCX 保留新增样式。Markdown/TXT 自身不承诺保留富排版。 |

## 未证实 / 未做

- 全量存在明确规则冲突：`tests/model3d-three-roundtrip.test.mjs:162`、`tests/remote-desktop-touch-browser.test.mjs:565`、`tests/w10-design-canvas-offline.test.mjs:31` 会启动 Chromium；最后一份测试 `:17` 还将证据写进主检出 `/root/projects/oceanleo-app/docs/react-client-rebuild/evidence/W10/design-canvas`。共同规则禁止未经明确授权开浏览器、改主检出，已异步请求仅对此全量测试的明确例外；授权前不执行。

- 未运行交互浏览器、截图、真机视觉验收；DOM 单测不代表像素验收。
- DOCX 图片用真实 docx/JSZip 和媒体关系测试；变换测试在光栅边界注入 PNG，未实跑浏览器 Canvas/SVG 光栅像素一致性；不能宣称该部分端到端视觉已证实。
- 未实调后端 PDF 转换，未验证实际 Word/Office 打开或导出 DOCX 再导入的完整样式；DOCX 结构与原始媒体 bytes、工程 JSON/HTML 往返已做单测。
- 未改后端/原生，因此未跑 pytest/cargo；未 build/安装原生客户端。
- 未改主检出产品代码，未合并、push、部署或重建 Dev slot；这些由父进程负责。

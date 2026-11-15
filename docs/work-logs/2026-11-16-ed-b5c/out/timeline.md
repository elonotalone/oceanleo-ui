# ED-B5c 时间线结果

允许文件内可闭环的能力已完成：clear-format、case、可撤销前缀的 list 内容转换，以及替换为当前时间线已导入的其他图片。完整目标仍有下表列出的引擎缺口；没有把它们声明为 adapter 能力。工作目录 `/root/wt/ED-B5c-oceanleo-ui`、分支 `wt/ED-B5c`；仅修改任务书列出的四个产品文件和独占测试、此报告。未修改 `VideoTimelineStage.tsx`，原预览、保存、渲染链即可消费本次修改后的模型。

## 交付与行为

- `src/shell/video-editor/video-edit-bar.ts:106`：文字新增规范 list / case / clear-format。list 与 align 继续是 select，case 遵守现有 Fabric / Deck 的 action 形态；无值命令在全大写与小写之间转换，显式 upper / lower 也可执行。字号仍由现有 adapter 边界呈现 px。
- `src/shell/video-editor/timeline-model.ts:81`：列表直接生成 `• ` 或顺序编号，预览与导出读取同一 `text`。`types.ts:51` 的 `text_list` 只记录本编辑器转换前的文字，不是虚构渲染样式。切换列表先取原文，清列表恢复原文，原文已有符号、编号、空行与缩进不会被猜测或删除。`timeline-model.ts:212` 验证生成内容一致后才保留并冻结记录。
- `src/shell/video-editor/video-edit-bar.ts:499`：大小写是内容编辑；Unicode 大小写并不保证无损，例如 Straße → STRASSE → strasse。可通过正常撤销恢复上次编辑，不能宣称是可反复恢复原大小写的样式开关。活动列表的原文同步转换，移除列表仍保留已做的大小写编辑。
- `src/shell/video-editor/video-edit-bar.ts:506`：清除样式重置字号 64px、白字、常规粗细、居中，去掉背景及历史未知样式，保留片段身份、时间和文字块 x/y。活动列表恢复转换前文字；手工编辑文字会撤销列表管理记录，保留编辑后全部可见前缀为普通内容，不自动删字。
- `src/shell/video-editor/video-edit-bar.ts:148`、`:409`、`:515`：图片替换从当前文档其他 image 片段选择；有候选才声明 replace inspector。源身份相同或引用格式无效的图片不会成为候选。替换复制 source_ref / source_url / label，保留片段 ID、时间与几何；替换成公开源会清掉旧私有引用。命令只接受候选片段 ID，不接受任意 URL。没有新增上传或 Library 选择器。
- `src/shell/video-editor/use-video-timeline-selection-adapter.ts:28`：把当前 doc 传入能力选择，其他片段加入后立即更新替换候选，原只读/disabled 防线继续生效。图片调色/fit 和非文字片段的文字命令在直接 dispatch 时也拒绝。

## 验证

- 专项命令（经 run-light）：`node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test --test-timeout=180000 tests/ed-b5c-timeline-parity.test.mjs`。最终 **10/10 通过**，0 失败/取消/跳过，约 2.53 秒；日志 `/tmp/ed-b5c-timeline-focused.log`。
- `tests/ed-b5c-timeline-parity.test.mjs:61`：实际 adapter 输入→外壳解析→canon 投影和 replace inspector 合同，字号 px、case action；逐项断言引擎缺口不发 id，align 不包含 justify。
- `:85`、`:105`、`:122`、`:137`：真实命令→normalize→`serializeVideoProjectEnvelope`→`hydrateVideoTimelineDoc`→渲染请求；覆盖列表切换/移除/原前缀保留、手工编辑及失效记录、Unicode case、旧样式清理、撤销模型和不可变版本快照。
- `:158`、`:189`：替换私有/公开源；真实工程保存不含运行时 grant，重开后经 `resolveVideoTimelineReferences` 恢复同一引用，渲染请求读新源；保留片段时间/几何，拒绝非候选和图片不支持的命令。
- `:200`：直接执行真实 `TimelinePreviewEngine` 的共享 frame composite 路径，断言最终绘制的文字、字体/颜色/对齐和替换后的图片 URL。仅模拟 Canvas/图片宿主对象，没有启动浏览器。
- `:252`：jsdom 挂载真实 `useVideoTimelineSelectionAdapter`，检查初始状态→增加候选→实际替换 dispatch→只读阻止→disabled 清选区，并断言 0 console.error。
- 临时命令（经 run-light）：`node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs /tmp/ed-b5c-timeline-render-input.mjs`，再 `python3 /tmp/ed-b5c-timeline-compiler-check.py`。真实命令、工程序列化重开及 render request 生成 case / bullet / ordered / clear-format / replace 五份输入，再交只读 `/root/projects/oceanleo/convert/timeline.py::_timeline_command` 编译，**5/5 通过**，日志 `/tmp/ed-b5c-timeline-compiler.log`。宿主 FastAPI 导入存在既有包冲突，临时脚本仅提供与 app_common 相同形状的 ConvertError 异常类；实际编译函数未替换。没有执行 ffmpeg 媒体渲染或网络请求。
- 仅对本任务文件执行 `git diff --check`，通过。没有运行整仓/typecheck，父进程持有这些门禁；W11 原精确顺序断言由父进程维护，不在本提交 stage 范围。

## 引擎缺口与未做

| 请求项 | 当前真实限制 | 本次结果 |
| --- | --- | --- |
| font-family | preview-engine.ts:623 固定系统字体；convert/timeline.py:474 固定常规/粗体字体文件 | 未声明、未加虚字段 |
| italic / underline / strike | 预览 drawText 和服务端 drawtext 都不读取这些样式 | 未声明 |
| line-height | 预览固定 fontPx × 1.3；服务端不读行高字段 | 未声明 |
| link | 预览及视频导出没有链接语义 | 未声明 |
| letter-spacing | 两端均无字距读取与渲染链 | 未声明 |
| justify | 两端仅 left / center / right | 只保留三项真实对齐 |
| indent-increase / indent-decrease | convert/timeline.py:461 的 strip() 会裁掉首行前导空格和末尾空白；仅插空格无法保证导出 | 未声明；未用不可见字符伪造缩进 |
| list | 没有富文本列表、嵌套或手工编辑后的自动续号引擎 | 实现文字内容转换与可验证的前缀还原，不宣称富文本格式 |
| case | Unicode 大小写转换可能丢失原始字形/大小写信息 | 实现内容编辑；明确有损边界 |
| image replace | 本范围不能把现有新增导入改成完整 Library 替换流程 | 实现当前 doc 已导入图片间替换；无候选无入口 |
| image crop / radius / border | 预览图片直接按原比例 drawImage；服务端图片分支不读这些字段 | 未声明、未加虚字段 |
| image adjust / image-fit | 服务端图片分支 convert/timeline.py:418 只读缩放/位置/翻转/旋转/透明度/转场，不读 fit/eq；预览图片路径也无这些实现 | 未声明；视频已有调色/fit 不扩给图片 |

未改共享 canon、后端或 preview-engine；未浏览器/截图、构建安装原生客户端、运行全量门禁、合并、push、部署或发布。未声称已完成完整富文字时间线、远端 Library 持久化 API 验收或真实 MP4 像素一致性验收。完整新增能力须由父进程扩展文件边界后补齐预览与后端共同合同。

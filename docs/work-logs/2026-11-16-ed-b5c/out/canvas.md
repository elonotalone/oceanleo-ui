# ED-B5c 视频画布交付

已在任务边界内完成文字样式、大小写/列表内容转换、真实图片替换、文字/音频创建入口、分镜内镜头计划与历史恢复。没有修改 project-model.ts、共享 canon 或宿主页面定义；没有 push、构建安装客户端或使用浏览器。

## 二次复核补齐：大小写与列表

- `src/shell/video-canvas/engine/canvas-selection-adapter.ts:21` 的 `canvasNodeTextClip` 统一正文读取优先级（params.text 优先，与原合成器一致）；`:193`、`:194` 为 text/script/subtitle 声明 canon case action 与 list select。列表是可见正文转换，没有假造富文字样式字段。
- `src/shell/video-canvas/engine/command-registry.ts:862`、`:866` 复用时间线真实 `timelineTextListPatch` / `timelineTextCasePatch`，metadata 保存在节点 params.text_list。转换同时写 raw node.text 与 params.text，避免 params 的旧正文覆盖结果。清样式同步撤销本编辑器仍受管理的列表前缀，保留原始正文中的项目符号/编号、手工改字、角色、时序及其它参数。
- `command-registry.ts:1112` 的真实 field.update/text 路径同步两处正文并主动清除列表记录；不会随后把用户手工输入的符号当作本编辑器列表删除。
- `canvas-selection-adapter.ts:45` 把同一正文和有效 text_list provenance 带入实际合成/交接；时间线 parser 重开后仍可识别/撤销该列表。模型与交接保存正文首尾换行，FFmpeg renderer 仍会 strip，未宣称成片首尾空白像素保真。
- 本次仅修改本 owner 的 adapter、command-registry、独占专项与本报告；四产品文件总边界不变。

## 首轮交付（9b773f91，以下为该提交行号）

- `src/shell/video-canvas/engine/canvas-selection-adapter.ts:21`：新增共同 `canvasCompositionDocument`，交给既有 `projectTimelineDocument` 计算受审镜头、时长、素材依赖与预算，再注入后端实际读取的文字样式；通过既有 `serializeVideoProjectEnvelope` 重写同一份交接文档。text/script 只有显式勾选 Include in video 才作为文字片段进入成片，原节点 kind、旧版本和 agent prompt 语义保持不变。
- `canvas-selection-adapter.ts:153`：text/script/subtitle 使用 text 栏，声明字号（px，step=1）、粗体、文字色、背景色、左中右对齐及 clear-format。未声明导出端不支持的富文字项。clear-format 清文字样式，回到 48px、白色、非粗体、居中；保留内容、Include in video、时序和其它节点参数。
- `canvas-selection-adapter.ts:431`：无选区与有选区均提供文字/音频创建动作，翻译为既有 `canvas.node.create`，继续验证 revision、selectionEpoch。创建菜单原本已经有 Text、Audio；更新说明文字，专项实际点击两个入口。
- `canvas-selection-adapter.ts:443`、`src/shell/video-canvas/engine/command-registry.ts:821`：只有存在不同图片候选时才声明 replace 面板。从本工程实际图片资产选择，更新当前节点、清理旧节点修图 recipe、同步对应分镜帧引用；原资产和旧版本保留。`origin=local-derivative` 的候选 URL 仍指向原图，故不列为可替换候选，避免丢失修图外观；当前图重复选择不改动。
- `command-registry.ts:846`：文字样式通过真实引擎命令写入新 head 的 `params.textStyle`，只接受受支持字段和值；role、时序等参数保留。`canvasCompositionDocument` 由 registry 引入并重导出，adapter 对 registry 的依赖只有 type import。
- `command-registry.ts:872`：历史恢复使用 `advanceProject` 生成新 versionId/revision/parentVersionId。保留新版本身份，删除当前内容后复制目标版本内容，避免旧版本不存在的 continuityQc 等字段串版；所有已有版本不可变。availability 与 handler 均验证 own version key、versionId 一致性，并拒绝当前 head。
- `command-registry.ts:1763`、`:1778`、`:1861`、`:1866`：成片渲染、时间线交接及各自 availability 都使用共同合成函数；不会出现只有渲染生效、交接丢样式。
- `src/shell/video-canvas/engine/CanvasProductViews.tsx:206`：每张 Storyboard 卡片包含镜头计划与真实 camera-plan.create 操作，director 路由也显示此组合内容。
- `CanvasProductViews.tsx:303`、`:398`：合成页读取共同合成结果，并展示实际字号、颜色、背景、粗体与对齐。
- `CanvasProductViews.tsx:410`：History 恢复成功后调用现有 `canvas.project.save`；失败显示真实错误，恢复出的本地工作 head 保留供重试。宿主现有只读入口、保存 CAS、命令 revision/epoch 与事务路径继续生效。
- `src/shell/video-canvas/engine/CanvasCreateMenu.tsx:120`：菜单说明按用户能创建的内容表达。

## 验证

二次补齐后最终独占专项 `tests/ed-b5c-canvas-parity.test.mjs`：12/12 通过，日志 `/tmp/ed-b5c-canvas-case-list.log`。使用真实 adapter → executeCanvasCommand → 项目模型 → saveVideoProject → parseVideoProject，未复制实现：

1. 三种文字节点的声明子集、px 单位、实际样式命令、保存/重开、受审分镜过滤、合成与时间线重新载入。
2. 脚本默认不入成片，非法样式与 stale selectionEpoch 不改工程。
3. clear-format 重开后保留内容/role/timing，导出恢复默认样式，旧版本保留先前格式。
4. 两资产真实替换、分镜帧同步、不可变历史、保存/重开；仅一资产与未落像素 derivative 不报替换能力，协议直调 derivative 被拒绝。
5. 无选区和有选区栏创建文字/音频，并保存重开。
6. History 恢复生成新 head、清除目标版本没有的 QC、保留既有版本；非法继承键、未知版本、当前版本、stale head/epoch 均拒绝。
7. jsdom 挂载真实 ProductViews/CreateMenu，创建真实镜头计划、切换 Storyboard/Director/History、恢复后保存、点击 Text/Audio，零 console.error。
8. 只替换网络协作者，实际 executeCanvasCommand 的 render/handoff 输入是相同样式、大小写与列表正文/provenance 的 cut，交接文档可被真实时间线 parser 重开。
9. History 走真实保存合同返回 CAS 冲突后显示失败，不谎报已保存，保留恢复后的工作 head；零 console.error。
10. text/script/subtitle 各一项真实 case/list 专项：canon 形态、自动大小写和显式小写、项目符号/编号切换、幂等应用、none/clear-format 清除、已有符号/编号保护、实际 field.update 手动改字后清元数据、保存/重开、受管理列表交接与时序/角色保留。三节点全部通过。

命令：

```sh
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- \
  node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
  --experimental-loader ./tests/ts-extension-loader.mjs --test --test-timeout=60000 \
  tests/ed-b5c-canvas-parity.test.mjs
```

此前首轮相同命令追加 `tests/pw-vm-video-canvas.test.mjs tests/pw-vb-video-delivery-view.test.mjs`：21/21 通过，日志 `/tmp/ed-b5c-canvas-regressions.log`。二次补齐的同三文件 24/24 通过，结果记录在 `/tmp/ed-b5c-canvas-case-list-regressions.log`。未由子任务运行全量、typecheck、hooks lint 或 LeoDev；这些门禁由父进程持有。

## 引擎缺口与边界

- 后端 `/root/projects/oceanleo/convert/timeline.py:467` 的 drawtext 读取 font_size/color/background/x/y/align/bold。任意字体、斜体、下划线、删除线、行距、字距、链接、竖排等仍缺渲染合同，未声明为本画布能力；补齐须联动 `src/shell/video-editor/types.ts`、`timeline-model.ts`、`preview-engine.ts` 和后端 `convert/timeline.py`。大小写/列表转换已在本轮补齐，不再列为缺口。
- `convert/timeline.py:463` 对正文执行 `.strip()`。本轮保留工程/交接正文首尾空白以便还原；成片首尾空白保真仍是既有 renderer 缺口，不能把文档往返测试当作像素证明。
- 图片 radius/border/opacity/alt/image-fit/remove-background 无完整节点预览、非破坏编辑与导出合同，本轮没有只加按钮或虚报能力。相关跨界文件包括 `src/shell/video-canvas/engine/project-model.ts`（字段/recipe/schema）、`LeoNode.tsx`（当前固定 object-cover 与 editTransform）、图片 provider capability 及后端实际落像素路径。已存在的 crop/rotate/flip/adjust 继续保留。
- Director 独立宿主页签仍由 `src/shell/video-canvas/engine/use-canvas-chrome.tsx` 和 `src/shell/video-canvas/LibraryVideoCanvasSession.tsx` 定义，均不在子任务允许边界；本轮把两路内容合并到分镜卡片，没有越界删除宿主页签。镜头计划仍是现有 35mm 与两关键帧计划，未声称新增 3D 预演或 AI 导演。
- 图片替换限于本工程已有、非 local-derivative 的实际图片资产；没有把打开素材库并添加新节点冒充 replace。
- 没有执行真实付费渲染、远程持久化、浏览器/设备视觉验收或生产部署；测试证明命令和实际生成/保存合同，不宣称像素级成片验收。

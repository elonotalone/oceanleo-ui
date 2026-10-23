# W02 state (接班文件)

更新于 2026-10-23 06:50Z。

## 已确认的事实

- [读码] 根因（库页面）：`/library?item=` → `MyLibrary` → `MaterialStandaloneEditor`（无现成窗格）→ `TaskFileWorkspace(agentInitiallyVisible=false)` → `AgentChat` → `SplitWorkspace leftHidden=true`。`paneMaximized = hasRight && (rightMaximized || leftHidden)`，`showDetail` 只清 `rightMaximized` 不管 `leftHidden` → 素材库/我的库/工具抽屉都被 `showDetail` 放进 `inert + aria-hidden + opacity0 + flexBasis 0%` 的左栏。ResultCanvas 没渲染（workspaceContent 顶替），所以没有登记库面板，`openLibraryPanel` 返回 false。
- [读码] 素材目录（material-library-view → MaterialStandaloneEditor）同一条路，同一根因。`/advanced/<featureId>` 在门户槽上 redirect 到 /workspace（子站才有该路由），那里无 SplitWorkspace，走壳自己的 aside。
- [读码] 我的库切换：`requestOpenLibraryItemInEditor` 发 workspace action；接收方只有 ArtifactLibrary（/library）与 ResultCanvas（工作台）；素材目录无接收方。
- [读码] 编辑栏「有无选区」：只有 Image 在无选区时传 `contextToolbar=null`；其余编辑器总传包装组件（内部 SelectionToolbar 无 context 时返回 null）。
- [实测] 上传 `[W02] sample.pdf/png/docx`：root 5f203d39-993f-4e3a-8d54-88d6935c6175 / f9c000cb-a8a7-4f62-a5a4-afe044e158be / 60af3ec7-eaa2-44d5-97ce-05e2997c57c1。
- [实测] `/library?item=<id>` 先落只读预览，铅笔键进编辑器。06:45Z 槽上 gateway 请求 ERR_FAILED，浏览器复现未完成。

## 正在做

- 修 SplitWorkspace（左栏隐藏时有面板请求就显示）+ 壳（库面板开合、互斥、再点收起；左栏隐藏时用壳自己的 aside）+ jsdom 复现测试。

## 下一步

- 编辑栏空态抽屉按钮（EditBarDocumentSegment + 选区探针）；我的库先存后切；素材点击反馈；文案；里程碑跑浏览器。

## 复现命令

```bash
cd /root/projects/oceanleo-ui/docs/work-logs/2026-10-23-editor-overhaul
bash harness/mint.sh | OUT_DIR=/tmp/w02-probe THEME=light node harness/run.mjs evidence/W02/scenarios/probe-left-panels.mjs "/library?item=5f203d39-993f-4e3a-8d54-88d6935c6175" pdf
```

# CODEX W10 — 表格续验

2026-10-24（本地）。替代旧 W10-delivery 中未完成的保存/离线/素材/模板验收结论。产品源码最终 `18ad8f0b`；本轮只操作内部验收账号，未部署、push、修改运营账号或清除协同房间。

核心保存与编辑场景已通过；最后只读 Library 当前版本预览卡片，等待共享文案短窗口结束后补证。不能把首轮搜索过早被 hydration 清空的场景算卡片通过。

## 修复

- `5e024e3c`：读取 typed `editor_manifest` 原生工程入口；校验 schema、sheet 模型和源数据尺寸；源未就绪/失败时禁止空白 checkpoint/flush；成功回执立即前移第二存 CAS 基线。
- `2dab34bd`：探针读取 remote 首套后的真实模型，不再用初始快照假报重开成功。pageSize/Infinity 假设已撤回，未作为最终根因。
- `5caa2e8b`：换项未就绪不继承旧 ready；下载文件名避免重复扩展名，三种下载格式补齐 16 语。
- 父提交 `64657726`：真实 Yjs 证实 ids-v2 初始对齐前本地 push 会退回位置键并清空模型；禁止此前 push，首对齐后重放 pending local write。没有以空房间跳过同步来绕过保护。
- `daccb3b6`：原生工程首次离线保存不启动未加载的 ExcelJS 动态 import，避免被打包器缓存失败；联网重试可恢复。成功加载后仍支持离线 CPU 导出。没有预热测试依赖，也未承诺修复所有在线 chunk 网络失败。
- `6ed2d7bd`：图片 Undo 的 CommandExecuted 早于真实栈移动，导致 native 已有 Redo、顶栏仍 disabled。订阅既有 `undoRedoStatus$`，沿原 baseline/blocked/栈顶引用去重并清理订阅。
- `18ad8f0b`：Undo/Redo 不再额外手动 bump；真实栈变更计一次本人编辑，no-op 为零。其他 controls 和协同来源判据未改。

## 实际验收

| 场景 | 结果 | 原始证据 |
| --- | --- | --- |
| clean open、两次连续保存、真实 close/reopen、整页 reload | 仅两次 200；零 409；两 mark 和全部非覆盖原 cells 保留；打开/重开/刷新零额外版 | `/tmp/codex-w10-strict-complete/w10-grid.log` |
| 首次离线→联网一次 retry→reload | 离线 saving→error、零版，绝不假 saved；联网三 staging200、revision200；刷新内容保留 | `/tmp/codex-w10-offline-stable/codex-accept.log` |
| 合并 G5:H6→Undo | 按钮 false→true→false；native manifest 的 mergeData 新增/移除；各一版，原 cells 不变 | `/tmp/codex-w10-merge-final/codex-accept.log` |
| 私有 PNG 从实际素材 shelf 插入→Undo→Redo→close/reopen | 最终 drawings 1→2→1→2，耐久 data URI；三个动作三个 200；Undo/Redo editRevision 各+1；重开实际图像可见、原 cells 保留 | `/tmp/codex-w10-material-dedup-final/codex-accept.log` |
| public 模板实际 Edit→private fork→两存→close/reopen/reload | 仅一 fork、两次200，全部非覆盖源 cells 与两 mark 保留；公共原件未变 | `/tmp/codex-w10-fork-final/codex-accept.log` |
| native manifest503 故障注入 | 两次真实拒绝、无替代空白画布；CtrlS 后仍零 staging/revision | `/tmp/codex-w10-source-fail/codex-fail-closed.log` |
| 深色 | 实际 workbench `rgb(24,24,27)`、stage theme=dark；素材 shelf、图片重开目视确认 | `../evidence/W10/codex-material-dark-reopened.png` |

严格场景均对真实 post-remote cells 逐坐标保留原值；不是仅看截图或未更新的初始 probe。最终 material/fork 场景记录并断言最新 src commit 一致，操作期间无 HMR。个别开发首载 hydration/编译、Next portal 拦截 close 单列为环境记录：仅 portal 明确拦截时调用真实 close button handler，不忽略其他 editor runtime error。

### 只读 SQL 核验

- 私有验收 root `73b709be-bb23-400d-aea4-e80f206a63e5`：严格两存 baseline ordinal5→6 `e4f0aa9d`→7 `21690c97`；最终图片三个动作 ordinal18→19 `396b7200`→20 `f9bacee0`→21 `54274288`，父链连续。
- public 原件 `99300564-3b25-4857-894b-e28e155b530f` 仍 1 版。
- fork `2582122f-6795-4661-9028-50686b8860f7` 为 acceptance owner/private，恰好 3 版：`8622e1bc`→`9786979c`→`81c740f8`。全部写入只在这个私有 fork。
- 旧 b13/d8 失败实验房间保留诊断，当前 head 不当作修复验收基准；没有清房间、回写 DB 或重置用户内容。

## 测试和边界

新离线、late-stack、handler once/no-op 回归均先红后绿。实际 XLSX 往返 14/14；watch/material/wiring 聚焦批 33/33；最终 handler/stage/wiring 批 30/30；最终 text-bar 17/17。父独立最终 Grid 四文件 43/43。全仓 suite、最终 tsc 由父统一执行，本交付不另冒充全仓绿。

截图：`../evidence/W10/codex-strict-full-reload.png`、`codex-offline-error.png`、`codex-material-dark-reopened.png`、`codex-public-fork-reopened.png`。可复现脚本：`../evidence/W10/scenarios/{w10-grid,codex-accept,codex-fail-closed}.mjs`；harness mint 后运行，令牌只走 stdin，不写文件。

余项：只读卡片 owner-ready 后搜索稳定、真实 img decode、preview grant 绑定当前 root/revision。

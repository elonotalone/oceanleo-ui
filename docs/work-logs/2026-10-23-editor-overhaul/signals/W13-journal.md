# W13 journal（每条实测结论一行）

- Codex continuation [实施] `1a0704a4` 修复普通 typed GLB/PNG 保存、当前回执 CAS、幂等 flush、纯下载不发版本、对象规范栏和场景抽屉；运行时复制接线；真实空选区；零位移点选不再触发相机编辑。
- [实施/实测] `5da176b7` 兼容冷 typed 投影的 editor_manifest_url，读取失败阻止保存；真实 React hook 成功/失败回归绿。并行 index race 带入 W10 已暂存场景，立即告知 parent/W10，未改其内容、未改历史；后续统一显式 --only paths。
- [实测] `/tmp/codex-w13-save4` exit0 at205.6s：PX/RY 两编辑各 POST200，冷重开/硬刷新保留，offline PZ 报错→精确 Retry→POST200→重开保留。恰好3次同 root 提交；SQL ordinal4→5→6→7，parent链精确。
- [实测/修复] dark controls 首轮复制/删除成功，Undo 改 scene generation 后错误回退旧 CAS 导致409；`fd512b80` 改为同目标继续使用最新持久回执。真实 GLB 导出发现 AuxScene 每次重载增加，改 identity Group 的无所有权 Scene envelope；真实 Three 连续3次导出/重开 node counts[1,1,1]，既有动画/材质/灯光/贴图回归仍绿。
- [实测] `/tmp/codex-w13-controls4` 使用 V01 入口，exit0 at92.2s：深色材质面板、旁置复制、删除、Undo 各真实操作；3次提交全200，SQL ordinal10→11→12→13；独立 source.glb JSON解析确认平移/旋转与原始 Orange [0.95,0.5,0.2,1] 未被主题覆盖。
- [实施/实测] `0558a160` 保留显式标注子检查器，不再因打开含标注文档就自动虚构选区；新增混合节点/标注回归。最终 focused21+21+真实 Three9=51绿。parent 负责全仓 tsc/套件。
- [待验收] 最后附加 actual color HEX→保存→Undo→重开 流程遇非 W13 的 ProfilePageSettings 模块拆分中 compile500，已关闭自有浏览器，等 parent batch settled 后重跑。不把编译 overlay 算3D缺陷；public model fork 与素材库 scene replacement 未独立实测，不宣称通过。

- 2026-10-23 [实测] bootstrap main-only OK；开工。
- 05:2xZ [实测] 槽 05:09–05:25Z 超时（父 agent 已修连接池）；重跑后上传成功：`[W13] sample.glb` → root `1fbbe2f6-38af-416d-a59d-8fe75dbd80d7`（model_3d，ordinal 1），只 1 个 root。
- [实测] 库里 GLB 卡片显示「Placeholder image / 这份封面是 model/gltf-binary」：上传件的 preview/thumbnail rendition 就是 GLB 本身（SQL：4 个 rendition 同一 blob）。
- [读码] 3D 保存：只有出 GLB 检查点（≥64 步 / 贴图）才走 typed revision；普通保存 `deliveryUrl` 无 `artifactRevision` → `/v1/creations` upsert 进 `user_creations`（按 url 去重），不产生 artifact revision（DB 无 trigger 桥接）。违反 §5 第 5 条。

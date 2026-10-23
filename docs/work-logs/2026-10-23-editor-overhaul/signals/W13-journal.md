# W13 journal（每条实测结论一行）

- 2026-10-23 [实测] bootstrap main-only OK；开工。
- 05:2xZ [实测] 槽 05:09–05:25Z 超时（父 agent 已修连接池）；重跑后上传成功：`[W13] sample.glb` → root `1fbbe2f6-38af-416d-a59d-8fe75dbd80d7`（model_3d，ordinal 1），只 1 个 root。
- [实测] 库里 GLB 卡片显示「Placeholder image / 这份封面是 model/gltf-binary」：上传件的 preview/thumbnail rendition 就是 GLB 本身（SQL：4 个 rendition 同一 blob）。
- [读码] 3D 保存：只有出 GLB 检查点（≥64 步 / 贴图）才走 typed revision；普通保存 `deliveryUrl` 无 `artifactRevision` → `/v1/creations` upsert 进 `user_creations`（按 url 去重），不产生 artifact revision（DB 无 trigger 桥接）。违反 §5 第 5 条。

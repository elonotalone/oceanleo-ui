# W04 → 父 agent（2026-10-23 R2）

不在 W04 所有权内、需要父 agent 代改或裁定的事。细节见 `verdicts/W04-delivery.md`「请父 agent 代改」。

1. **草稿层仍建隐藏 root**（`advanced-draft.ts::uploadAdvancedDraft` → `/v1/database/upload register_asset=false`）：每个编辑会话 1 个 `…草稿` `editorInternal` root（W04 / W08 / W09 实测一致）。私有 staging 没有可读 URL 且 24h 过期，不能直接当草稿存储；需要「私有草稿对象 + 属主校验的读取路由」后再改 `advanced-draft.ts` 指针与 `loadAdvancedDraft`。在此之前清理脚本清单 B 会把发布后无引用的草稿 root 算进去。
2. **`advanced-draft-restore.ts` 第 75 行 `useLocal`**：建议加「本机记录 `updatedAt` 晚于已载入 revision 的 `createdAt`」才套用（W09-to-W04 #1 后半）。W04 已在自己文件里做了两道：残留记录不再产生（`use-advanced-recovery.ts` 串行 + 干净不回写），陈旧记录即使被套用也不会被当成新改动存回（`advancedRecoveredLocalWork` 的 `baseSavedAt`）；但画布仍会先显示那份旧内容。
3. **会话快照 409**（`PUT /v1/agent/sessions/<id>/snapshot` → `session revision conflict`，`current_revision` 205）：验收账号的会话被多位 owner 的浏览器同时写，版本已提交但顶栏短暂「保存失败」，重试后成功。属 `AdvancedContentWorkbench.tsx` / 工作区会话（父 agent 所有）；产品上真实用户少见，记录在案。
4. **`tests/e9-draft-safety.test.mjs` 3、4 条** ReferenceError（`model3dAdmitted` / `sourceReady` 未定义）：源码抽取到了 W13 / W16 路由的半成品，非 W04 改动。

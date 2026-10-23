# W13 journal（每条实测结论一行）

- [证据复核/撤回] controls4虽3×200，但undo-delete.png与独立GLB仍只有一个Cube，不能证明删除被撤销。已撤回「Undo语义通过」；源URL/日志清空等保存记账被collab history当成额外编辑步骤。
- [parent授权方案] 只在W13 route接入本地协同快照策略：按真实editRevision推进，保存记账不推新历史；readiness首次就绪/重载完成更新；applyRemote显式更新基线，不吞remote。共享adapter不改。先测试这些分支，再等parent通知稳定browser窗口，用实际mesh数量验证复制/删除/Undo，不能只看POST200。

- [根因/红→绿] controls5仍mesh1→2→1→1。真实EntityEditSession与useEntityCollab无external事件均绿；增加两次own external_revision回执后，实际hook精确复现Undo operations=[]（应clone）。typed sidecar的空checkpoint/清空journal被当成remote基准，抹掉本地selectiveUndo匹配。parent批准仅W13复用ownSavedVersionKeys完整artifact+revision忽略own已确认回执，含异步fetch竞态二次检查；真正remote补typed GLB源及版本identity，缺源/manifest失败不套空场景。新增真实hook回归和remote/failure/identity断言共13绿；共享adapter保持原样，真实Chrome mesh与冷开尚待最终复验。
- [更正] 首存退出目前无共享host缺陷证据；parent/W10独立observer未复现，未改共享权限逻辑。早先controls4只200不能证明Undo，旧pass已撤回。
- [最终实测] controls6 exit0 at133s：actual mesh1→2→1→2，3×typed200，hardreload2且无第4次phantom。fresh acceptance-token直接currenthead/sourcegrant下载durable-source.glb2756bytes，revision393db0c0-de68-41a6-81c3-4fa8829a7997，独立JSON两mesh Cube/Cube copy，parent也独立核验。
- [实测] material3蓝→橙色真实HEX/selectedcolor断言、200保存、Undo200、library重开恢复#3388cc均通过；末尾close受Next dev overlay pointer拦截超时，不标全pass。另补键盘nativeclose零写重开场景。品牌两处parent指出Three.js用户文案改用既有场景/画布，8focused绿（含actual route sourceadapter3绿），无需抽源码。parent tsc7 exit0含279b0128。
- [根因/修复] 最后freshcontext cold-open410：typed item/head a98bd07f正常，manifest checkpoint/provenance空且ops0；只读WebSocket Yjs确认room持有旧r16 aeeaa247 private URL+空provenance+clone实体1。`567be2db`先修空meta遮蔽item identity，但另一路room仍覆盖。经parent批准，`2c511c2c`仅同trusted origin/access path/source purpose+mode/完整UUID/同validateditemroot，以旧URL payload作locator hint，认证GET exactoldrevision核源格式/digest→续相同旧版本grant→真实GLB SHA256核验，保留原journal，绝不切head/清room；wrongroot/origin/purpose/malformed/server错revision/type/hash均拒。12focused绿。
- [隐私修复] 实际shelf准备发现typedGLB重经importModel→legacy uploadFile会重新公开上传；经parent批准，`d60060cc`按actualFormat bytes sniff后reuse typed GLB exactidentity/openModelUrl，与glTF闭包路径一致。actual factory先红1import→绿0import。并补exactrev GET credentials include与opaque payload8192cap；11focused绿。最后actual shelf用既有私有[V01] sample.glb，不新增公共/操作员素材，脚本阻断legacyupload防泄露。W10已settled6ed2d7bd，双owner统一freeze后最终验收。
- [终验PASS] material-close3 exit0 at39.1s，freshcontext exactoldsource grant200续签，场景ready且原蓝色保持，native键盘Close→library reopen成功，0POST。早先410与pointer阻挡分支不冒充pass；本轮完整终验关闭。
- [终验PASS] actual private shelf exit0 at68.7s：既有[V01] sample.glb卡replace→typed200，直接server download replaced.glb独立1mesh；Undo→typed200，undo-replacement.glb独立2mesh；hardreload2，恰2POST、0legacyupload、无phantom。SQL root21→22→23精确父链，final1d8e6a5a-88c6-4c1d-b707-4138c21c6327，title保持。所有自有Chrome已关并交W10。不宣称public3D fork实测。
- [最终错误本地化] 按CODEX-W13-final-errors.md及parent正式write-window，sourceError UI边界仅对3句检查点错误做明确静态tt映射，W13 copy补16语，既有copy positive count42→45，其他locale/注册/非汉字断言原样。新测试真实useModel3DSourceLoader注入错误：3句英文输出、Abort抑制、Closure code/detail（包括同文案closure负例）、未知Error/非Error fallback与16locale全部通过。加原opaque-source安全回归，focused6/6绿；无grant/auth/digest/identity/加载行为改动，无Chrome。parent/website已获settled，最终全局typecheck仍由parent负责。

- Codex continuation [实施] `1a0704a4` 修复普通 typed GLB/PNG 保存、当前回执 CAS、幂等 flush、纯下载不发版本、对象规范栏和场景抽屉；运行时复制接线；真实空选区；零位移点选不再触发相机编辑。
- [实施/实测] `5da176b7` 兼容冷 typed 投影的 editor_manifest_url，读取失败阻止保存；真实 React hook 成功/失败回归绿。并行 index race 带入 W10 已暂存场景，立即告知 parent/W10，未改其内容、未改历史；后续统一显式 --only paths。
- [实测] `/tmp/codex-w13-save4` exit0 at205.6s：PX/RY 两编辑各 POST200，冷重开/硬刷新保留，offline PZ 报错→精确 Retry→POST200→重开保留。恰好3次同 root 提交；SQL ordinal4→5→6→7，parent链精确。
- [实测/修复] dark controls 首轮复制/删除成功，Undo 改 scene generation 后错误回退旧 CAS 导致409；`fd512b80` 改为同目标继续使用最新持久回执。真实 GLB 导出发现 AuxScene 每次重载增加，改 identity Group 的无所有权 Scene envelope；真实 Three 连续3次导出/重开 node counts[1,1,1]，既有动画/材质/灯光/贴图回归仍绿。
- [实测] `/tmp/codex-w13-controls4` 使用 V01 入口，exit0 at92.2s：深色材质面板、旁置复制、删除、Undo 各真实操作；3次提交全200，SQL ordinal10→11→12→13；独立 source.glb JSON解析确认平移/旋转与原始 Orange [0.95,0.5,0.2,1] 未被主题覆盖。
- [实施/实测] `0558a160` 保留显式标注子检查器，不再因打开含标注文档就自动虚构选区；新增混合节点/标注回归。最终 focused21+21+真实 Three9=51绿。parent 负责全仓 tsc/套件。
- [待验收] 最后附加 actual color HEX→保存→Undo→重开 流程遇非 W13 的 ProfilePageSettings 模块拆分中 compile500，已关闭自有浏览器，等 parent batch settled 后重跑。不把编译 overlay 算3D缺陷；public model fork 与素材库 scene replacement 未独立实测，不宣称通过。
- [实施/实测] `e1b21f6b` parent协调短窗口原子补齐W13文案42keys×16语种，排除既有共享 Material/Animation，Scale对象不误译viewport Zoom；实际aggregate词典覆盖回归绿，总52 scoped绿。广域i18n collision2红均其他owner键，无W13。
- [待共享修复] color2实际POST200使ordinal13→14，但保存确认前退回详情页；parent在W10也观察首存退出，接手查共享MyLibraryhost。自有browser已关闭，遵parent要求共享修复前不重跑；不将该流程标pass。

- 2026-10-23 [实测] bootstrap main-only OK；开工。
- 05:2xZ [实测] 槽 05:09–05:25Z 超时（父 agent 已修连接池）；重跑后上传成功：`[W13] sample.glb` → root `1fbbe2f6-38af-416d-a59d-8fe75dbd80d7`（model_3d，ordinal 1），只 1 个 root。
- [实测] 库里 GLB 卡片显示「Placeholder image / 这份封面是 model/gltf-binary」：上传件的 preview/thumbnail rendition 就是 GLB 本身（SQL：4 个 rendition 同一 blob）。
- [读码] 3D 保存：只有出 GLB 检查点（≥64 步 / 贴图）才走 typed revision；普通保存 `deliveryUrl` 无 `artifactRevision` → `/v1/creations` upsert 进 `user_creations`（按 url 去重），不产生 artifact revision（DB 无 trigger 桥接）。违反 §5 第 5 条。

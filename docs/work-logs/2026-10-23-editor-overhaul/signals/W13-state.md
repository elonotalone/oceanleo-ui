# W13 state (接班文件)

## 当前交接（以本段为准）

- 最后产品源码 `d60060cc`（含 `567be2db`、`2c511c2c`、`279b0128`）。所有自有Chrome已关，窗口交W10；不再改src。无部署/push/操作员数据/新公共素材。
- strict保存/离线Retry：`/tmp/codex-w13-save4` exit0；dark复制/删除/Undo：`/tmp/codex-w13-controls6` exit0 at133s，实际mesh1→2→1→2、hardreload2，3×200无phantom；直接服务端`durable-source.glb`确认2mesh。
- 色值实测：material3蓝→橙200、Undo200、library重开恢复蓝强断言通过；该整轮末尾被dev overlay拦pointer，未标fullpass。最终`/tmp/codex-w13-material-close3` exit0 at39.1s，freshcontext旧room exact-source授权续签200、真实close/reopen保持蓝、0POST，已关闭410缺陷。
- actual私有shelf：`/tmp/codex-w13-shelf` exit0 at68.7s。既有[V01] sample.glb卡replace→typed200/独立持久GLB1mesh→Undo200/持久2mesh→hardreload2，0legacyupload、0phantom。SQL21→22→23精确父链，最终revision1d8e6a5a-88c6-4c1d-b707-4138c21c6327，原标题不变。
- 核心修复：own external save receipt不重置Undo基准；空typedmeta不抹itemidentity；旧room无identity的expiredopaqueURL只作same-origin/same-validatedroot/exactoldrevision locator hint，认证metadata+grant+实际SHA256验证，保留旧journal不切head；typedGLB素材复用私有identity不再legacy公开重传。完整红→绿回归已落盘。
- 最后批次：collab policy/remote13绿；source renewal+resilience/save12绿；material/opaque/dependency11绿；controls含brand5绿；stale-room3绿。parent已报告tsc7绿含279b0128，最终d60060cc全仓检查归parent。全局i18n collision2红foreign仍保留，不误宣称修复。
- 唯一明确未实测分支：public3D fork；未盲造公共fixture。报告`verdicts/CODEX-W13.md`。以下为已过期历史，不作为未完成任务执行；controls4旧Undo pass已撤回，sharedhost缺陷未证实也未修权限。
- [parent独立最终] W13十一文件50/50绿；opaque/bootstrap12/12与7/7绿；UI tsc9 exit0含2c511c2c+d60060cc+6ed2d7bd。parent独立解析shelf两份持久GLB：replace1橙Cube、Undo2蓝Cube，原平移/旋转保持。无剩余产品源码工作。

## 归档断点（2026-10-23，已由上文替代）
- [最终当前] `279b0128` own external receipt回执不能重置collab Undo基准，复用artifact+revision精确identity；真实hook红→绿13/13。`/tmp/codex-w13-controls6` exit0 at133s，真实mesh1→2→1→2，coldreload2，3×200无第4次phantom；直接服务端下载durable-source.glb(2756bytes)独立确认Cube+Cube copy，revision393db0c0-de68-41a6-81c3-4fa8829a7997。
- [材质当前] `/tmp/codex-w13-material3`实际HEX蓝→橙保存200、Undo保存200、library重开蓝色恢复断言通过；最后clean-close因Next dev overlay拦pointer超时，未假标整轮pass。已使用真实键盘激活close重跑零写close-only。两处品牌露出已原子改画布/场景，source regression绿。actual route material-source合同3/3绿，无纯为测试的产品重构。
- [注意] 以下旧状态仅保留历史；controls4最初Undo语义pass已撤回并由controls6替代；共享host退出未证实也未做权限修复；公共fork/真实shelf replacement UI未验仍须如实列限制。parent最终tsc7 exit0含279b0128。
- [最新] `e1b21f6b` W13文案册42keys×16已在parent协调的短窗口落地；52 scoped绿。共享i18n collision2红均WorkChat/Bay/CollabMedia、无W13键，已通知parent。
- [剩余] color实际POST200 ordinal13→14后宿主退出到详情页；W10首存同样复现，parent正在修共享MyLibraryhost。按parent指示，修好前不重复开browser；当前自有browser全关。完整材质编辑→Undo→重开场景已准备，使用V01入口/Tab提交/双语色值locator/对比色/clean-close无phantom断言。
- [当前交接] 产品源码 `0558a160` 最后冻结；`CODEX-W13.md` 已写，最后附加材质 HEX 操作场景等 parent 通知 unrelated Bay batch 编译稳定。自有 browser 已关闭。通过项：完整 D11 strict、dark 复制/删除/Undo、独立GLB原材质校验、51 focused。未宣称 public fork/实际素材替换通过。
- [实测] `/tmp/codex-w13-save4` exit0，SQL4→7；`/tmp/codex-w13-controls4` exit0，SQL10→13。Undo后CAS409已由fd512b80修复并真实复测3×200。manifest兼容5da176b7；显式标注栏0558a160。
- [实施] `1a0704a4`: typed GLB each save + private PNG; receipt CAS/idempotence; own-save echo guard; no-save download; canonical position/duplicate/delete; real empty context; scene settings drawer; material command contract; zero-delta orbit no dirty.
- [实测] 40 focused assertions pass (new save/control/recovery + persistence/core/gates/route-context). Parent tsc found missing duplicate method declaration; fixed in milestone.
- [实测] Initial light browser probe and first edit passed. Root ordinal1→2 SQL: source/full GLB, editor_manifest JSON, preview/thumbnail PNG; title unchanged. Strict multi-edit/reopen/offline test running (initial script close-panel locator corrected because panel auto-closes).
- [读码] salvage `abfb13bc` only added runtime duplication; toolbar wiring and typed-save fixes are still absent.
- [实测] Existing persistence/core/real Three roundtrip/gate baseline: 31 assertions pass, but they do not cover ordinary typed saves.
- [实测] New `editor-overhaul-w13-save` detects ordinary save/export defects (2 expected reds before implementation); failed-save journal retention already passes.
- [实测] Parent-reported e9 3D admission binding repaired; added failed/loading-source capture=null regression. This only changes tests.
- Plan after shared short source freeze: canonical position/duplicate/delete and actual material controls; scene-view controls move to Scene drawer; typed saves always checkpoint GLB with private PNG staging; current CAS/receipt and own-save echo retained; no authored model color changes. Then strict D11 + light/dark acceptance and CODEX-W13.

更新于 2026-10-23 05:58Z（会话中断后恢复）。

## 已确认的事实

- [实测] bootstrap 通过；验收账号已上传 `[W13] sample.glb` = artifact `1fbbe2f6-38af-416d-a59d-8fe75dbd80d7`（model_3d，rev ordinal 1；单节点 `Cube`，材质 `Orange`）。
- [实测] `/library?item=<id>` 先进只读查看器，头部铅笔（aria-label 编辑/Edit）才进编辑器（场景 `lib.mjs::enterEditor`）。
- [读码] 3D 普通保存（无 GLB 检查点）不带 `artifactRevision`，走 `/v1/creations` upsert 到 `user_creations`，**不产生 artifact revision**；只有 ≥64 步/贴图检查点才走 typed revision。
- [读码] 3D 保存用的是路由 `item` prop 当 CAS 基线；宿主若不前移 item，第 2 次 typed 保存会 409（W04 修内核，我这边加「本编辑器自己提交过的 head」）。
- [读码] W03 投影已在 main：`inspectorGroup:"position"` 子控件 → 规范 `position` 面板（A-1）；`disabled` 控件不出；我现有 id `animation`（撞规范 id）与 `exposure`（会被收进 `adjust`）必须改名。
- [读码] 主题：面板都用 `var(--card/--surface/--fg/--border)`，插件根按明暗注入，两档都会翻；舞台默认背景是作品自己的渐变（D6 不随主题）。

## 正在做

- 改编辑栏：`Model3DContextToolbar` 拆成纯函数 `model3d-selection-controls.ts`（规范 id：position 面板、duplicate、delete；特有：材质、显隐、相机/灯光参数）；没选中时不出选区（空态交给 W02 的抽屉按钮）；场景级设置进 drawers。

## 下一步

1. runtime 加 `duplicateSelected`（新模块 `model3d-duplicate.mjs`，presence spec `clone` + requiresCheckpoint）。
2. 保存：typed 件每次出 GLB 检查点 → typed revision（full + editor_manifest + PNG preview）；自提交 head 作下一次基线。
3. 文案 w13 册；测试；两档截图；保存协议浏览器实测 + SQL 核对。

## 复现命令

```bash
cd /root/projects/oceanleo-ui/docs/work-logs/2026-10-23-editor-overhaul
bash harness/mint.sh | OUT_DIR=/tmp/w13-probe THEME=light node harness/run.mjs evidence/W13/scenarios/probe-3d.mjs 1fbbe2f6-38af-416d-a59d-8fe75dbd80d7 before-light
```

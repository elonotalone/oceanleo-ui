# W13 state (接班文件)

## Codex continuation 2026-10-23
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

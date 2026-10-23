# W04 交付：保存内核（D11 D13）

2026-10-23，R1 + R2 接班。浏览器只跑了 LeoDev 槽和验收账号 `2ffeef37…`。没碰生产，没 push，`--apply` 也没跑。

## 1. 用户看得到的变化

- **每次「已保存」都对应服务器上的一个新版本。**
  - 基线会前移：`advancedSavedItem` 带上新的 `revisionId` 和 artifact。
  - doc-io 收到 409 时，只用「本标签页自己提交过的 head」重试一次。别人的新版本照样报冲突。
  - 草稿层编辑器（文档、表格、网站、游戏、3D、音频、视频、视频画布）：服务器草稿确认后 **1.5 秒**内发布版本，原来是 20 秒。版本没提交之前，顶栏一直显示「保存中」。
- **一个会话只 fork 一次。** 从公共素材打开时恰好 1 次 `:fork`，地址栏 `?item=` 换成副本，之后的保存都进这份副本（实测见 §4）。
- **中间文件不再一存一个隐藏 root。**
  - 有 typed 身份的保存，工程 JSON、交付件、封面都走私有 staging：`POST /v1/artifacts/{id}/staging` 收下字节，revision 用 blob claim 持有。
  - 例外是草稿层，见 §8.1。
- **状态如实显示。**
  - 断网：0.8 秒内显示「保存失败」，并写出原因「网络不通，稍后自动重试」，能点重试。
  - 草稿上传失败、断网时会话记录失败，也会显示「保存失败」（以前一直停在「保存中」）。
  - 版本已提交、只是会话快照撞了 409：显示「保存中」，后台重试记录，成功后显示「已保存」，不再误报「保存失败」。
- **崩溃或刷新后的恢复不再撒谎。**
  - 断网改动后刷新页面：以前重开显示「已保存」，其实什么都没发出去，服务器上也没有这处改动。现在重开会自动存上，存上之后才显示「已保存」。
  - 已被确认保存覆盖的本机副本不再残留（IndexedDB 写和删串行；文档已干净时不回写；编辑器保存后 dirty 一直不落的，也会退役副本）。
  - 比已打开版本还旧的本机副本，不会被当成新改动再存一次。
- **其它**：
  - revision metadata 透传：`artifactRevision.metadata.text_excerpt`，后端白名单。
  - 网站版本继承父版本的依赖闭包，新图片可以经 staging 带进闭包（W14）。
  - artifact-client 请求失败的三句原因补齐 16 语。

## 2. 文件清单

**oceanleo-ui（改）**
- `src/shell/advanced-session.ts`
- `src/shell/doc-editors/doc-io.ts`
- `src/shell/doc-editors/editor-own-heads.ts`（新增）
- `src/shell/artifact-client.ts`
- `src/shell/use-advanced-autosave.ts`（592 行）
- `src/shell/use-advanced-recovery.ts`
- `src/shell/advanced-autosave-display.ts`（新增）
- `src/i18n/ui/messages/editor-overhaul-copy-w04.ts`

**oceanleo-ui 测试（增）**
- `tests/editor-overhaul-w04-save-kernel.test.mjs`（13 条）
- `tests/editor-overhaul-w04-recovery-order.test.mjs`（2 条）

**oceanleo-ui 测试（改）**
- `tests/e9-draft-hook-runtime.test.mjs`
- `tests/e6-draft-hook-runtime.test.mjs`（另新增 1 条）

**oceanleo backend**
- `app/routers/artifacts_router.py`：staging 路由、save_revision 的 metadata 与闭包
- `app/editor_private_staging.py`
- `app/typed_artifact_wire.py`：网站闭包
- `app/typed_artifact_repository.py`：verify_blob_durable 处理重试
- `scripts/editor_overhaul_cleanup_20261023.py`
- 测试：`tests/test_editor_overhaul_w04_save.py`、`tests/test_editor_overhaul_w04_staged_retry.py`、`tests/test_editor_overhaul_cleanup_20261023.py`

**证据**
- `evidence/W04/scenarios/`：save-protocol、interrupted-save、draft-restore-publish、reload-extra-revision、upload-wait、explore-many、pdf-probe、db-check.sh、server-has.py、api-repro-pdf.py、api-retry-staged.py
- `evidence/W04/shots/*.png`
- `evidence/W04/*.json`

## 3. 提交号

- **ui，R1**：e1013941、8975a26a、1503b59b
- **ui，R2**：fc861223、c5e506a4、3c0dfc45、0cef89b0（后被 95ca1fbf 回退）、d1b46c17、08f1fdc7、95ca1fbf、460a2ace、42f1e1cb
- **ui，信号与证据**：552572c5、7c5b7c8e、8b56a7e7 等
- **oceanleo**：473f3d1、a396ef7、1fec5a7、62128b0
- dev 网关重启 3 次，每次都先在 journal 记了一行。

## 4. 验证

### Focused tests（ui，`/tmp/w04run.sh` 等同 _COMMON §3 的命令）

全绿的：
- editor-overhaul-w04-save-kernel 13/13
- editor-overhaul-w04-recovery-order 2/2
- e9-draft-hook-runtime 16/16
- e6-draft-hook-runtime 7/7
- e6-autosave-draft-tier 15/15
- e6-deck-draft-runtime 5/5
- e6-draft-session 8/8
- e9-draft-gates 7/7
- advanced-recovery-hook-runtime 5/5
- advanced-autosave-hook-runtime 7/7
- W2-20261021-autosave-hook 2/2
- W2-persistence-retry 4/4
- advanced-persistence-controller 8/8
- library-autosave-registration 4/4
- advanced-canva-interactions 4/4
- advanced-session 6/6

需要说明的：
- e9 / e6 里按时序等待的用例，在机器负载 11 时偶发超时；单独重跑两次都绿。
- `e9-draft-safety` 第 3、4 条是 ReferenceError（`model3dAdmitted` / `sourceReady` 未定义），来自 W13 / W16 路由的半成品源码，不是 W04 改的。

### Backend

- `.venv/bin/python -m pytest`：W04 相关 + typed_artifact 相关共 185 passed。
- 1 条失败 `test_typed_artifact_acceptance_seed::test_production_manifest_has_exact_seed_decisions`，和本改动无关。

### 类型检查

- `tsc --noEmit -p .`：剩下的错都在 W16 的 `workflow-carrier/video-project-*.ts`，W04 文件 0 错。

### i18n

- `i18n-tt-key-coverage`：W04 这一册没有缺口。闸是红的，157 条缺口都在 messages / LeoAssistant / VideoTimeline 等别人的文件里。

### API 探针

- `api-retry-staged.py`：修前 200 / 409 / **409 blob-digest-conflict**，修后 200 / 409 / 200。
- `api-repro-pdf.py --fixed --stage`：3 次保存 = 3 个 revision，0 个隐藏 root。

## 5. 保存协议 §5 逐条（浏览器 + 只读 SQL）

**文档（md，eb23423e）**
- §5.1：2 处改动各自到「已保存」，关掉重开、整页刷新后两处都在（`save-protocol-doc-doc2.json`）。
- §5.4：断网 0.8 秒内「保存失败」并写出原因；恢复网络、点重试后提交 revision，然后才显示「已保存」（`shots/doc-offline-error.png`、`shots/doc-retry-menu.png`）。
- §5.5，R2 最终版：
  - 编辑 1：staging + revision。
  - 编辑 2：先过草稿，3 秒后出 revision，之后才显示「已保存」（`shots/doc-second-save-saved.png`）。
  - 改了 2 次 = 2 个新 revision。
- 断网后刷新的场景，修后重开自动存上，`server-has.py` 确认改动在服务器上（`shots/doc-interrupted-reopened-saved.png`）。

**演示（自己库的 pptx f04b448c）**
- §5.1：加粗、删除线两次改动各自得到 revision 200。
- §5.4：断网斜体，1.7 秒「保存失败」→ 重试 → revision 200 →「已保存」（`shots/deck-offline-error.png`）。

**演示 fork（公共素材 8005de37 → 副本 0e1fa553）**
- §5.3：
  - 恰好 1 次 `:fork`，地址栏切到副本。
  - 两次改动 = 2 个 revision，都在副本上（`shots/deck-fork-saved.png`）。
  - SQL：验收账号名下这个标题恰好 1 个 root。

**图片（png e9c7803e，W09 去掉草稿层之后）**
- §5.1 / §5.5：2 次改动 = 2 个 revision 200，0 个 409。
- §5.4：断网 0.8 秒「保存失败」→ 重试 → revision 200 → 会话 409 一次，自己恢复 →「已保存」（`shots/image-after-retry.png`）。
- R2 早期那次的 `blob-digest-conflict` 已由 oceanleo 62128b0 修好。

**PDF（952e4481）**
- §5.1 / §5.5：
  - 每个图章各得到 1 个 revision 200（rev 14b67d08、1601bc48）。
  - 重开后图章都在（`shots/pdf-stamps-persisted.png`）。
  - 无隐藏 root。
- §5.4：断网 →「网络不通，稍后自动重试」→ 重试 → revision 200 →「已保存」（`save-protocol-pdf-pdf2.json`）。
- 最后一轮被槽里别人的编译错误（`MineCategoryBar`）打断：第 1 次保存后页面热重载回了详情页，没能跑完一整轮。

**隐藏 root（R2 期间，只查 `[W04]` 名下）**
- 只有 4 个 `[W04] sample.md-Edited草稿`，全部来自草稿层，见 §8.1。
- staging 路径产生的隐藏 root：0。

**清理脚本 dry-run（R1，操作员账号只读，只记计数）**
- 清单 A：4 个可见测试残留 + 10 个同源隐藏项。
- 清单 B：654 个没有任何现存 revision 引用的 editorInternal root。
- 保留 767 个（755 个字节被非隐藏 revision 使用，4 个被 id 引用，25 个被存储键引用，三类可重叠）。
- `--apply` 归父 agent。

## 6. 删掉或改写的测试，以及原因

- `e9-draft-hook-runtime`「local draft newer than server」和「pre-schema local recovery newer」：上传次数从 0 改回 1。比服务器新的本机副本是用户还没存上的改动，必须发出去。10-21 751095b2 把它改成 0，是那次修复顺带造成的回退。
- `e9-draft-hook-runtime`「generic recovery adapter …」，以及 `e6-draft-hook-runtime` 三条：
  - 旧合同是「草稿回执一到就变绿、不出版本」，现在改成「草稿回执后仍是 saving，约 1.5 秒后出版本，然后 saved」（§5：「已保存」= 服务器新版本）。
  - 「image edits turn green … without creating a published version」更名为「…only once the version is committed」。

## 7. 转给别人的事

- **W06**（`signals/W04-to-W06.md`）：PDF「加文字」的 /Contents 已写入，但外观流仍是默认文字，重开后显示「Insert」；进入编辑态之前会吞掉首字符。
- **W07 / W09**：重开或刷新之后、没有任何编辑，也会多出 1 个 revision。演示和图片都有，digest 与上一版相同或几乎相同（演示 fork ord 5/6/7、图片 ord 5/6）。
  - 不是 IndexedDB 残留（d1b46c17 之后仍复现）。
  - 怀疑是协同房间副本对齐时套用了改动（W09 已在交付里点名 use-entity-collab）。
  - 探针：`evidence/W04/scenarios/reload-extra-revision.mjs`。
- **回复 W07-to-W04**：#1 已修（oceanleo 62128b0）。#2 外壳二次 flush 由各路由的「上次回执」兜底，控制器层另有 `pending` 回执重试。#3 见 §8.1。
- **回复 W08-to-W04 / W09-to-W04**：五件事的处置见 §8；回复同时写在 `signals/W04-to-parent.md`。

## 8. 请父 agent 代改的公共文件，以及如实的剩余问题

1. **草稿层仍会建隐藏 root**（`advanced-draft.ts`，归父 agent）：每个编辑会话 1 个「…草稿」。
   - 私有 staging 没有可读 URL，而且 24 小时过期，不能直接拿来存草稿。
   - 要先有「私有草稿对象 + 带属主校验的读取路由」，再改指针和 `loadAdvancedDraft`。
   - 在那之前，清理脚本的清单 B 会把版本发布后没人引用的草稿 root 算进去。
2. **`advanced-draft-restore.ts` 第 75 行 `useLocal`**：建议加一条，本机副本的 `updatedAt` 要晚于已载入 revision 的 `createdAt` 才套用。W04 这边已经保证陈旧副本不会被存回去，但画布会先显示一下旧内容。
3. **会话快照 409**：验收账号的会话被多位 owner 同时写，`current_revision` 已经到 286。现在顶栏不再误报，但每次会多几秒「保存中」。
4. **顶栏错误提示**（W01 的 `AdvancedWorkspaceActionBar.tsx`）：`saveErrorTitle` 显示的是原始 `autoSaveError`，没有经过 `tt()`。W04 已在自己那一册补了译文，要显示时套上 `tt()` 才会翻译。
5. **深浅两档截图**：W04 没有自己的界面（保存状态槽归 W01），这次没有单独截。
6. **断网后刷新恢复时**：如果重开时还是断网，服务器草稿读不到，会显示「最新服务器草稿暂时无法恢复，自动保存已暂停。请点重试」。恢复网络后点重试即可存上。这是预期内的行为，记录在案。

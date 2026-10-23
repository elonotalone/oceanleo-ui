# V03 state（接班文件，独立验收：编辑栏与按钮 D3 D4 D9 D10）

更新：2026-10-23T05:15Z（开工）

## 已确认的事实
- [实测] bootstrap OK（main-only OK）；oceanleo-ui 在 `main`。
- [实测] 05:12Z 时 `verdicts/` 为空：还没有任何 `W*-delivery.md`；各 owner 都在读码阶段。
- [实测] 暂无 `signals/*-to-V03.md`。
- [实测] 本机 python 有 `pypdf 5.9.0`、`PIL 12.3.0`，没有 `fitz`：D4 的标准批注校验用 pypdf 解析 `/Annots`。
- [读码] 我只读 + 浏览器；只写 `evidence/V03/`、`signals/V03-*`、`verdicts/V03-verdict.md`。

## 正在做
- R0 步骤 1：读外壳编辑栏代码（SelectionToolbar / FloatingContextToolbar / EditorToolsTrigger / EditBarDocumentSegment），找 DOM 标识，写 R0 场景。

## 下一步
- R0 步骤 2：准备 `[V03]` 素材并上传（pdf docx txt md xlsx pptx png mp3 mp4 glb）。
- R0 步骤 3：逐编辑器跑基线：空态栏（D3）、选中后的栏（D9 顺序/重复图标/灰按钮）、逐按钮点测 + 撤销、PDF D4 清单。
- R0 步骤 4：写 `verdicts/V03-verdict.md`「R0 基线」并提交。

## 复现命令
```bash
cd /root/projects/oceanleo-ui/docs/work-logs/2026-10-23-editor-overhaul
bash harness/mint.sh | OUT_DIR=/tmp/v03-x THEME=light node harness/run.mjs evidence/V03/scenarios/<场景>.mjs [参数…]
```

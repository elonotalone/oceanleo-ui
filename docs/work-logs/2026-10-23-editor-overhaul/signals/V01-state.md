# V01 state（接班文件，独立验收：外壳与库 D1 D2 D3落点 D5 D7 D8）

更新：2026-10-23T05:07Z（开工）

## 已确认的事实
- [实测] bootstrap OK（main-only OK）；oceanleo-ui 在 `main`，HEAD 377b212b。
- [实测] 05:06Z 时 `verdicts/` 为空：还没有任何 `W*-delivery.md`。
- [实测] 暂无 `signals/*-to-V01.md`。
- [读码] 我只读 + 浏览器；只写 `evidence/V01/`、`signals/V01-*`、`verdicts/V01-verdict.md`。

## 正在做
- R0 步骤 1：读外壳代码，找顶栏 / `···` / 页签 / 编辑栏 / 左侧面板 / 库 Type 菜单 / 卡片的 DOM 标识，写 R0 场景。

## 下一步
- R0 步骤 2：准备 `[V01]` 素材并上传（txt md docx pdf xlsx pptx png mp3 mp4 glb）。
- R0 步骤 3：逐判据跑基线（light/dark、1024x768、zh/en）。
- R0 步骤 4：写 `verdicts/V01-verdict.md`「R0 基线」并提交。

## 复现命令
```bash
cd /root/projects/oceanleo-ui/docs/work-logs/2026-10-23-editor-overhaul
bash harness/mint.sh | OUT_DIR=/tmp/v01-x THEME=light node harness/run.mjs evidence/V01/scenarios/<场景>.mjs
```

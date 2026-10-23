# V04 state（接班文件）— 深浅两档独立视觉验收（D6 D7）

更新：2026-10-23 R0 开工

## 已确认的事实

- [实测] bootstrap 通过（main-only OK）；`oceanleo-ui` 在 `main`，开工 HEAD `89f9070f`。
- [实测] 开工时无 `signals/*-to-V04.md`，`verdicts/` 为空（无任何 W 交付）。
- [读码] 改前插件主题与站点主题解耦：`plugin-theme.tsx` 读 `localStorage["oceanleo.plugin-theme.<id>"]`，无值用本命默认（dark：audio / video-timeline / threed / game / website / video-canvas）。D7 要求改成跟随站点。
- [读码] 站点主题：`ThemeProvider.setMode` 写 `oceanleo-theme` cookie + localStorage，改 `<html>` 类名；auto 模式监听 `prefers-color-scheme` 变化。
- [读码] 设置窗是当前页的 hash 弹窗（`#settings/general`，`SettingsModalHost` 监听 hashchange/popstate），编辑器开着时可在此切站点主题（判据 5 的真实路径）。

## 正在做

- R0 基线：写场景 `evidence/V04/scenarios/`，深浅两档逐编辑器截图 + 计算色读数 + 对比度 + 不刷新切主题。

## 下一步

- 准备 `[V04]` 素材（上传 pdf docx txt md xlsx pptx png mp3 mp4 glb；deck / website / game / 视频画布从公共素材打开）。
- 写 `verdicts/V04-verdict.md` 的「R0 基线」并提交。

## 复现命令

```bash
cd /root/projects/oceanleo-ui/docs/work-logs/2026-10-23-editor-overhaul
bash harness/mint.sh | OUT_DIR=/tmp/v04-x THEME=light node harness/run.mjs evidence/V04/scenarios/<场景>.mjs [参数…]
```

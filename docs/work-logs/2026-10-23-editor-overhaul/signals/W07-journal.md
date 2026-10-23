# W07 journal

- 05:08Z [实测] 上传 `[W07] sample.pptx` → 库里成 deck（artifact `0dac8934-1f2e-454f-badc-3ff6a33a768f`，rev 1），卡片标题对、缩略图空白。
- 05:09–05:35Z [实测] 开发槽代理池满 + dev API 慢（/health 24s）→ `?item=` 落到只读预览；父 agent 已修，不算编辑器问题。
- 06:50Z [读码+tsc] 统一栏改为规范 id（`deck-edit-bar-controls.ts`），新增整框删除线 / 高亮 / 列表 / 超链接 / 两端对齐（schema + 画布 + PPTX 导出导入），抽屉收成 模板/元素/画笔/线条/便签；tsc 对演示文件 0 错。
- 07:36Z [实测] 编辑栏在浏览器里按规范顺序出（font-family…arrange，更多里 letter-spacing/clear-format/shadow/position/animation/lock/duplicate/delete）。载入中占位稿可被改且报「已保存」、改动被真文稿顶掉 → 修：载入完成前 commit/transient/gesture 一律拒绝、编辑栏不给。离线时状态停在「保存中」90s 不转「保存失败」（待复核）。

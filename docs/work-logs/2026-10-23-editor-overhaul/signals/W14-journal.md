# W14 journal

- 09:00Z [实测] 浏览器：从模板「鞋靴资讯内容站」点「编辑」即 fork 出验收账号 `5540f78f…`；网站编辑器显示「website-source 未通过 §3.1 校验(schema 11 处)」——所有整站包网站都打不开。
- 09:05Z [实测 SQL] 1828 个网站版本入口 `oceanleo.website-source.json` = 整站包清单（entrypoint index.html + files[]），内容在闭包 `site.json`（app.js 按 `pages[i].sections` 渲染）。
- 09:20Z 写 `W14-to-W04.md` R2 段：请放行 `site.json`（application/json）进网站 staging 与 sourceDependencies。
- 09:55Z [实测] 新的 site.json 编辑路径：fork `5540f78f` 在编辑器里打开，首屏按网站自己的颜色画（hero bg rgb(15,23,42)、白字、居中）；点标题出统一文字栏 `text-color align arrange duplicate delete`；切「Pro edit」后 `website-puck-stage` 还是同一个 DOM 节点（未重挂载），6 个区块都在。图片一直 loading：路由每次渲染都新建 identity 对象 → 解析器反复重建，已修。

- Codex 接班 [实测] 网站专项从 8 项扩为 10 项，全部通过：新增 strict schema 字段/对象操作与图片字节 JSON 恢复测试。修正 strict 路由假保存、同实例 undo 桥接、网站自有主题；为 site.json 编辑器补素材插入及图片恢复字节。
- Codex 接班 [实测] 首轮浏览器：图片全部加载；颜色/对齐/撤销/重做可见；父 agent 修后端后，标题、颜色、换图各得到一次真实 revision 200。中途源码热更新导致最后模式断言遇加载态，冻结源码后重跑，未计为完整验收通过。
- Codex 接班 [实测] i18n 闸 17/19 通过；两项失败属于其它 owner 文案缺失及历史基线。W14 未出现新增缺口。
- Codex 最终 [实测] 父 agent 修共享 snapshot 二次 CAS 后，浅色全场景 90s PASS（4 次编辑、4 个真实版本回执；换图后状态归 saved；刷新仍在；断网报错、恢复后点真实 Retry 成功）。深色 35.6s PASS（重开保留文字/颜色/图片，同实例模式往返，断网重试 revision200 + snapshot200）。
- Codex 最终 [实测] 安全闸 25 PASS / 1 SKIP / 1 FAIL；失败是其它 calls 测试缺 UC-n 注释，网站与 UI 安全扫描全通过。交付 `verdicts/CODEX-W14.md` 诚实列未覆盖的公共 fork/逐按钮/strict 浏览器验收。

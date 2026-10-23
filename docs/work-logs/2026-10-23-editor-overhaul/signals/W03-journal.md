# W03 journal

- 05:2xZ [实测] 投影冒烟（node，假选区）：deck 旧 id → font-panel→font-family、color→text-color、layer-up/down 合成 arrange、x/y/rotation 收进 `position` 面板、opacity 滑杆成 `opacity` 面板；edit-text 借 `case` 图标 → 改文字。A-1 写法（inspectorGroup=stroke/position）→ 入口 id=规范 id、子控件不上栏。
- 05:3xZ [实测] tsc：W03 文件 0 错（唯一错误在 W01 的 PluginMoreMenu.tsx，与我无关）。
- 06:0xZ 父 agent 抢救提交 db0d37d7 收下了接口（types / 图标 / canon 三件 / 分区改动）。
- 07:2xZ [实测] focused：edit-bar-canon-projection 7/7（新判据）、v8 10/10、v9 8/8、adaptive-layout 11/11、g2 7/7、W5 10/10、dock/gesture 一组全绿（dock-console 第 9 例、page-gate、advanced-workbench 两例红在 W02/W04/W01 的源码断言上，不是我的文件）。
- 07:3xZ [实测] 开发槽（验收账号）：演示文字栏 = font-family font-size bold italic underline strike text-color highlight align list line-height link fill stroke | 更多：letter-spacing clear-format radius opacity shadow arrange position animation lock duplicate delete；重复图标 0，触发器 0，栏 x=432 起、在缩略图栏（data-edit-bar-avoid）右侧，不重叠。浅深两档都对。
- 07:3xZ [实测] 开发槽：图片栏 = replace crop flip-x flip-y rotate radius border opacity adjust arrange position lock duplicate delete | 更多 image-fit shadow；重复图标 0，触发器 0。
- 07:3xZ [实测] 修了两处只在真页面看得到的：描边字形（三条线）像菜单键 → 粗轮廓圆角方块；「更多」里规范面板落进未翻译的「属性面板」节、层级下拉写「未选择」→ 归入规范分节、层级不写值。
- 07:4xZ 误跑 `public-api-snapshot.mjs --write` 写了快照，已用 HEAD 内容原样还原（未提交）；快照过期全部来自 W01 的 plugin-theme 导出，与我无关。

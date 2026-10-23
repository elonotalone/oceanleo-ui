# W02 journal
- 05:3xZ [实测] [W02] pdf/png/docx 已上传到验收账号（root id 见 state）。
- 06:47Z [实测] `/library?item=` 首屏是只读预览（铅笔键进编辑器）；同时段 gateway 资源 ERR_FAILED，「暂时无法加载我的库」，浏览器复现推迟到里程碑。
- 07:3xZ [实测] `/library?item=<[W02] sample.png>`（light）：修后点素材库 → 壳 aside 320px、opacity 1、无 inert；点我的库 → 换成我的库（互斥）；再点我的库 → 收起；顶栏按钮 aria-pressed 跟随。证据 /tmp/w02-img/probe-left-panels.log。
- 07:3xZ [实测] 图片编辑器开档时主图层是选中态（W09 行为），编辑栏是选区控件；Esc + 点空白后编辑栏出现「Brush Shape Lines Note」，点 Brush 打开左侧面板且按钮 aria-pressed=true。
- 07:3xZ [实测] 文档编辑器的文字栏在光标处常驻（字体/对齐…），按「无选区才显示」插入/批注永远出不来 → 加 richdoc 常驻例外。

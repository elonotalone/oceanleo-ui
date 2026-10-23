# W02 journal
- 05:3xZ [实测] [W02] pdf/png/docx 已上传到验收账号（root id 见 state）。
- 06:47Z [实测] `/library?item=` 首屏是只读预览（铅笔键进编辑器）；同时段 gateway 资源 ERR_FAILED，「暂时无法加载我的库」，浏览器复现推迟到里程碑。
- 07:3xZ [实测] `/library?item=<[W02] sample.png>`（light）：修后点素材库 → 壳 aside 320px、opacity 1、无 inert；点我的库 → 换成我的库（互斥）；再点我的库 → 收起；顶栏按钮 aria-pressed 跟随。证据 /tmp/w02-img/probe-left-panels.log。
- 07:3xZ [实测] 图片编辑器开档时主图层是选中态（W09 行为），编辑栏是选区控件；Esc + 点空白后编辑栏出现「Brush Shape Lines Note」，点 Brush 打开左侧面板且按钮 aria-pressed=true。
- 07:3xZ [实测] 文档编辑器的文字栏在光标处常驻（字体/对齐…），按「无选区才显示」插入/批注永远出不来 → 加 richdoc 常驻例外。
- 08:35Z [读码] R2：W09-to-W02 图片白名单扩成 9 项；W03-to-W02 收起小圆的 collapsedIcon 由探针读 data-selection-kind；focused test 12/12 绿。
- 08:45Z [实测] PDF 库页（light）：素材库/我的库开合互斥、宽 319、无 inert；编辑栏空态是 W06 的 10 个工具（PDF 无抽屉申报）。素材面板原先默认列 PDF（插不进去）→ 外壳兜底：只接图片的插入型编辑器（pdf/ppt/document）列图片；signals/W02-to-W06.md。
- 08:45Z [实测] 我的库切换（16:03 本地，前一轮已跑）：图片 → [W02] sample.pdf，?item= 跟着变、编辑器换成 pdf、标题出现、无报错。/tmp/w02-mine/mine-switch.log。

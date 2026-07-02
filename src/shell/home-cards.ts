"use client";

// ============================================================================
// @oceanleo/ui — 子站首页「工作内容 prompt 卡片」内容库 + 用户自建卡片持久化
// ----------------------------------------------------------------------------
// 操作员 2026-07-02 定稿（对照豆包首页）：每个功能子站首页输入框下方有两个分区：
//   ① 工作内容（prompt 卡片，分类显示）：点卡片 → 预设文字填进输入框。
//   ② agent 选择（agent 卡片）：点卡片 → 输入框左下角出现该 agent 图标+名称。
// 每类卡片的【第一张】是「新建」卡片（用户自建，持久化，重进网站仍在）。
// 每张卡片右上角有「查看/编辑」按钮。
//
// prompt 卡片事实源 = 本文件 PROMPT_LIBRARY（按 siteId 分站；没配置的站回退
// GENERIC_PROMPTS）。用户自建卡片存 localStorage（按站隔离），跨会话保留。
// ============================================================================

export interface PromptCard {
  id: string;
  /** emoji 图标 */
  icon: string;
  title: string;
  /** 卡片上的一句话描述 */
  desc: string;
  /** 点击后填进输入框的预设文字（可带 [占位] 提示用户替换） */
  prompt: string;
  /** 分类名（分类 tab 显示） */
  category: string;
  /** 用户自建卡片标记（可编辑 / 可删除） */
  custom?: boolean;
}

// --- 通用兜底集（未配置专属内容的站用它） -----------------------------------
export const GENERIC_PROMPTS: PromptCard[] = [
  { id: "g1", icon: "📝", title: "文章", desc: "撰写各平台文章", category: "工作", prompt: "帮我写一篇关于[输入主题]的文章，面向[目标读者]，篇幅约[字数]字。" },
  { id: "g2", icon: "📊", title: "总结汇报", desc: "凝练你的工作成果", category: "工作", prompt: "根据以下要点，帮我写一份工作总结汇报：[粘贴要点]" },
  { id: "g3", icon: "💡", title: "方案策划", desc: "快速产出可执行方案", category: "工作", prompt: "帮我策划一份[输入主题]的方案，包含目标、步骤、时间表和预算。" },
  { id: "g4", icon: "📢", title: "宣传文案", desc: "撰写各平台的推广文案", category: "营销", prompt: "帮我为[产品/活动]写一条吸引人的宣传文案，投放在[平台]。" },
  { id: "g5", icon: "📕", title: "社媒笔记", desc: "打造吸睛的笔记内容", category: "营销", prompt: "帮我写一篇[输入主题]的小红书笔记，带 emoji 和话题标签。" },
  { id: "g6", icon: "🎓", title: "论文", desc: "撰写专业详实的论文", category: "学习", prompt: "帮我写一篇关于[输入主题]的论文大纲，然后逐节展开。" },
  { id: "g7", icon: "✏️", title: "作文", desc: "为学生打造满分作文", category: "学习", prompt: "我是[年级]学生，帮我写一篇题为「[输入题目]」的作文，[字数]字左右。" },
  { id: "g8", icon: "🎨", title: "润色", desc: "让文字表达更出彩", category: "改写", prompt: "帮我润色下面这段文字，使它更[正式/生动/简洁]：[粘贴文字]" },
  { id: "g9", icon: "🌐", title: "翻译", desc: "地道自然的双语互译", category: "改写", prompt: "把下面的内容翻译成[目标语言]，语气自然地道：[粘贴内容]" },
];

// --- 按站专属内容 ------------------------------------------------------------
// 每站 2–4 个分类、6–10 张卡片。站点没配置时回退 GENERIC_PROMPTS。
export const PROMPT_LIBRARY: Record<string, PromptCard[]> = {
  word: [
    { id: "w1", icon: "📄", title: "长文写作", desc: "分步骤生成大纲和文档", category: "工作", prompt: "帮我写一篇关于[输入主题]的深度长文，先给大纲再逐节展开，约[字数]字。" },
    { id: "w2", icon: "📊", title: "总结汇报", desc: "凝练你的工作成果", category: "工作", prompt: "根据以下要点帮我写一份[周报/月报/季度]总结汇报：[粘贴要点]" },
    { id: "w3", icon: "🧾", title: "公文", desc: "规范严谨的公文写作", category: "工作", prompt: "帮我起草一份[通知/请示/函]，事由是[输入事由]，收文对象是[对象]。" },
    { id: "w4", icon: "💼", title: "心得体会", desc: "助你提炼归纳所感所悟", category: "工作", prompt: "我的职业是[输入职业]，帮我写一份关于[输入主题]的心得体会。" },
    { id: "w5", icon: "📢", title: "宣传文案", desc: "撰写各平台的推广文案", category: "商业营销", prompt: "帮我为[产品/活动]写一组宣传文案：一条主推语 + 三条平台变体（公众号/小红书/朋友圈）。" },
    { id: "w6", icon: "📕", title: "社媒笔记", desc: "打造吸睛的笔记内容", category: "商业营销", prompt: "帮我写一篇[输入主题]的种草笔记，标题吸睛、带 emoji 和话题标签。" },
    { id: "w7", icon: "🎓", title: "论文", desc: "撰写专业详实的论文", category: "学习教育", prompt: "帮我写一篇关于[输入主题]的论文，先出大纲（含文献综述、方法、结论），再逐节展开。" },
    { id: "w8", icon: "✏️", title: "作文", desc: "为学生打造满分作文", category: "学习教育", prompt: "我是[年级]学生，帮我写一篇题为「[输入题目]」的作文，[记叙文/议论文]，[字数]字左右。" },
    { id: "w9", icon: "📖", title: "小说", desc: "创作引人入胜的小说", category: "文学艺术", prompt: "帮我写一个[题材]短篇小说的开头三章，主角设定：[输入设定]。" },
    { id: "w10", icon: "🎨", title: "润色", desc: "让文字表达更出彩", category: "回复和改写", prompt: "帮我润色下面这段文字，使它更[正式/生动/简洁]，保持原意：[粘贴文字]" },
    { id: "w11", icon: "✉️", title: "回复邮件", desc: "得体高效的往来回复", category: "回复和改写", prompt: "帮我回复这封邮件，语气[礼貌/坚定]，要点是[输入要点]：[粘贴原邮件]" },
  ],
  image: [
    { id: "i1", icon: "🖼️", title: "海报设计", desc: "活动/产品宣传海报", category: "创作", prompt: "生成一张[活动/产品]宣传海报：主题[输入主题]，风格[简约/国潮/赛博朋克]，主色调[颜色]。" },
    { id: "i2", icon: "🎨", title: "插画", desc: "扁平/手绘/水彩插画", category: "创作", prompt: "画一幅[扁平/手绘/水彩]风格插画：[描述画面内容]。" },
    { id: "i3", icon: "👤", title: "头像", desc: "个性化社交头像", category: "创作", prompt: "帮我生成一个[动漫/写实/像素]风格头像：[描述特征，如短发戴眼镜的程序员]。" },
    { id: "i4", icon: "📦", title: "产品图", desc: "电商主图与场景图", category: "电商", prompt: "为[产品名]生成一张电商主图：白底/场景化，突出[卖点]，构图干净。" },
    { id: "i5", icon: "🏞️", title: "壁纸", desc: "手机/桌面高清壁纸", category: "创作", prompt: "生成一张[手机/桌面]壁纸：[描述主题与氛围]，高清细节。" },
    { id: "i6", icon: "🔁", title: "以图生图", desc: "参考图改风格/扩展", category: "编辑", prompt: "参考我上传的图片，把它改成[目标风格]，保留主体构图。（先在输入框左侧「＋」上传图片）" },
  ],
  video: [
    { id: "v1", icon: "🎬", title: "短视频", desc: "文生视频快速出片", category: "创作", prompt: "生成一段[时长]秒短视频：[描述画面与运镜]，风格[写实/动画]。" },
    { id: "v2", icon: "📱", title: "口播脚本", desc: "带分镜的口播脚本", category: "脚本", prompt: "帮我写一个[平台]口播短视频脚本：主题[输入主题]，60 秒内，含分镜与台词。" },
    { id: "v3", icon: "🛍️", title: "带货视频", desc: "产品种草视频创意", category: "营销", prompt: "为[产品名]策划一条带货短视频：钩子开头 + 三个卖点演示 + 行动号召。" },
    { id: "v4", icon: "🖼️", title: "图生视频", desc: "让静态图动起来", category: "创作", prompt: "把我上传的图片变成动态视频：[描述想要的运动效果]。（先在输入框左侧「＋」上传图片）" },
  ],
  ppt: [
    { id: "p1", icon: "📊", title: "工作汇报", desc: "结构清晰的汇报 PPT", category: "职场", prompt: "帮我生成一份[季度工作汇报]PPT：部门[输入部门]，要点[粘贴要点]，10 页左右。" },
    { id: "p2", icon: "🚀", title: "路演融资", desc: "打动投资人的 BP", category: "商业", prompt: "帮我做一份创业路演 PPT：项目[一句话介绍]，包含痛点、方案、市场、商业模式、团队、融资计划。" },
    { id: "p3", icon: "🏫", title: "课件", desc: "教学课件一键生成", category: "教育", prompt: "帮我做一份[学科][课题]的教学课件 PPT，面向[年级]，含例题与互动问题。" },
    { id: "p4", icon: "📋", title: "方案提案", desc: "客户提案专业呈现", category: "商业", prompt: "帮我做一份给客户的[项目提案]PPT：背景、目标、方案、报价、里程碑。" },
  ],
  excel: [
    { id: "e1", icon: "📈", title: "数据分析", desc: "上传表格智能分析", category: "分析", prompt: "分析我上传的表格数据：给出关键趋势、异常点和 3 条可执行建议。（先在输入框左侧「＋」上传文件）" },
    { id: "e2", icon: "🧮", title: "公式助手", desc: "一句话生成公式", category: "公式", prompt: "我想在 Excel 里实现：[描述需求，如按部门汇总销售额并排名]，给我公式和使用说明。" },
    { id: "e3", icon: "📋", title: "表格生成", desc: "从需求直接建表", category: "生成", prompt: "帮我生成一张[用途]表格：需要的列是[列出字段]，附 10 行示例数据。" },
    { id: "e4", icon: "📅", title: "计划表", desc: "项目/学习计划表", category: "生成", prompt: "帮我制作一份[项目/学习]计划表：目标[输入目标]，周期[时长]，按周拆解。" },
  ],
  resume: [
    { id: "r1", icon: "📄", title: "简历生成", desc: "从经历生成专业简历", category: "简历", prompt: "根据我的经历帮我生成一份简历：[粘贴教育背景、工作经历、技能]，目标岗位[岗位名]。" },
    { id: "r2", icon: "✨", title: "简历优化", desc: "让 HR 眼前一亮", category: "简历", prompt: "帮我优化这份简历，突出与[目标岗位]匹配的亮点，量化成果：[粘贴简历内容]" },
    { id: "r3", icon: "✉️", title: "求职信", desc: "定制化求职信", category: "求职", prompt: "帮我写一封应聘[公司][岗位]的求职信，结合我的背景：[一句话背景]。" },
    { id: "r4", icon: "🎤", title: "面试准备", desc: "高频问题模拟回答", category: "求职", prompt: "我要面试[岗位]，帮我准备 10 个高频面试问题和参考回答思路。" },
  ],
  chat: [
    { id: "c1", icon: "💬", title: "头脑风暴", desc: "多角度打开思路", category: "思考", prompt: "跟我一起头脑风暴：[输入主题]，先给 10 个不同方向的点子。" },
    { id: "c2", icon: "🧠", title: "深度解读", desc: "把复杂概念讲透", category: "思考", prompt: "用通俗的语言给我讲透[输入概念]，配一个生活化例子。" },
    { id: "c3", icon: "🗺️", title: "旅行规划", desc: "行程路线一键规划", category: "生活", prompt: "帮我规划[目的地][天数]天行程：预算[金额]，偏好[美食/人文/自然]。" },
    { id: "c4", icon: "⚖️", title: "决策助手", desc: "利弊分析辅助决策", category: "思考", prompt: "帮我分析要不要[输入决策]：列出利弊、风险和建议。" },
  ],
  music: [
    { id: "m1", icon: "🎵", title: "作曲", desc: "文字描述生成音乐", category: "创作", prompt: "生成一段[风格]音乐：情绪[欢快/舒缓/史诗]，用途[视频配乐/助眠]，时长[秒]。" },
    { id: "m2", icon: "🎤", title: "写歌词", desc: "原创歌词创作", category: "创作", prompt: "帮我写一首[主题]的歌词，风格[流行/民谣/说唱]，含主歌副歌结构。" },
    { id: "m3", icon: "🎧", title: "配乐建议", desc: "为内容匹配音乐", category: "应用", prompt: "我在做[视频/播客]，主题是[输入主题]，帮我建议配乐风格并生成一段。" },
  ],
  law: [
    { id: "l1", icon: "📜", title: "合同审查", desc: "找出风险条款", category: "合同", prompt: "帮我审查这份合同，指出风险条款和修改建议：[粘贴合同或上传文件]" },
    { id: "l2", icon: "✍️", title: "合同起草", desc: "常用合同快速起草", category: "合同", prompt: "帮我起草一份[租房/劳务/合作]合同：甲方[名称]，乙方[名称]，核心条款[输入要点]。" },
    { id: "l3", icon: "⚖️", title: "法律咨询", desc: "通俗解答法律问题", category: "咨询", prompt: "我遇到的情况是：[描述情况]。请从法律角度分析我的权利和可行方案。" },
    { id: "l4", icon: "📩", title: "律师函", desc: "正式法律文书", category: "文书", prompt: "帮我起草一份关于[事由]的律师函/催告函，事实经过：[输入经过]。" },
  ],
  paper: [
    { id: "pa1", icon: "🎓", title: "论文大纲", desc: "选题到大纲一步到位", category: "写作", prompt: "我的论文选题是[输入选题]，帮我生成详细大纲（含研究方法与文献框架）。" },
    { id: "pa2", icon: "📚", title: "文献综述", desc: "综述框架与写作", category: "写作", prompt: "帮我写[研究领域]的文献综述框架，归纳主要流派和研究缺口。" },
    { id: "pa3", icon: "🔍", title: "降重润色", desc: "学术表达优化", category: "润色", prompt: "帮我把这段论文改写得更学术、降低重复率，保持原意：[粘贴段落]" },
    { id: "pa4", icon: "🌍", title: "英文摘要", desc: "地道学术英语", category: "润色", prompt: "把我的中文摘要翻译成地道的学术英文：[粘贴摘要]" },
  ],
  study: [
    { id: "s1", icon: "📖", title: "知识讲解", desc: "把难点讲明白", category: "学习", prompt: "用最通俗的方式给我讲解[知识点]，配例题和易错点。" },
    { id: "s2", icon: "🗓️", title: "学习计划", desc: "目标拆解到每天", category: "学习", prompt: "帮我制定[考试/技能]学习计划：目标[输入目标]，每天可用[小时]小时，周期[时长]。" },
    { id: "s3", icon: "❓", title: "出题测验", desc: "自测巩固知识", category: "练习", prompt: "根据[知识点/章节]给我出 10 道题（选择+简答），做完后帮我批改讲解。" },
    { id: "s4", icon: "🃏", title: "记忆卡片", desc: "重点变记忆卡", category: "练习", prompt: "把[知识点/粘贴内容]整理成 20 张问答记忆卡片，正面问题背面答案。" },
  ],
  novel: [
    { id: "n1", icon: "📖", title: "小说开篇", desc: "抓人的黄金三章", category: "创作", prompt: "帮我写一部[题材]小说的前三章：主角[设定]，核心冲突[一句话]。" },
    { id: "n2", icon: "🗺️", title: "世界观设定", desc: "构建完整世界观", category: "设定", prompt: "帮我构建一个[奇幻/科幻/都市]世界观：地理、势力、规则体系、主要矛盾。" },
    { id: "n3", icon: "👥", title: "人物小传", desc: "立体的角色档案", category: "设定", prompt: "帮我写[角色名]的人物小传：性格、背景、动机、成长弧线。" },
    { id: "n4", icon: "🔀", title: "情节推演", desc: "卡文时的破局器", category: "创作", prompt: "我的故事写到：[粘贴当前情节]。帮我推演 3 种后续走向，各有反转。" },
  ],
  script: [
    { id: "sc1", icon: "🎬", title: "短剧脚本", desc: "爆款短剧结构", category: "创作", prompt: "帮我写一集[题材]短剧脚本：3 分钟内，含钩子、冲突、反转，场景对白完整。" },
    { id: "sc2", icon: "📱", title: "口播稿", desc: "涨粉口播文案", category: "自媒体", prompt: "帮我写一条[主题]口播稿：60 秒，开头 3 秒抓人，结尾引导关注。" },
    { id: "sc3", icon: "🎭", title: "分镜脚本", desc: "画面感十足的分镜", category: "创作", prompt: "把这个故事改成分镜脚本（镜号/景别/画面/台词/时长）：[粘贴故事梗概]" },
  ],
  design: [
    { id: "d1", icon: "🎨", title: "设计生成", desc: "描述即出设计稿", category: "创作", prompt: "帮我设计一张[海报/banner/卡片]：主题[输入主题]，风格[简约/孟菲斯/国潮]，尺寸[规格]。" },
    { id: "d2", icon: "🧩", title: "配色方案", desc: "专业配色建议", category: "辅助", prompt: "为我的[品牌/页面]推荐 3 套配色方案：调性[高级/活泼/科技]，给出色值。" },
    { id: "d3", icon: "📐", title: "版式建议", desc: "布局优化意见", category: "辅助", prompt: "看看我上传的设计稿，从版式、层级、留白角度给出改进建议。（先上传图片）" },
  ],
  logo: [
    { id: "lo1", icon: "⭕", title: "Logo 设计", desc: "品牌标识快速出稿", category: "创作", prompt: "为[品牌名]设计 logo：行业[输入行业]，风格[极简/图形/字标]，主色[颜色]。" },
    { id: "lo2", icon: "🔤", title: "字体标", desc: "文字型 logo", category: "创作", prompt: "为[品牌名]设计一个字体 logo，气质[现代/复古/手写]，附黑白稿。" },
    { id: "lo3", icon: "📛", title: "品牌起名", desc: "好记有内涵的名字", category: "品牌", prompt: "我在做[行业/产品]，帮我起 10 个品牌名：好记、可注册、有寓意，附一句 slogan。" },
  ],
  interior: [
    { id: "in1", icon: "🛋️", title: "客厅设计", desc: "效果图快速生成", category: "设计", prompt: "帮我设计[面积]㎡客厅：风格[奶油风/原木/现代简约]，需求[收纳多/亲子友好]，生成效果图。" },
    { id: "in2", icon: "🛏️", title: "卧室改造", desc: "小空间大利用", category: "设计", prompt: "我的卧室[面积]㎡，想改成[风格]，预算[金额]，给我布局方案和效果图。" },
    { id: "in3", icon: "📋", title: "装修清单", desc: "预算分项不踩坑", category: "规划", prompt: "帮我做[面积]㎡[新房/旧改]装修预算清单：总预算[金额]，按硬装/软装/家电分项。" },
  ],
  meeting: [
    { id: "me1", icon: "🎙️", title: "会议纪要", desc: "录音转纪要", category: "纪要", prompt: "帮我把会议录音整理成纪要：按议题分组、提炼决议和待办。（点输入框右侧录音键开始录制）" },
    { id: "me2", icon: "📋", title: "议程策划", desc: "高效会议议程", category: "筹备", prompt: "帮我策划[主题]会议议程：时长[分钟]，参会人[角色]，输出议程表和主持稿。" },
    { id: "me3", icon: "✅", title: "待办跟进", desc: "行动项一目了然", category: "纪要", prompt: "从这份纪要里提取所有行动项（负责人/截止时间/优先级）：[粘贴纪要]" },
  ],
  search: [
    { id: "se1", icon: "🔍", title: "深度调研", desc: "全网信息聚合", category: "调研", prompt: "帮我深度调研[输入主题]：搜集最新信息，交叉验证后给出结构化报告。" },
    { id: "se2", icon: "📊", title: "竞品分析", desc: "知己知彼", category: "调研", prompt: "帮我分析[产品/公司]的竞品格局：主要玩家、定价、差异化，附对比表。" },
    { id: "se3", icon: "📰", title: "热点追踪", desc: "最新动态一网打尽", category: "资讯", prompt: "帮我搜集[领域]最近一周的重要动态，按影响力排序并解读。" },
  ],
  money: [
    { id: "mo1", icon: "💰", title: "理财规划", desc: "个人财务健康", category: "规划", prompt: "我的月收入[金额]，支出[金额]，帮我做一份理财规划：应急金、投资配比、目标储蓄。" },
    { id: "mo2", icon: "📈", title: "投资分析", desc: "标的多维解读", category: "分析", prompt: "帮我分析[标的/行业]的投资逻辑：基本面、风险点、适合的仓位策略（不构成投资建议）。" },
    { id: "mo3", icon: "🧾", title: "记账分析", desc: "花钱花在哪了", category: "分析", prompt: "分析我上传的账单：分类支出占比、异常消费、3 条省钱建议。（先上传账单文件）" },
  ],
  bizdev: [
    { id: "b1", icon: "🚀", title: "商业计划", desc: "从想法到 BP", category: "创业", prompt: "我的创业想法是[一句话]，帮我完善成商业计划：痛点、方案、市场规模、商业模式、里程碑。" },
    { id: "b2", icon: "🎯", title: "增长策略", desc: "获客与留存打法", category: "增长", prompt: "我的产品是[描述]，目标用户[人群]，帮我设计 3 套低成本获客方案。" },
    { id: "b3", icon: "🤝", title: "商务谈判", desc: "话术与策略准备", category: "商务", prompt: "我要和[对象]谈[合作事项]，帮我准备谈判策略：底线、筹码、开场话术、让步阶梯。" },
  ],
  ecommerce: [
    { id: "ec1", icon: "🛍️", title: "商品文案", desc: "转化率优先的详情", category: "文案", prompt: "为[商品名]写电商详情页文案：卖点[列出卖点]，目标人群[人群]，含标题、五点描述。" },
    { id: "ec2", icon: "📸", title: "主图方案", desc: "点击率更高的主图", category: "视觉", prompt: "为[商品名]设计电商主图：突出[核心卖点]，风格[简约/促销]，生成图片。" },
    { id: "ec3", icon: "📊", title: "选品分析", desc: "数据驱动选品", category: "运营", prompt: "帮我分析[类目]的选品机会：热销趋势、价格带、差异化切入点。" },
  ],
  converter: [
    { id: "co1", icon: "🔄", title: "格式转换", desc: "文档/图片/音视频", category: "转换", prompt: "把我上传的文件转换成[目标格式]。（先在输入框左侧「＋」上传文件）" },
    { id: "co2", icon: "📑", title: "PDF 提取", desc: "提取表格与文字", category: "提取", prompt: "从我上传的 PDF 里提取[表格/文字]，整理成[Excel/Markdown]。（先上传文件）" },
    { id: "co3", icon: "🗜️", title: "批量处理", desc: "批量转换与压缩", category: "转换", prompt: "把我上传的多个文件批量[转换成目标格式/压缩]，保持文件名对应。（先上传文件）" },
  ],
  aihuman: [
    { id: "ah1", icon: "🧑‍💼", title: "数字人口播", desc: "输入文案出视频", category: "创作", prompt: "用数字人为我播报这段文案：[粘贴文案]，形象[职业/亲和]，语速适中。" },
    { id: "ah2", icon: "🎙️", title: "配音", desc: "多音色文字转语音", category: "创作", prompt: "把这段文字转成语音：[粘贴文字]，音色[温柔女声/沉稳男声]，用于[视频/广播]。" },
    { id: "ah3", icon: "📺", title: "带货口播", desc: "电商直播口播稿", category: "应用", prompt: "为[产品名]写一段数字人带货口播稿并生成视频：30 秒，突出[卖点]。" },
  ],
  threed: [
    { id: "t1", icon: "🧊", title: "3D 模型", desc: "文字生成 3D 资产", category: "创作", prompt: "生成一个[物体描述]的 3D 模型：风格[写实/卡通/低多边形]，用途[游戏/展示]。" },
    { id: "t2", icon: "🖼️", title: "图生 3D", desc: "从图片重建模型", category: "创作", prompt: "根据我上传的图片生成对应的 3D 模型。（先在输入框左侧「＋」上传图片）" },
    { id: "t3", icon: "🏠", title: "场景搭建", desc: "3D 场景概念", category: "应用", prompt: "帮我设计一个[场景描述]的 3D 场景方案：布局、材质、光照建议。" },
  ],
  make: [
    { id: "mk1", icon: "🎨", title: "定制设计", desc: "T恤/杯子/周边图案", category: "创作", prompt: "帮我设计一个印在[T恤/马克杯/帆布袋]上的图案：主题[输入主题]，风格[潮流/可爱/极简]。" },
    { id: "mk2", icon: "🎁", title: "礼品创意", desc: "有心意的定制礼", category: "创意", prompt: "我想给[对象]定制一份[节日/纪念日]礼物，预算[金额]，给我 5 个定制创意和设计初稿。" },
    { id: "mk3", icon: "🏷️", title: "品牌周边", desc: "企业周边套装", category: "创意", prompt: "为[品牌名]设计一套企业周边（帆布袋+贴纸+徽章）：品牌色[颜色]，调性[年轻/商务]。" },
  ],
  website: [
    { id: "ws1", icon: "🌐", title: "建站", desc: "描述需求生成网站", category: "建站", prompt: "帮我做一个[类型]网站：名称[站名]，核心功能[列出功能]，风格[简约/科技/温暖]。" },
    { id: "ws2", icon: "📝", title: "落地页", desc: "高转化落地页", category: "建站", prompt: "为[产品/活动]做一个落地页：核心卖点[卖点]，含 hero 区、功能区、FAQ、CTA。" },
    { id: "ws3", icon: "✍️", title: "网站文案", desc: "首页文案与 slogan", category: "文案", prompt: "为我的[产品]官网写文案：slogan、副标题、三个功能区块的标题和描述。" },
  ],
  agent: [
    { id: "ag1", icon: "🤖", title: "组建专家团", desc: "多专家协作攻坚", category: "协作", prompt: "帮我组一个专家团完成：[描述目标]。请规划需要哪些专家角色并开始协作。" },
    { id: "ag2", icon: "🧑‍💻", title: "代码助手", desc: "写代码/查 bug", category: "开发", prompt: "帮我实现：[描述功能需求]，技术栈[语言/框架]，给出可运行代码。" },
    { id: "ag3", icon: "📄", title: "文档专家", desc: "结构化长文档", category: "写作", prompt: "让文档专家帮我写：[主题]，输出结构化长文档（含目录）。" },
  ],
};

/** 站点的内置 prompt 卡片（没配置的站回退通用集）。 */
export function promptCardsForSite(siteId: string): PromptCard[] {
  return PROMPT_LIBRARY[(siteId || "").trim()] || GENERIC_PROMPTS;
}

// --- 用户自建卡片（localStorage 持久化，按站隔离） ---------------------------
const CUSTOM_KEY = (siteId: string) => `oceanleo_home_prompts:${siteId || "default"}`;

export function loadCustomPromptCards(siteId: string): PromptCard[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_KEY(siteId));
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((c) => c && typeof c === "object" && c.id && c.title && c.prompt)
      .map((c) => ({ ...c, custom: true }) as PromptCard);
  } catch {
    return [];
  }
}

export function saveCustomPromptCards(siteId: string, cards: PromptCard[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      CUSTOM_KEY(siteId),
      JSON.stringify(cards.map((c) => ({ ...c, custom: true }))),
    );
  } catch {
    /* storage full / private mode — 忽略 */
  }
}

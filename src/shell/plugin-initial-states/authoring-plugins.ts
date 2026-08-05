/**
 * 五件「空结构 + 一个明确的第一个动作」：
 * 口播脚本、话术分支、自测卷、合同装配、检索式构造。
 *
 * 五份插件文档在第 5 格里写的是同一件事的五个版本：
 * **旧族 §8 那套下限是「一份要上货架的成品」的合格线，不是用户第一次点开该看到的东西。**
 * 自测卷要 20 题、话术分支要 16 节点 20 边覆盖 5 类推托、口播脚本要 8 段 500 字、
 * 合同装配要 18 条条款 8 类目、检索式构造要 3 块每块 4 词 2 方言。
 * 照那套口径渲染，用户第一眼看到的就是五到八条「不合格」。**整节作废。**
 *
 * 所以这五份的第一屏统一是：
 *
 * 1. **插件自己的规则参数带出厂值**——及格线 0.6、语速 216 字/分、定金上限 20 %、
 *    截词最短前缀 4 字符。这些是插件的结构，不是别人的内容，用户不会想删。
 * 2. **用户内容的计数一律 0**——0 题、0 句、0 段、0 条条款、0 个概念块。
 * 3. **凡是「还没开始」而不是「算出来是 0」的读数显示「—」**：
 *    风险分、得分率、推托覆盖度、每块平均词条都走除零回空
 *    （`doc-plugin-kit.ts` 头部第一条）。反过来「未作答 = 题数 − 已答数 = 0」
 *    是真零，就照实写 0。
 * 4. **第一屏不出现任何红**。用来说明「下一步做什么」的规则一律 `severity: "info"`；
 *    真正的阻断（超时超过三倍容差、装配未填占位符）留给导出那一刻，
 *    这与五份文档「门槛只在导出/演练时生效」的措辞一致。
 */

import {
  CREATED_AT,
  GUARD,
  INTERACTIONS,
  THEME,
  constantNode,
  oceanleoAttribution,
  type DocState,
} from "./doc-plugin-kit";

/**
 * 口播脚本。第一屏是**一份空的时长预算**：语速已经有值（216 字/分，标准口播），
 * 目标时长空着等填。
 *
 * 目标时长为什么不给默认值：它是这条片子的第一个业务决定，替用户猜一个数
 * 会让他以为已经定了（`voiceover-script.md` §6 第 2 条）。
 * 于是 `target_seconds` 出厂为 0，而 0 秒的片子能说 0 个字——这个 0 是真的，
 * 不需要伪装成「—」。填进 90 秒的瞬间预算跳到 324 字，那一跳本身就是这台工具的自我介绍。
 *
 * 自校验样例（`voiceover-script.md` §11 末行，可直接当回归基线）：
 * 72 字 @ 216 字/分 = 20.000 秒；加 400 ms 停顿 = 20.400 秒；25 fps 下 40.000 ms 一帧。
 */
export const VOICEOVER_SCRIPT_INITIAL_STATE: DocState = {
  pluginId: "voiceover-script",
  displayName: "口播脚本",
  kernel: "interactive-doc",
  contentType: "interactive_doc",
  title: "口播时长预算与字幕切分",
  firstScreen:
    "两个旋钮：这条片子要多长（空着等填）、打算说多快（已有值，216 字/分钟）。一条还没有刻度的时间轴，一个空的段落区，以及语速档、帧率、字幕可读性上限三张常驻参照表。",
  firstAction: "填目标时长",
  builtInData: Object.freeze([]),
  project: {
    schema: "oceanleo.interactive-doc.v1",
    version: 1,
    metadata: {
      title: "口播时长预算与字幕切分",
      summary:
        "先定时长与语速，算出总共能说多少字；一段段写进来，随时看到还剩多少秒。",
      locale: "zh-CN",
      docKind: "calculator",
      createdAt: CREATED_AT,
    },
    theme: THEME,
    parameters: [
      {
        id: "target_seconds",
        label: "这条片子要多长",
        help: "值域 15–3600 秒。出厂不预置：它是这条片子的第一个决定，得你自己定。",
        kind: "number",
        unit: "秒",
        min: 0,
        max: 3600,
        step: 5,
        precision: 2,
        default: 0,
        control: "input",
      },
      {
        id: "speech_rate_cpm",
        label: "打算说多快",
        help: "标准口播 216 字/分钟（3.6 字/秒）。中文值域 150–320。",
        kind: "number",
        unit: "字/分钟",
        min: 150,
        max: 320,
        step: 6,
        precision: 0,
        default: 216,
        control: "slider",
      },
      {
        id: "tolerance_seconds",
        label: "容差",
        help: "不超容差算达标；超过容差三倍会挡住导出。",
        kind: "number",
        unit: "秒",
        min: 0.5,
        max: 30,
        step: 0.5,
        precision: 1,
        default: 3,
        control: "stepper",
      },
      {
        id: "frame_rate",
        label: "帧率",
        kind: "enum",
        options: [
          { value: 24, label: "24 fps（41.667 ms 一帧）" },
          { value: 25, label: "25 fps（40.000 ms 一帧）" },
          { value: 30, label: "30 fps（33.333 ms 一帧）" },
        ],
        default: 25,
        control: "select",
      },
      {
        id: "pause_ms",
        label: "段后停顿",
        help: "改语速时口播部分变、停顿部分不变。转场段惯例 700 ms。",
        kind: "integer",
        unit: "毫秒",
        min: 0,
        max: 5000,
        step: 50,
        default: 400,
        control: "stepper",
      },
      {
        id: "segment_count",
        label: "已写段落",
        kind: "integer",
        unit: "段",
        min: 0,
        max: 200,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "written_chars",
        label: "已写字数",
        help: "汉字与全角标点各计 1；连续拉丁字母串按 2.5 字符折算 1 字。",
        kind: "integer",
        unit: "字",
        min: 0,
        max: 100000,
        step: 10,
        default: 0,
        control: "input",
      },
    ],
    computations: [
      {
        id: "chars_per_second",
        label: "有效语速",
        expression: "speech_rate_cpm / 60",
        unit: "字/秒",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "word_budget",
        label: "总共能说多少字",
        // 目标时长填 0 时预算就是 0 字 —— 这是真值，不是「还没算」，
        // 所以这里不走除零回空。填进 90 秒立刻变 324 字。
        expression: "target_seconds * chars_per_second",
        unit: "字",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "remaining_words",
        label: "预算余量",
        expression: "word_budget - written_chars",
        unit: "字",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "spoken_ms",
        label: "口播时长",
        expression: "written_chars / chars_per_second * 1000",
        unit: "毫秒",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "pause_total_ms",
        label: "停顿合计",
        expression: "segment_count * pause_ms",
        unit: "毫秒",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "total_ms",
        label: "总时长",
        expression: "spoken_ms + pause_total_ms",
        unit: "毫秒",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "total_seconds",
        label: "总时长（秒）",
        expression: "total_ms / 1000",
        unit: "秒",
        precision: 3,
        guard: GUARD,
      },
      {
        id: "overrun_seconds",
        label: "超出量",
        expression: "total_seconds - target_seconds",
        unit: "秒",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "frame_ms",
        label: "单帧时长",
        expression: "1000 / frame_rate",
        unit: "毫秒",
        precision: 3,
        guard: GUARD,
      },
      {
        id: "total_frames",
        label: "总帧数",
        expression: "round(total_ms / frame_ms, 0)",
        unit: "帧",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "average_segment_chars",
        label: "每段平均字数",
        // 还没有段落时这里显示「—」：0 段的平均字数不是 0，是没有。
        expression: "written_chars / segment_count",
        unit: "字",
        precision: 1,
        guard: GUARD,
      },
      constantNode("rate_slow", "慢速讲解", "168", "字/分钟", 0),
      constantNode("rate_standard", "标准口播", "216", "字/分钟", 0),
      constantNode("rate_fast", "偏快", "264", "字/分钟", 0),
      constantNode("rate_very_fast", "极快（须配字幕）", "312", "字/分钟", 0),
      constantNode("subtitle_min_dwell_ms", "单条字幕最短驻留", "1000", "毫秒", 0),
      constantNode("subtitle_max_dwell_ms", "单条字幕最长驻留", "7000", "毫秒", 0),
      constantNode("subtitle_max_cps", "中文字符率上限", "9", "字/秒", 0),
      constantNode("subtitle_line_chars", "中文每行上限", "16", "字", 0),
      constantNode("subtitle_min_gap_frames", "相邻字幕最小间隙", "2", "帧", 0),
      constantNode("teleprompter_line_chars", "提词器行宽", "28", "字", 0),
    ],
    blocks: [
      {
        id: "intro",
        kind: "prose",
        span: 12,
        text: "这份脚本还没有一个字，但它现在已经有用了：先告诉它这条片子要多长，它立刻告诉你按当前语速总共能说多少字。这是本工具与写字工具最大的区别——写字工具不知道一段话念出来要多少秒。填完目标时长，时间轴才画得出刻度；再一段段把文案贴进来，每贴一段，时间轴上多一个色块，预算余量跟着扣。语速留了默认值 216 字每分钟，也就是每秒 3.6 个字，这是标准口播的通用基准，可以按片子的调性改；目标时长没有默认值，因为那是这条片子的第一个业务决定，替你猜一个数会让你以为已经定了。停顿不随语速缩放：改语速时口播那部分变，段后停顿那部分不变。全部时间码对齐到帧，不对齐会与剪辑时间线逐段累积错位。",
      },
      {
        id: "budget",
        kind: "parameter-panel",
        span: 12,
        title: "时长预算（先填第一格）",
        parameterIds: [
          "target_seconds",
          "speech_rate_cpm",
          "tolerance_seconds",
          "frame_rate",
          "pause_ms",
        ],
      },
      {
        id: "written",
        kind: "parameter-panel",
        span: 12,
        title: "已写进来的内容",
        parameterIds: ["segment_count", "written_chars"],
      },
      {
        id: "metric-budget",
        kind: "metric",
        span: 3,
        title: "总共能说",
        bind: "word_budget",
      },
      {
        id: "metric-remaining",
        kind: "metric",
        span: 3,
        title: "预算余量",
        bind: "remaining_words",
      },
      {
        id: "metric-total",
        kind: "metric",
        span: 3,
        title: "总时长（秒）",
        bind: "total_seconds",
      },
      {
        id: "metric-overrun",
        kind: "metric",
        span: 3,
        title: "超出量",
        bind: "overrun_seconds",
      },
      {
        id: "timeline-detail",
        kind: "table",
        span: 12,
        title: "时间轴读数",
        table: {
          rows: [
            { label: "有效语速", bind: "chars_per_second", emphasis: "none" },
            { label: "口播时长", bind: "spoken_ms", emphasis: "none" },
            { label: "停顿合计", bind: "pause_total_ms", emphasis: "none" },
            { label: "每段平均字数", bind: "average_segment_chars", emphasis: "none" },
            { label: "单帧时长", bind: "frame_ms", emphasis: "none" },
            { label: "总帧数", bind: "total_frames", emphasis: "none" },
            { label: "总时长（毫秒）", bind: "total_ms", emphasis: "total" },
          ],
        },
      },
      {
        id: "rate-table",
        kind: "table",
        span: 6,
        title: "语速档参照",
        table: {
          rows: [
            { label: "慢速讲解", bind: "rate_slow", emphasis: "none" },
            { label: "标准口播（默认）", bind: "rate_standard", emphasis: "none" },
            { label: "偏快", bind: "rate_fast", emphasis: "none" },
            { label: "极快", bind: "rate_very_fast", emphasis: "none" },
          ],
        },
      },
      {
        id: "subtitle-table",
        kind: "table",
        span: 6,
        title: "字幕可读性上限",
        table: {
          rows: [
            { label: "最短驻留", bind: "subtitle_min_dwell_ms", emphasis: "none" },
            { label: "最长驻留", bind: "subtitle_max_dwell_ms", emphasis: "none" },
            { label: "中文字符率上限", bind: "subtitle_max_cps", emphasis: "none" },
            { label: "中文每行上限", bind: "subtitle_line_chars", emphasis: "none" },
            { label: "相邻字幕最小间隙", bind: "subtitle_min_gap_frames", emphasis: "none" },
            { label: "提词器行宽", bind: "teleprompter_line_chars", emphasis: "none" },
          ],
        },
      },
      {
        id: "first-action",
        kind: "callout",
        span: 12,
        callout: "info",
        text: "第一个动作：填「这条片子要多长」。填完时间轴画出完整槽位，并浮出一行字告诉你按当前语速总共能说多少字。第二个动作才是写第一段。",
      },
    ],
    validation: [
      {
        id: "need_target_duration",
        assert: "target_seconds >= 15",
        message:
          "先填这条片子要多长（15–3600 秒）：填完时间轴才画得出刻度，并立刻算出你总共能说多少字。",
        severity: "info",
      },
      {
        id: "overrun_blocks_export",
        // 超时三档里最外那一档，是**导出时**的门槛。零数据时超出量为 0，这条是绿的。
        assert: "overrun_seconds <= tolerance_seconds * 3",
        message:
          "超出容差三倍，导出会被挡住：先压段落，或者把目标时长改成实际能用的长度。",
        severity: "error",
      },
    ],
    interactions: INTERACTIONS,
    exports: ["pdf", "png", "xlsx"],
    attribution: oceanleoAttribution(
      "OceanLeo 内置初始态：时长公式、语速档与字幕可读性上限取自口播脚本族的数值常量表",
    ),
  },
};

/**
 * 话术分支。第一屏是一块空画布 + 一条状态条 `0 句 · 0 个分支 · 已覆盖 0 类推托`，
 * 覆盖度面板存在但全部显示「—」，**没有任何红色、没有任何「未达标」**。
 *
 * 覆盖度显示「—」而不是 `0 / 5` 是这一份的关键：显示分母就是在给用户设门槛，
 * 而那个分母来自素材货架的验收线。面板显示的是**事实**（已覆盖几类），
 * 不是**评判**（几分之几未达标）。
 *
 * 死端与不可达的检查从第 3 个节点起才跑：图上只有一两个节点时，
 * 「有节点没有出边」是必然的，报出来是噪音。这条落成 `graph_ready` 那个闸。
 */
export const DIALOGUE_BRANCH_INITIAL_STATE: DocState = {
  pluginId: "dialogue-branch-script",
  displayName: "话术分支",
  kernel: "interactive-doc",
  contentType: "interactive_doc",
  title: "空白分叉图与覆盖度面板",
  firstScreen:
    "一块空画布，正中一个输入框问「开场第一句你会怎么说」。下沿状态条：0 句 · 0 个分支 · 已覆盖 0 类推托。覆盖度面板在，但读数全是「—」，没有任何红色。",
  firstAction: "写开场第一句",
  builtInData: Object.freeze([]),
  project: {
    schema: "oceanleo.interactive-doc.v1",
    version: 1,
    metadata: {
      title: "空白分叉图与覆盖度面板",
      summary:
        "沟通训练与流程参考，不表述为承诺性话术或合规结论；结构检查只在演练与导出时作为门槛。",
      locale: "zh-CN",
      docKind: "decision-tree",
      createdAt: CREATED_AT,
    },
    theme: THEME,
    parameters: [
      {
        id: "node_count",
        label: "已写句数",
        kind: "integer",
        unit: "句",
        min: 0,
        max: 300,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "edge_count",
        label: "分支数",
        kind: "integer",
        unit: "条",
        min: 0,
        max: 900,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "back_edge_count",
        label: "回边数",
        help: "澄清完回主线的边。允许，但不计入最大深度。",
        kind: "integer",
        unit: "条",
        min: 0,
        max: 900,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "objection_types_covered",
        label: "已覆盖推托类",
        help: "八类：价格、时机、决策权、需求、信任、竞品、合规、其他。",
        kind: "integer",
        unit: "类",
        min: 0,
        max: 8,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "path_chars",
        label: "单条路径话术字数",
        kind: "integer",
        unit: "字",
        min: 0,
        max: 5000,
        step: 50,
        default: 0,
        control: "input",
      },
      {
        id: "speech_rate_cps",
        label: "朗读速度",
        help: "与口播脚本同口径：3.6 字/秒。",
        kind: "number",
        unit: "字/秒",
        min: 1,
        max: 8,
        step: 0.1,
        precision: 2,
        default: 3.6,
        control: "slider",
      },
    ],
    computations: [
      {
        id: "graph_ready",
        label: "图是否够大到值得检查（第 3 个节点起）",
        expression: "if(node_count >= 3, 1, 0)",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "objection_coverage",
        label: "推托覆盖度",
        // 除以闸：图还没搭起来时显示「—」，不是 0 %，更不是「0/5 未达标」。
        expression: "objection_types_covered / objection_type_total / graph_ready",
        unit: "倍",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "branch_density",
        label: "平均出边",
        // 0 句 0 边时是 0/0：没有平均值这回事，如实显示「—」。
        expression: "edge_count / node_count",
        unit: "条/句",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "back_edge_ratio",
        label: "回边占比",
        expression: "back_edge_count / edge_count",
        unit: "倍",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "path_seconds",
        label: "单条路径朗读时长",
        expression: "path_chars / speech_rate_cps / graph_ready",
        unit: "秒",
        precision: 1,
        guard: GUARD,
      },
      constantNode("objection_type_total", "推托类型总数", "8", "类", 0),
      constantNode("node_role_total", "节点角色总数", "8", "种", 0),
      constantNode("opening_min_out_edges", "开场节点最少出边", "2", "条", 0),
      constantNode("max_out_edges", "单节点出边上限", "9", "条", 0),
      constantNode("depth_min", "构成分支话术的最小深度", "4", "层", 0),
      constantNode("depth_max", "可用深度上限", "24", "层", 0),
      constantNode("back_edge_ratio_cap", "回边占比上限", "0.25", "倍"),
      constantNode("reentry_escalate_at", "同节点重入几次强制转升级", "3", "次", 0),
      constantNode("path_chars_cap", "单条路径话术字数上限", "1200", "字", 0),
      constantNode("role_min_probe", "探询", "3", "个", 0),
      constantNode("role_min_value", "价值", "2", "个", 0),
      constantNode("role_min_objection", "异议", "5", "个", 0),
      constantNode("role_min_clarify", "澄清", "2", "个", 0),
      constantNode("role_min_escalate", "升级", "1", "个", 0),
    ],
    blocks: [
      {
        id: "intro",
        kind: "prose",
        span: 12,
        text: "这张图现在是空的，这是它正常的开始。你要做的第一件事是写开场第一句；写完之后工具会追问你：对方可能怎么回，而且至少要两种。这不是内容多寡的门槛，是结构约束——一个只有一种回应的开场不构成分叉，那是一句独白，用不着这个工具。填完两种回应，画布上就有了三个节点两条边，深度第一次变成一。右边那块覆盖度面板现在全是空的读数而不是零，因为「还没开始搭」和「搭完了覆盖率是零」是两回事，一个数字不能同时表示两者。死端与走不到的节点这两项检查从第三个节点起才跑：图上只有一两个节点时，有节点没有出边是必然的，报出来只是噪音。八类推托、八种节点角色和那张角色最少数量表一打开就在下面摆着，它们是这台工具自带的结构，不是别人的话术。",
      },
      {
        id: "canvas-state",
        kind: "parameter-panel",
        span: 12,
        title: "画布读数",
        parameterIds: [
          "node_count",
          "edge_count",
          "back_edge_count",
          "objection_types_covered",
          "path_chars",
          "speech_rate_cps",
        ],
      },
      {
        id: "metric-coverage",
        kind: "metric",
        span: 4,
        title: "推托覆盖度",
        bind: "objection_coverage",
      },
      {
        id: "metric-density",
        kind: "metric",
        span: 4,
        title: "平均出边",
        bind: "branch_density",
      },
      {
        id: "metric-path",
        kind: "metric",
        span: 4,
        title: "单条路径时长",
        bind: "path_seconds",
      },
      {
        id: "coverage-panel",
        kind: "table",
        span: 12,
        title: "覆盖度面板（还没开始搭时读数为空，不是零）",
        table: {
          rows: [
            { label: "推托覆盖度", bind: "objection_coverage", emphasis: "none" },
            { label: "平均出边", bind: "branch_density", emphasis: "none" },
            { label: "回边占比（上限 0.25）", bind: "back_edge_ratio", emphasis: "none" },
            { label: "单条路径朗读时长", bind: "path_seconds", emphasis: "none" },
          ],
        },
      },
      {
        id: "structure-table",
        kind: "table",
        span: 6,
        title: "结构约束（演练与导出时才作为门槛）",
        table: {
          rows: [
            { label: "推托类型总数", bind: "objection_type_total", emphasis: "none" },
            { label: "节点角色总数", bind: "node_role_total", emphasis: "none" },
            { label: "开场节点最少出边", bind: "opening_min_out_edges", emphasis: "none" },
            { label: "单节点出边上限", bind: "max_out_edges", emphasis: "none" },
            { label: "深度下界 / 上界", bind: "depth_min", emphasis: "none" },
            { label: "深度上界", bind: "depth_max", emphasis: "none" },
            { label: "回边占比上限", bind: "back_edge_ratio_cap", emphasis: "none" },
            { label: "同节点重入几次强制转升级", bind: "reentry_escalate_at", emphasis: "none" },
            { label: "单条路径话术字数上限", bind: "path_chars_cap", emphasis: "none" },
          ],
        },
      },
      {
        id: "role-table",
        kind: "table",
        span: 6,
        title: "角色最少数量（成交与退出各 1 个且出边为 0）",
        table: {
          rows: [
            { label: "探询（且出边 ≥ 2）", bind: "role_min_probe", emphasis: "none" },
            { label: "价值", bind: "role_min_value", emphasis: "none" },
            { label: "异议（且出边 ≥ 2）", bind: "role_min_objection", emphasis: "none" },
            { label: "澄清（允许回边）", bind: "role_min_clarify", emphasis: "none" },
            { label: "升级", bind: "role_min_escalate", emphasis: "none" },
          ],
        },
      },
      {
        id: "first-action",
        kind: "callout",
        span: 12,
        callout: "info",
        text: "第一个动作：在画布正中写下开场第一句，回车。它成为唯一的开场节点，工具随即追问对方可能怎么回——至少两种，那两条回应构成你的第一个分叉。",
      },
    ],
    validation: [
      {
        id: "need_opening_line",
        assert: "node_count >= 1",
        message:
          "先写开场第一句。写完工具会追问对方可能怎么回，至少两种，那两条才构成第一个分叉。",
        severity: "info",
      },
      {
        id: "back_edge_ratio_cap_rule",
        // 同 `search-query-builder` 的年份区间那条：断言写在参数上，不写在
        // `back_edge_ratio` 上。空图时占比是空值，拿空值比大小会判成不通过，
        // 而这一屏明令「没有任何红色，没有任何『未达标』」。
        assert: "back_edge_count <= edge_count * back_edge_ratio_cap",
        message: "回边占比超过 0.25，说明结构在打转：把澄清支收敛回主线。",
        severity: "warn",
      },
    ],
    interactions: INTERACTIONS,
    exports: ["pdf", "png", "xlsx"],
    attribution: oceanleoAttribution(
      "OceanLeo 内置初始态：推托分类、节点角色与结构约束取自话术分支族的数值常量表",
    ),
  },
};

/**
 * 自测卷。第一屏是**零道题**加一条照常显示的判分设置条。
 *
 * 判分设置条零数据时也可改，因为它不依赖题目——它是这一屏上唯一有内容的部分，
 * 让用户看见这是一台有规则的机器。成绩条显示 `0 / 0 · 未作答`：
 * 得分率在这里是 0 除以 0，如实显示「—」，出完第一道题后它立刻变成 0 / 1。
 *
 * `docKind` 取 `quiz`，但**第一屏一道 `quiz-item` 块都没有**。
 * 运行时 `quizItemsMin: 6` 是素材口径的残留，本插件文档第 5 格明令作废；
 * 它只挂在保存路径的完备判据上，不在校验与连图这条路上。
 */
export const SELF_TEST_QUIZ_INITIAL_STATE: DocState = {
  pluginId: "self-test-quiz",
  displayName: "自测卷",
  kernel: "interactive-doc",
  contentType: "interactive_doc",
  title: "空白自测卷与判分设置",
  firstScreen:
    "一张零道题的卷子：题目区是空的，只有「出第一道题」；判分设置条照常显示并可改（及格线 60 %、部分给分开、倒扣关、打乱题序关）；成绩条显示 0 / 0 · 未作答。",
  firstAction: "出第一道题",
  builtInData: Object.freeze([]),
  project: {
    schema: "oceanleo.interactive-doc.v1",
    version: 1,
    metadata: {
      title: "空白自测卷与判分设置",
      summary:
        "零道题是它正常的开始；一道题也允许作答，不设「至少 20 题才能考」的门槛。",
      locale: "zh-CN",
      docKind: "quiz",
      createdAt: CREATED_AT,
    },
    theme: THEME,
    parameters: [
      {
        id: "pass_threshold",
        label: "及格线",
        help: "值域 0.40–0.95。",
        kind: "number",
        unit: "倍",
        min: 0.4,
        max: 0.95,
        step: 0.05,
        precision: 2,
        default: 0.6,
        control: "slider",
      },
      {
        id: "partial_credit",
        label: "部分给分",
        kind: "enum",
        options: [
          { value: 1, label: "开（多选按命中比例给分）" },
          { value: 0, label: "关（全对才得分）" },
        ],
        default: 1,
        control: "radio",
      },
      {
        id: "penalty_ratio",
        label: "倒扣比例",
        help: "值域 0–0.5。单题得分仍会截到 0 分以上。",
        kind: "number",
        unit: "倍",
        min: 0,
        max: 0.5,
        step: 0.05,
        precision: 2,
        default: 0,
        control: "slider",
      },
      {
        id: "shuffle_items",
        label: "打乱题序",
        kind: "enum",
        options: [
          { value: 0, label: "关" },
          { value: 1, label: "开（同种子两次重做题序相同）" },
        ],
        default: 0,
        control: "radio",
      },
      {
        id: "numeric_tolerance_percent",
        label: "数值题相对容差",
        help: "按相对百分比判定，不是绝对值：容差 1 % 对 9.81 是 0.098 的带宽。",
        kind: "percent",
        unit: "%",
        min: 0,
        max: 100,
        step: 0.5,
        precision: 2,
        default: 1,
        control: "input",
      },
      {
        id: "random_seed",
        label: "随机种子",
        kind: "integer",
        unit: "",
        min: 0,
        max: 4294967295,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "item_count",
        label: "题目数",
        kind: "integer",
        unit: "题",
        min: 0,
        max: 300,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "answered_count",
        label: "已答题数",
        kind: "integer",
        unit: "题",
        min: 0,
        max: 300,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "total_points",
        label: "满分",
        kind: "number",
        unit: "分",
        min: 0,
        max: 6000,
        step: 1,
        precision: 2,
        default: 0,
        control: "input",
      },
      {
        id: "earned_points",
        label: "已得分",
        kind: "number",
        unit: "分",
        min: 0,
        max: 6000,
        step: 1,
        precision: 2,
        default: 0,
        control: "input",
      },
    ],
    computations: [
      {
        id: "score_ratio",
        label: "得分率",
        // 0 / 0：还没有卷子，没有得分率这回事，显示「—」。
        expression: "earned_points / total_points",
        unit: "倍",
        precision: 3,
        guard: GUARD,
      },
      {
        id: "passed",
        label: "是否通过",
        // 满分为 0 时整条判定不成立，走 0/0 回空，而不是判成「没通过」。
        expression:
          "if(total_points > 0, if(score_ratio >= pass_threshold, 1, 0), 0 / 0)",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "unanswered_count",
        label: "未作答",
        // 这一格是真零：0 题里 0 题没答，说得通，不该显示「—」。
        expression: "item_count - answered_count",
        unit: "题",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "answer_progress",
        label: "作答进度",
        expression: "answered_count / item_count",
        unit: "倍",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "average_item_points",
        label: "单题平均分值",
        expression: "total_points / item_count",
        unit: "分",
        precision: 2,
        guard: GUARD,
      },
      constantNode("item_type_total", "题型种数", "7", "种", 0),
      constantNode("option_min", "选项数下限", "2", "个", 0),
      constantNode("option_max", "选项数上限", "10", "个", 0),
      constantNode("item_point_min", "单题分值下限", "0.5", "分", 1),
      constantNode("item_point_max", "单题分值上限", "20", "分", 0),
      constantNode("difficulty_max", "难度上限", "5", "级", 0),
      constantNode("section_weight_min", "分区权重下限", "0.1", "倍", 1),
      constantNode("section_weight_max", "分区权重上限", "5", "倍", 0),
      constantNode("section_time_min", "分区限时下限", "30", "秒", 0),
      constantNode("section_time_max", "分区限时上限", "7200", "秒", 0),
    ],
    blocks: [
      {
        id: "intro",
        kind: "prose",
        span: 12,
        text: "这份卷子还没有题目，零道题是它正常的开始。出一道题，答完立刻判分并给解析——这就是它和一份印刷试卷的区别。下面那条判分设置条现在就可以改，因为它不依赖题目：及格线默认六成，多选默认按命中比例给部分分，倒扣默认关着，题序默认不打乱。数值题的容差按相对百分比判，不是绝对值，容差百分之一对九点八一这个答案意味着零点零九八的带宽，写成绝对值会差两个数量级。成绩条现在显示零比零、未作答，得分率那一格是空的而不是零分，因为还没有卷子可判。出完第一道题它立刻变成零比一，这个变化本身就说明了出题会怎样。一道题也允许作答，不设至少二十题才能考的门槛，那个门槛来自要上架的成品卷子，不是这台工具的规矩。",
      },
      {
        id: "grading-bar",
        kind: "parameter-panel",
        span: 12,
        title: "判分设置（零数据时也可改）",
        parameterIds: [
          "pass_threshold",
          "partial_credit",
          "penalty_ratio",
          "shuffle_items",
          "numeric_tolerance_percent",
          "random_seed",
        ],
      },
      {
        id: "paper-state",
        kind: "parameter-panel",
        span: 12,
        title: "卷面读数",
        parameterIds: [
          "item_count",
          "answered_count",
          "total_points",
          "earned_points",
        ],
      },
      {
        id: "metric-score",
        kind: "metric",
        span: 3,
        title: "得分率",
        bind: "score_ratio",
      },
      {
        id: "metric-passed",
        kind: "metric",
        span: 3,
        title: "是否通过",
        bind: "passed",
      },
      {
        id: "metric-progress",
        kind: "metric",
        span: 3,
        title: "作答进度",
        bind: "answer_progress",
      },
      {
        id: "metric-unanswered",
        kind: "metric",
        span: 3,
        title: "未作答",
        bind: "unanswered_count",
      },
      {
        id: "score-detail",
        kind: "table",
        span: 12,
        title: "成绩条",
        table: {
          rows: [
            { label: "得分率", bind: "score_ratio", emphasis: "none" },
            { label: "作答进度", bind: "answer_progress", emphasis: "none" },
            { label: "单题平均分值", bind: "average_item_points", emphasis: "none" },
            { label: "未作答", bind: "unanswered_count", emphasis: "total" },
          ],
        },
      },
      {
        id: "grading-constants",
        kind: "table",
        span: 12,
        title: "判分口径（七种题型共用）",
        table: {
          rows: [
            { label: "题型种数（单选/多选/判断/填空/数值/排序/匹配）", bind: "item_type_total", emphasis: "none" },
            { label: "选项数下限", bind: "option_min", emphasis: "none" },
            { label: "选项数上限", bind: "option_max", emphasis: "none" },
            { label: "单题分值下限", bind: "item_point_min", emphasis: "none" },
            { label: "单题分值上限", bind: "item_point_max", emphasis: "none" },
            { label: "难度上限", bind: "difficulty_max", emphasis: "none" },
            { label: "分区权重下限", bind: "section_weight_min", emphasis: "none" },
            { label: "分区权重上限", bind: "section_weight_max", emphasis: "none" },
            { label: "分区限时下限", bind: "section_time_min", emphasis: "none" },
            { label: "分区限时上限", bind: "section_time_max", emphasis: "none" },
          ],
        },
      },
      {
        id: "first-action",
        kind: "callout",
        span: 12,
        callout: "info",
        text: "第一个动作：点「出第一道题」，选题型并写题干。保存后自动空出下一道的表单，可以连续出题；出完第一题，题目区顶部就出现「开始作答」。",
      },
    ],
    validation: [
      {
        id: "need_first_item",
        assert: "item_count >= 1",
        message:
          "先出第一道题：选题型、写题干与选项、标答案、写解析。一道题也能考，不必凑够多少题。",
        severity: "info",
      },
      {
        id: "answered_within_items",
        assert: "answered_count <= item_count",
        message: "已答题数不能超过题目数。",
        severity: "error",
      },
    ],
    interactions: INTERACTIONS,
    exports: ["xlsx", "pdf", "png"],
    attribution: oceanleoAttribution(
      "OceanLeo 内置初始态：七种题型的判分规则与口径常量取自自测卷族的数值常量表",
    ),
  },
};

/**
 * 合同装配。第一屏是一份空装配单：14 个类目折叠着，右边预览是空白页。
 *
 * **风险分显示「—」不显示 0** —— 这是本份最要紧的一条：
 * 0 分意味着「算过了，风险中性」，和「还没开始装」是两件完全不同的事，
 * 一个数字不能同时表示两者。落成 `assembly_started` 那个除零闸。
 *
 * 条款库不是预置数据：它是**可取用的货架**，不是「已经装进你这份合同的条款」。
 * 工具绝不预勾任何一条，哪怕是必备类目里的——预勾等于替用户做了他还没做的决定，
 * 还会让他误以为「这几条已经审过了」。
 *
 * 必备类目数取 **7**：插件文档 §10 那一行写「6 个必备类目」，
 * 后面括号里却列了当事人、标的、价款、支付、违约责任、期限、争议解决共 7 项。
 * 这里按枚举出来的 7 项算，差异已登记进 `signals/W17-request.md`。
 */
export const CONTRACT_ASSEMBLY_INITIAL_STATE: DocState = {
  pluginId: "contract-assembly",
  displayName: "合同装配",
  kernel: "interactive-doc",
  contentType: "interactive_doc",
  title: "空白装配单与条款库目录",
  firstScreen:
    "一行「这是一笔什么交易」，下面是按 14 个类目折叠起来的条款库目录，必备类目带星标；右边预览是空白页，页脚常驻免责。状态条：已选 0 条 · 待填 0 项 · 风险分「—」。",
  firstAction: "展开第一个类目勾第一条条款",
  builtInData: Object.freeze([]),
  project: {
    schema: "oceanleo.interactive-doc.v1",
    version: 1,
    metadata: {
      title: "空白装配单与条款库目录",
      summary:
        "起草辅助与条款教学，不表述为法律意见；风险分是相对提示，不是法律结论。",
      locale: "zh-CN",
      docKind: "checklist",
      createdAt: CREATED_AT,
    },
    theme: THEME,
    parameters: [
      {
        id: "enabled_clause_count",
        label: "已启用条款",
        help: "工具不预勾任何一条，哪怕是必备类目里的。",
        kind: "integer",
        unit: "条",
        min: 0,
        max: 200,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "unfilled_placeholder_count",
        label: "待填项",
        kind: "integer",
        unit: "项",
        min: 0,
        max: 200,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "missing_mandatory_count",
        label: "缺必备类目",
        help: "勾了条款之后才开始核；空装配单不算缺。",
        kind: "integer",
        unit: "类",
        min: 0,
        max: 7,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "conflict_pair_count",
        label: "互斥冲突对",
        help: "诉讼管辖与仲裁是标准例子，两条不得同时启用。",
        kind: "integer",
        unit: "对",
        min: 0,
        max: 100,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "risk_weight_sum",
        label: "已启用条款风险权重之和",
        help: "单条权重值域 −5..5，负值代表对己方不利。",
        kind: "number",
        unit: "分",
        min: -1000,
        max: 1000,
        step: 1,
        precision: 2,
        default: 0,
        control: "input",
      },
      {
        id: "deposit_ratio",
        label: "定金比例",
        help: "法定上限 20 %，越限提示。",
        kind: "percent",
        unit: "%",
        min: 0,
        max: 100,
        step: 1,
        precision: 2,
        default: 0,
        control: "input",
      },
      {
        id: "assembled_char_count",
        label: "装配字数",
        kind: "integer",
        unit: "字",
        min: 0,
        max: 200000,
        step: 100,
        default: 0,
        control: "input",
      },
    ],
    computations: [
      {
        id: "assembly_started",
        label: "是否已开始装配",
        // 0 条条款时是 0/0 → 空值，下面凡是乘上它的读数都显示「—」。
        expression: "enabled_clause_count / enabled_clause_count",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "risk_score",
        label: "风险分",
        // 「—」不是 0：0 分意味着算过了、风险中性，那是另一件事。
        expression:
          "clamp(risk_weight_sum - 5 * missing_mandatory_count - 2 * conflict_pair_count, -100, 100) * assembly_started",
        unit: "分",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "export_blocked",
        label: "导出是否被挡住",
        expression:
          "if(unfilled_placeholder_count > 0 || conflict_pair_count > 0 || missing_mandatory_count > 0, 1, 0) * assembly_started",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "mandatory_coverage",
        label: "必备类目覆盖率",
        expression:
          "(mandatory_category_total - missing_mandatory_count) / mandatory_category_total * assembly_started",
        unit: "倍",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "chars_per_clause",
        label: "每条条款平均字数",
        expression: "assembled_char_count / enabled_clause_count",
        unit: "字",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "deposit_over_cap",
        label: "定金是否越限",
        expression: "if(deposit_ratio > statute_deposit_cap, 1, 0)",
        precision: 0,
        guard: GUARD,
      },
      constantNode("category_total", "条款类目总数", "14", "类", 0),
      constantNode("mandatory_category_total", "必备类目数", "7", "类", 0),
      constantNode("penalty_min_clauses", "违约责任最少条数", "2", "条", 0),
      constantNode("statute_deposit_cap", "定金比例法定上限", "20", "%", 0),
      constantNode("risk_weight_min", "单条款风险权重下限", "-5", "分", 0),
      constantNode("risk_weight_max", "单条款风险权重上限", "5", "分", 0),
      constantNode("dependency_max", "单条款依赖上限", "8", "条", 0),
      constantNode("exclusion_max", "单条款互斥上限", "8", "条", 0),
      constantNode("placeholder_max", "单条款占位符上限", "20", "个", 0),
      constantNode("variable_type_total", "变量类型数", "7", "种", 0),
      constantNode("clause_chars_min", "条款正文长度下限", "40", "字符", 0),
      constantNode("clause_chars_max", "条款正文长度上限", "4000", "字符", 0),
    ],
    blocks: [
      {
        id: "intro",
        kind: "prose",
        span: 12,
        text: "这份装配单是空的：已启用条款零条，右边预览是一张空白页。下面那十四个类目是条款库的目录，它是可以取用的货架，不是已经装进你这份合同的条款——工具绝不替你预勾任何一条，哪怕是必备类目里的，因为预勾等于替你做了一个你还没做的决定，而且会让你误以为这几条已经审过了。风险分那一格现在显示的是空，不是零分：零分意味着算过了、风险中性，跟还没开始装是完全不同的两件事，一个数字不能同时表示两者。勾中第一条条款的瞬间，右边预览会出现第一段正文，它带的待填项同时进待填清单；如果这条条款有依赖，比如分期付款依赖逾期利息，工具会把依赖项一起带进来并标明是因为你选了哪一条。存在未填占位符、必备类目缺条或者条款互斥时导出会被挡住——一份正式文件里留着尖括号占位符，是这个工具最不能出的错。",
      },
      {
        id: "assembly-state",
        kind: "parameter-panel",
        span: 12,
        title: "装配单读数",
        parameterIds: [
          "enabled_clause_count",
          "unfilled_placeholder_count",
          "missing_mandatory_count",
          "conflict_pair_count",
          "risk_weight_sum",
          "deposit_ratio",
          "assembled_char_count",
        ],
      },
      {
        id: "metric-risk",
        kind: "metric",
        span: 4,
        title: "风险分",
        bind: "risk_score",
      },
      {
        id: "metric-coverage",
        kind: "metric",
        span: 4,
        title: "必备类目覆盖率",
        bind: "mandatory_coverage",
      },
      {
        id: "metric-blocked",
        kind: "metric",
        span: 4,
        title: "导出是否被挡住",
        bind: "export_blocked",
      },
      {
        id: "status-bar",
        kind: "table",
        span: 12,
        title: "状态条",
        table: {
          rows: [
            { label: "风险分（相对提示，不是法律结论）", bind: "risk_score", emphasis: "none" },
            { label: "必备类目覆盖率", bind: "mandatory_coverage", emphasis: "none" },
            { label: "每条条款平均字数", bind: "chars_per_clause", emphasis: "none" },
            { label: "定金是否越限（1 = 超过法定 20 %）", bind: "deposit_over_cap", emphasis: "none" },
            { label: "导出是否被挡住", bind: "export_blocked", emphasis: "total" },
          ],
        },
      },
      {
        id: "library-shape",
        kind: "table",
        span: 6,
        title: "条款库结构（货架，不是已装进来的条款）",
        table: {
          rows: [
            { label: "条款类目总数", bind: "category_total", emphasis: "none" },
            { label: "其中必备类目", bind: "mandatory_category_total", emphasis: "none" },
            { label: "违约责任最少条数", bind: "penalty_min_clauses", emphasis: "none" },
            { label: "变量类型数", bind: "variable_type_total", emphasis: "none" },
            { label: "条款正文长度下限", bind: "clause_chars_min", emphasis: "none" },
            { label: "条款正文长度上限", bind: "clause_chars_max", emphasis: "none" },
          ],
        },
      },
      {
        id: "rule-table",
        kind: "table",
        span: 6,
        title: "装配规则与法定上限",
        table: {
          rows: [
            { label: "定金比例法定上限", bind: "statute_deposit_cap", emphasis: "none" },
            { label: "单条款风险权重下限", bind: "risk_weight_min", emphasis: "none" },
            { label: "单条款风险权重上限", bind: "risk_weight_max", emphasis: "none" },
            { label: "单条款依赖上限", bind: "dependency_max", emphasis: "none" },
            { label: "单条款互斥上限", bind: "exclusion_max", emphasis: "none" },
            { label: "单条款占位符上限", bind: "placeholder_max", emphasis: "none" },
          ],
        },
      },
      {
        id: "disclaimer",
        kind: "callout",
        span: 12,
        callout: "warn",
        text: "本工具用于起草辅助与条款教学，不表述为法律意见。风险分是相对提示，不是法律结论，不能读作「本合同风险等级：中」。条款是否适用你这笔交易，仍需你自己或律师判断。",
      },
    ],
    validation: [
      {
        id: "need_first_clause",
        assert: "enabled_clause_count >= 1",
        message:
          "先写一句「这是一笔什么交易」，再展开第一个类目勾第一条条款：勾中的瞬间右边预览就会出现第一段正文。",
        severity: "info",
      },
      {
        id: "no_unfilled_on_export",
        assert: "unfilled_placeholder_count == 0",
        message:
          "还有待填占位符：填完才能导出，正式文件里不能留着占位符。",
        severity: "error",
      },
      {
        id: "no_conflict_pairs",
        assert: "conflict_pair_count == 0",
        message: "有互斥的条款同时启用了（例如诉讼管辖与仲裁），二选一。",
        severity: "error",
      },
      {
        id: "deposit_within_cap",
        assert: "deposit_ratio <= statute_deposit_cap",
        message: "定金比例超过法定上限 20 %，超出部分不受支持。",
        severity: "error",
      },
    ],
    interactions: INTERACTIONS,
    exports: ["pdf"],
    attribution: oceanleoAttribution(
      "OceanLeo 内置初始态：14 类条款目录、风险分公式与装配规则取自合同装配族的数值常量表",
    ),
  },
};

/**
 * 检索式构造。第一屏是一行主题输入框、一块空的概念块区、
 * 一个只有「通用布尔」的编译预览区，**lint 面板不显示**。
 *
 * 「零数据时不跑 lint」是本份最要紧的一条：旧族 lint 规则里有三条阻断级是数量门槛
 * （某块词条 < 4、块 < 3、方言 < 2），刚打开时这三条必然全中。
 * 照跑的话用户看到的第一屏就是三条红色阻断，等于告诉他「你还没开始就已经错了」。
 * 落到这里就是：**第一屏没有任何 error 级规则**，只有一条 info 说明下一步。
 *
 * 计数在为 0 时也不显示「0/3」——那个分母 3 是上架成品的下限，不是工具的门槛。
 * 每块平均词条与受控词占比因此走除零回空，显示「—」。
 */
export const SEARCH_QUERY_BUILDER_INITIAL_STATE: DocState = {
  pluginId: "search-query-builder",
  displayName: "检索式构造",
  kernel: "interactive-doc",
  contentType: "interactive_doc",
  title: "空白检索策略与方言编译",
  firstScreen:
    "顶上一行主题输入框，提示「一句话说清你要查什么」；下面一块空的概念块区，只有「加第一个概念块」；右边编译预览只开「通用布尔」一个方言，写着还没有可编译的内容。lint 面板不显示。",
  firstAction: "写主题并建第一个概念块",
  builtInData: Object.freeze([]),
  project: {
    schema: "oceanleo.interactive-doc.v1",
    version: 1,
    metadata: {
      title: "空白检索策略与方言编译",
      summary:
        "检索式是编译产物不是手写文本；本工具不执行检索，只产出可粘贴的串。",
      locale: "zh-CN",
      docKind: "checklist",
      createdAt: CREATED_AT,
    },
    theme: THEME,
    parameters: [
      {
        id: "concept_block_count",
        label: "概念块数",
        kind: "integer",
        unit: "块",
        min: 0,
        max: 10,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "term_count",
        label: "词条总数",
        kind: "integer",
        unit: "条",
        min: 0,
        max: 600,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "distinct_term_count",
        label: "去重后词条数",
        help: "文本与字段完全相同即算重复。",
        kind: "integer",
        unit: "条",
        min: 0,
        max: 600,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "controlled_term_count",
        label: "受控词（主题词）条数",
        kind: "integer",
        unit: "条",
        min: 0,
        max: 600,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "dialect_count",
        label: "已勾选方言",
        help: "默认只开通用布尔，它是三个里唯一不需要预设领域假设的。",
        kind: "enum",
        options: [
          { value: 1, label: "只开通用布尔（默认）" },
          { value: 2, label: "通用布尔 + PubMed" },
          { value: 3, label: "通用布尔 + PubMed + arXiv" },
        ],
        default: 1,
        control: "select",
      },
      {
        id: "year_from",
        label: "起始年",
        kind: "integer",
        unit: "年",
        min: 0,
        max: 2100,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "year_to",
        label: "截止年",
        kind: "integer",
        unit: "年",
        min: 0,
        max: 2100,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "proximity_distance",
        label: "邻近词距",
        help: "值域 0–15；不支持的方言降级为短语并提示。",
        kind: "integer",
        unit: "词",
        min: 0,
        max: 15,
        step: 1,
        default: 0,
        control: "stepper",
      },
      {
        id: "truncation_prefix",
        label: "截词最短前缀",
        help: "短于 4 字符会提示，防召回爆炸。",
        kind: "integer",
        unit: "字符",
        min: 1,
        max: 20,
        step: 1,
        default: 4,
        control: "stepper",
      },
    ],
    computations: [
      {
        id: "terms_per_block",
        label: "每块平均词条",
        // 0 块时显示「—」。这里不能显示「0 / 3」：分母 3 是上架成品的下限，
        // 不是工具的门槛，把它印在第一屏上就变成了给用户设关卡。
        expression: "term_count / concept_block_count",
        unit: "条/块",
        precision: 1,
        guard: GUARD,
      },
      {
        id: "controlled_ratio",
        label: "受控词占比",
        expression: "controlled_term_count / distinct_term_count",
        unit: "倍",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "duplicate_term_count",
        label: "重复词条",
        // 真零：0 条词里 0 条重复，说得通。
        expression: "term_count - distinct_term_count",
        unit: "条",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "year_span",
        label: "年份跨度",
        expression: "if(year_from > 0 && year_to > 0, year_to - year_from, 0 / 0)",
        unit: "年",
        precision: 0,
        guard: GUARD,
      },
      constantNode("field_set_size", "抽象字段集", "9", "个", 0),
      constantNode("dialect_total", "可编译方言", "3", "个", 0),
      constantNode("lint_rule_count", "lint 规则", "9", "条", 0),
      constantNode("paren_depth_max", "括号深度上限", "12", "层", 0),
      constantNode("proximity_max", "邻近词距上限", "15", "词", 0),
      constantNode("truncation_min_prefix", "截词最短前缀建议", "4", "字符", 0),
      constantNode("controlled_ratio_floor", "受控词占比建议下限", "0.2", "倍"),
      constantNode("query_length_max", "单方言编译串长度上界", "8000", "字符", 0),
      constantNode("compile_budget_ms", "重编译预算", "60", "毫秒", 0),
    ],
    blocks: [
      {
        id: "intro",
        kind: "prose",
        span: 12,
        text: "先用一句话说清你要查什么，然后把这句话拆成几个概念块，每块里塞同义词，指定在标题还是摘要还是主题词里查，再加上年份和语种限定。工具把这一堆结构编译成一串可以直接粘进检索框的检索式，同一份结构还能编出好几个库各自的方言。这里有个反直觉的点：检索式本身在这个工具里不是可编辑的对象，是编译产物——你改的永远是结构，编出来的那串字符是只读的。原因很实际，改一个同义词要手工重排整串括号，极易出错。现在概念块区是空的，编译预览也是空的，而且没有任何检查在跑：块数、词条数、方言数这三项数量检查刚打开时必然全都不满足，如果照跑，你看到的第一屏会是三条红色阻断，等于告诉你还没开始就已经错了。检查只在你点编译的时候才跑。填完第一个词，右边预览就会出现那一个词编译后的样子，你会立刻看懂字段标签是怎么加上去的。",
      },
      {
        id: "structure",
        kind: "parameter-panel",
        span: 12,
        title: "概念块与词条",
        parameterIds: [
          "concept_block_count",
          "term_count",
          "distinct_term_count",
          "controlled_term_count",
        ],
      },
      {
        id: "limits",
        kind: "parameter-panel",
        span: 12,
        title: "方言与限定",
        parameterIds: [
          "dialect_count",
          "year_from",
          "year_to",
          "proximity_distance",
          "truncation_prefix",
        ],
      },
      {
        id: "metric-per-block",
        kind: "metric",
        span: 4,
        title: "每块平均词条",
        bind: "terms_per_block",
      },
      {
        id: "metric-controlled",
        kind: "metric",
        span: 4,
        title: "受控词占比",
        bind: "controlled_ratio",
      },
      {
        id: "metric-duplicate",
        kind: "metric",
        span: 4,
        title: "重复词条",
        bind: "duplicate_term_count",
      },
      {
        id: "strategy-readout",
        kind: "table",
        span: 12,
        title: "检索策略读数",
        table: {
          rows: [
            { label: "每块平均词条", bind: "terms_per_block", emphasis: "none" },
            { label: "受控词占比（建议不低于 0.20）", bind: "controlled_ratio", emphasis: "none" },
            { label: "重复词条（同块内文本与字段完全相同）", bind: "duplicate_term_count", emphasis: "none" },
            { label: "年份跨度", bind: "year_span", emphasis: "none" },
          ],
        },
      },
      {
        id: "builtin-table",
        kind: "table",
        span: 12,
        title: "内置编译能力（本工具不执行检索，也不发网络请求）",
        table: {
          rows: [
            { label: "抽象字段集（标题摘要、主题词、作者……）", bind: "field_set_size", emphasis: "none" },
            { label: "可编译方言（通用布尔 / PubMed / arXiv）", bind: "dialect_total", emphasis: "none" },
            { label: "lint 规则（点编译时才跑）", bind: "lint_rule_count", emphasis: "none" },
            { label: "括号深度上限", bind: "paren_depth_max", emphasis: "none" },
            { label: "邻近词距上限", bind: "proximity_max", emphasis: "none" },
            { label: "截词最短前缀建议", bind: "truncation_min_prefix", emphasis: "none" },
            { label: "受控词占比建议下限", bind: "controlled_ratio_floor", emphasis: "none" },
            { label: "单方言编译串长度上界", bind: "query_length_max", emphasis: "none" },
            { label: "重编译预算", bind: "compile_budget_ms", emphasis: "none" },
          ],
        },
      },
      {
        id: "first-action",
        kind: "callout",
        span: 12,
        callout: "info",
        text: "第一个动作：写主题，然后建第一个概念块，给它一个标签（比如「人群」），填进第一个词。填完那一刻右边预览就会出现这个词的编译结果。块内运算符固定为「或」不可改；块与块之间的关系必须写显式括号，缺括号会挡住编译——同一串在不同库里解析不同，召回集就不可复现了。",
      },
    ],
    validation: [
      {
        id: "need_first_block",
        assert: "concept_block_count >= 1",
        message:
          "先写一句主题，再建第一个概念块并填进第一个词：填完那一刻右边就会出现它编译后的样子。",
        severity: "info",
      },
      {
        id: "no_duplicate_terms",
        assert: "duplicate_term_count == 0",
        message: "同一块里有文本与字段完全相同的词条，编译会被挡住。",
        severity: "error",
      },
      {
        id: "year_range_order",
        // 日期区间反序是阻断级：否则零召回却看不出原因。
        // 断言写在**参数**上而不是 `year_span` 上：年份没填时 `year_span` 是空值，
        // 拿空值去比大小会判成不通过，第一屏就红一条——那正是本份第 5 格
        // 明令不许出现的「你还没开始就已经错了」。
        assert: "year_from == 0 || year_to == 0 || year_to >= year_from",
        message: "年份区间反了：起始年晚于截止年会零召回，而且看不出原因。",
        severity: "error",
      },
    ],
    interactions: INTERACTIONS,
    exports: ["pdf", "xlsx"],
    attribution: oceanleoAttribution(
      "OceanLeo 内置初始态：抽象字段集、三方言编译表与 lint 规则取自检索式构造族的数值常量表",
    ),
  },
};

export const AUTHORING_INITIAL_STATES: readonly DocState[] = Object.freeze([
  VOICEOVER_SCRIPT_INITIAL_STATE,
  DIALOGUE_BRANCH_INITIAL_STATE,
  SELF_TEST_QUIZ_INITIAL_STATE,
  CONTRACT_ASSEMBLY_INITIAL_STATE,
  SEARCH_QUERY_BUILDER_INITIAL_STATE,
]);

/**
 * 三块空工作台：看板、公式展开、可执行笔记。
 *
 * 这三份的共同形状是**布局给满、内容全空**：格子在、状态条在、常量表在，
 * 用户的东西一件没有。三份文档各自把这条界线论证了一遍，判据是同一句话——
 * **「用户会不会想删掉它？」** 卡位不会（删了没地方放指标），示例数据会。
 *
 * 三份里最要紧的一条在看板：
 *
 * > **数据缺失时显示「数据缺失」，不显示 0。**
 * > 一条掉到零的曲线会让人得出完全相反的结论。
 * > （`metrics-dashboard.md` §4 末行、§5.2，出处 `L3-families/metrics-dashboard.md:258,326`）
 *
 * 台账合计 `0.00` 是**算出来的真值**（确实还没记账），
 * 而一个指标一条数都没有的时候显示 0 会**撒谎**。落到实现上就是那个
 * `data_gate`：所有 KPI 都除以数据源行数，零行时整屏读数如实变成「—」。
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
 * 看板。第一屏：筛选条在、六张 KPI 卡位在、四块图位在、一块口径说明在，
 * **全部显示「数据缺失」**；一个显眼的「从哪儿取数」。
 *
 * 六卡四图不是随手定的，是结构下限（`metrics-dashboard.md` §10.3，
 * 原 `L3-families/metrics-dashboard.md:274-283`）：KPI 卡最少 6、图块最少 4、
 * 说明块最少 1。在旧规格里它们是「够不够格上货架」的验收线；在插件里它们是
 * **初始布局给几个格子**——用户完全可以把六张卡删到只剩两张，那是他的自由。
 *
 * 六个指标不是编出来的业务名，是任何一块看板对着一列度量都会算的六种聚合：
 * 本期合计、单行均值、环比、同比、达成率、覆盖率。它们的输入是「数据源该填的那几格」，
 * 全部为 0，于是六个读数全是「—」。绑上数据源那一刻六个一起活过来。
 *
 * `docKind` 取 `calculator`：`INTERACTIVE_DOC_KINDS`（`interactive-doc-schema.ts:97-107`）
 * 里没有 dashboard 这一种，而看板的底层形态恰好就是「参数 + 计算 + 展示块」。
 * 加一种 kind 要动载体版本号，已登记进 `signals/W17-request.md`。
 */
export const METRICS_DASHBOARD_INITIAL_STATE: DocState = {
  pluginId: "metrics-dashboard",
  displayName: "看板",
  kernel: "interactive-doc",
  contentType: "interactive_doc",
  title: "空白看板与指标卡位",
  firstScreen:
    "筛选条（时间范围默认近 12 个月、分组筛选器空着）、六张 KPI 卡位、四块图位、一块口径说明。全部读数显示「数据缺失」而不是 0，中间一个「从哪儿取数」。",
  firstAction: "从哪儿取数",
  builtInData: Object.freeze([]),
  project: {
    schema: "oceanleo.interactive-doc.v1",
    version: 1,
    metadata: {
      title: "空白看板与指标卡位",
      summary:
        "布局是给的，指标定义是空的；没有数的时候如实显示数据缺失，不显示 0。",
      locale: "zh-CN",
      docKind: "calculator",
      createdAt: CREATED_AT,
    },
    theme: THEME,
    parameters: [
      {
        id: "range_months",
        label: "时间范围",
        help: "至少两个筛选器、其中至少一个是时间区间，这是看板的结构下限。",
        kind: "integer",
        unit: "个月",
        min: 1,
        max: 120,
        step: 1,
        default: 12,
        control: "slider",
      },
      {
        id: "segment_count",
        label: "已选分组",
        help: "第二个筛选器，出厂空着等你选。",
        kind: "integer",
        unit: "个",
        min: 0,
        max: 64,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "source_row_count",
        label: "数据源行数",
        help: "绑到 app 已生成的数、粘一批数进来，或手工加一个指标自己填值。",
        kind: "integer",
        unit: "行",
        min: 0,
        max: 200000,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "filled_row_count",
        label: "有值行数",
        kind: "integer",
        unit: "行",
        min: 0,
        max: 200000,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "measure_total",
        label: "本期度量合计",
        kind: "number",
        unit: "单位",
        min: -1000000000000,
        max: 1000000000000,
        step: 1,
        precision: 4,
        default: 0,
        control: "input",
      },
      {
        id: "measure_previous_total",
        label: "上期度量合计",
        kind: "number",
        unit: "单位",
        min: -1000000000000,
        max: 1000000000000,
        step: 1,
        precision: 4,
        default: 0,
        control: "input",
      },
      {
        id: "measure_year_ago_total",
        label: "去年同期度量合计",
        kind: "number",
        unit: "单位",
        min: -1000000000000,
        max: 1000000000000,
        step: 1,
        precision: 4,
        default: 0,
        control: "input",
      },
      {
        id: "measure_target",
        label: "目标值",
        help: "改目标只改达成率与颜色档，不改实际值。",
        kind: "number",
        unit: "单位",
        min: -1000000000000,
        max: 1000000000000,
        step: 1,
        precision: 4,
        default: 0,
        control: "input",
      },
      {
        id: "band_watch",
        label: "关注切点",
        kind: "number",
        unit: "倍",
        min: 0,
        max: 1,
        step: 0.01,
        precision: 2,
        default: 0.8,
        control: "slider",
      },
      {
        id: "band_hit",
        label: "达成切点",
        kind: "number",
        unit: "倍",
        min: 0,
        max: 1,
        step: 0.01,
        precision: 2,
        default: 0.95,
        control: "slider",
      },
    ],
    computations: [
      {
        id: "data_gate",
        label: "数据源是否已接入",
        // 零行时是 0/0 → 空值。凡是乘上它的读数都随之显示「数据缺失」，
        // 而不是一个会让人读反的 0。这是本份最要紧的一行。
        expression: "source_row_count / source_row_count",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "kpi_current_total",
        label: "本期合计",
        expression: "measure_total * data_gate",
        unit: "单位",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "kpi_row_average",
        label: "单行均值",
        expression: "measure_total / source_row_count",
        unit: "单位/行",
        precision: 4,
        guard: GUARD,
      },
      {
        id: "kpi_period_over_period",
        label: "环比",
        expression: "measure_total / measure_previous_total - 1",
        unit: "倍",
        precision: 4,
        guard: GUARD,
      },
      {
        id: "kpi_year_over_year",
        label: "同比",
        expression: "measure_total / measure_year_ago_total - 1",
        unit: "倍",
        precision: 4,
        guard: GUARD,
      },
      {
        id: "kpi_target_attainment",
        label: "达成率",
        expression: "measure_total / measure_target",
        unit: "倍",
        precision: 4,
        guard: GUARD,
      },
      {
        id: "kpi_coverage_rate",
        label: "数据覆盖率",
        expression: "filled_row_count / source_row_count",
        unit: "倍",
        precision: 4,
        guard: GUARD,
      },
      {
        id: "monthly_average",
        label: "按时间范围摊平",
        expression: "measure_total / range_months * data_gate",
        unit: "单位/月",
        precision: 4,
        guard: GUARD,
      },
      {
        id: "severity_watch_cut",
        label: "关注档切点",
        expression: "band_watch",
        unit: "倍",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "severity_hit_cut",
        label: "达成档切点",
        expression: "band_hit",
        unit: "倍",
        precision: 2,
        guard: GUARD,
      },
      constantNode("tile_kpi_min", "KPI 卡最少", "6", "块", 0),
      constantNode("tile_chart_min", "图块最少", "4", "块", 0),
      constantNode("tile_note_min", "说明块最少", "1", "块", 0),
      constantNode("tile_total_max", "磁贴总数上限", "40", "块", 0),
      constantNode("kpi_max", "KPI 上限", "24", "个", 0),
      constantNode("filter_min", "筛选器下限", "2", "个", 0),
      constantNode("filter_max", "筛选器上限", "8", "个", 0),
      constantNode("grid_columns", "栅格列数", "12", "列", 0),
      constantNode("tile_gap_px", "磁贴间距", "16", "px", 0),
      constantNode("kpi_card_min_height", "KPI 卡最小高", "120", "px", 0),
      constantNode("chart_min_height", "图块最小高", "280", "px", 0),
      constantNode("filter_hit_area", "筛选控件触达区", "44", "px", 0),
      constantNode("single_column_width", "转单列宽度", "320", "px", 0),
      constantNode("recompute_budget_ms", "三级重算预算", "400", "毫秒", 0),
    ],
    blocks: [
      {
        id: "intro",
        kind: "prose",
        span: 12,
        text: "这块看板还没有数据来源，所以每一格显示的都是「数据缺失」而不是零。这个区别很硬：一条掉到零的曲线会让人得出完全相反的结论，而零和没数在指标上是两回事。卡位和图位倒是已经摆好了——六张指标卡、四块图、一块口径说明，这几个数是看板的结构下限，不是随手定的；给你一块空白让你自己拖出六个格子，那不是零数据形态，那是把活推回给你。第一个动作是点「从哪儿取数」，有三条路：绑到这个 app 已经生成的数、从别处粘一批数进来、或者手工加一个指标自己填值。不是「点第一张卡改标题」，没有数的时候改标题毫无意义。达成率分三档，低于关注切点是未达、之间是关注、高于达成切点是达成，三档一律用颜色加形状双编码，只靠颜色对色觉障碍的人不成立。改目标值只改达成率与颜色档，不改实际值。",
      },
      {
        id: "filters",
        kind: "parameter-panel",
        span: 12,
        title: "筛选条",
        parameterIds: ["range_months", "segment_count"],
      },
      {
        id: "source",
        kind: "parameter-panel",
        span: 12,
        title: "从哪儿取数（三条路都要你显式选）",
        parameterIds: [
          "source_row_count",
          "filled_row_count",
          "measure_total",
          "measure_previous_total",
          "measure_year_ago_total",
          "measure_target",
        ],
      },
      {
        id: "kpi-current",
        kind: "metric",
        span: 2,
        title: "本期合计",
        bind: "kpi_current_total",
      },
      {
        id: "kpi-average",
        kind: "metric",
        span: 2,
        title: "单行均值",
        bind: "kpi_row_average",
      },
      {
        id: "kpi-pop",
        kind: "metric",
        span: 2,
        title: "环比",
        bind: "kpi_period_over_period",
      },
      {
        id: "kpi-yoy",
        kind: "metric",
        span: 2,
        title: "同比",
        bind: "kpi_year_over_year",
      },
      {
        id: "kpi-attainment",
        kind: "metric",
        span: 2,
        title: "达成率",
        bind: "kpi_target_attainment",
      },
      {
        id: "kpi-coverage",
        kind: "metric",
        span: 2,
        title: "数据覆盖率",
        bind: "kpi_coverage_rate",
      },
      {
        id: "chart-trend",
        kind: "chart",
        span: 6,
        title: "趋势（接上数据源后有内容）",
        chart: {
          chartType: "line",
          xAxisLabel: "时间",
          yAxisLabel: "本期合计",
          series: [{ name: "本期合计", bind: "kpi_current_total" }],
        },
      },
      {
        id: "chart-compare",
        kind: "chart",
        span: 6,
        title: "环比与同比",
        chart: {
          chartType: "bar",
          xAxisLabel: "口径",
          yAxisLabel: "变化率",
          series: [
            { name: "环比", bind: "kpi_period_over_period" },
            { name: "同比", bind: "kpi_year_over_year" },
          ],
        },
      },
      {
        id: "chart-attainment",
        kind: "chart",
        span: 6,
        title: "达成率",
        chart: {
          chartType: "area",
          xAxisLabel: "时间",
          yAxisLabel: "达成率",
          series: [{ name: "达成率", bind: "kpi_target_attainment" }],
        },
      },
      {
        id: "chart-coverage",
        kind: "chart",
        span: 6,
        title: "数据覆盖率",
        chart: {
          chartType: "bar",
          xAxisLabel: "口径",
          yAxisLabel: "覆盖率",
          series: [{ name: "覆盖率", bind: "kpi_coverage_rate" }],
        },
      },
      {
        id: "kpi-readout",
        kind: "table",
        span: 12,
        title: "指标读数（接上数据源之前一律是数据缺失）",
        table: {
          rows: [
            { label: "本期合计", bind: "kpi_current_total", emphasis: "none" },
            { label: "单行均值", bind: "kpi_row_average", emphasis: "none" },
            { label: "按时间范围摊平", bind: "monthly_average", emphasis: "none" },
            { label: "环比", bind: "kpi_period_over_period", emphasis: "none" },
            { label: "同比", bind: "kpi_year_over_year", emphasis: "none" },
            { label: "达成率", bind: "kpi_target_attainment", emphasis: "subtotal" },
            { label: "数据覆盖率", bind: "kpi_coverage_rate", emphasis: "total" },
          ],
        },
      },
      {
        id: "band-table",
        kind: "table",
        span: 6,
        title: "达成率分档（颜色 + 形状双编码）",
        table: {
          rows: [
            { label: "未达：低于（▼）", bind: "severity_watch_cut", emphasis: "none" },
            { label: "达成：高于（▲）", bind: "severity_hit_cut", emphasis: "none" },
          ],
        },
      },
      {
        id: "layout-table",
        kind: "table",
        span: 6,
        title: "布局常量（卡位是布局，不是内容）",
        table: {
          rows: [
            { label: "KPI 卡最少", bind: "tile_kpi_min", emphasis: "none" },
            { label: "图块最少", bind: "tile_chart_min", emphasis: "none" },
            { label: "说明块最少", bind: "tile_note_min", emphasis: "none" },
            { label: "磁贴总数上限", bind: "tile_total_max", emphasis: "none" },
            { label: "KPI 上限", bind: "kpi_max", emphasis: "none" },
            { label: "筛选器下限 / 上限", bind: "filter_min", emphasis: "none" },
            { label: "筛选器上限", bind: "filter_max", emphasis: "none" },
            { label: "栅格列数", bind: "grid_columns", emphasis: "none" },
            { label: "磁贴间距", bind: "tile_gap_px", emphasis: "none" },
            { label: "KPI 卡最小高", bind: "kpi_card_min_height", emphasis: "none" },
            { label: "图块最小高", bind: "chart_min_height", emphasis: "none" },
            { label: "筛选控件触达区", bind: "filter_hit_area", emphasis: "none" },
            { label: "转单列宽度", bind: "single_column_width", emphasis: "none" },
            { label: "三级重算预算", bind: "recompute_budget_ms", emphasis: "none" },
          ],
        },
      },
      {
        id: "note-tile",
        kind: "callout",
        span: 12,
        callout: "info",
        text: "这块看板还没有数据来源。第一个动作是「从哪儿取数」：绑到这个 app 已经生成的数、从别处粘一批数进来，或者手工加一个指标自己填值。口径说明这块磁贴留给你写清每个指标怎么算的、数从哪来——三个月后回来看，这段话比指标本身更要紧。",
      },
    ],
    validation: [
      {
        id: "need_data_source",
        assert: "source_row_count > 0",
        message:
          "还没有数据来源，所以每一格显示的是「数据缺失」而不是 0。点「从哪儿取数」接上一批数，六个指标会一起活过来。",
        severity: "info",
      },
      {
        id: "coverage_within_rows",
        assert: "filled_row_count <= source_row_count",
        message: "有值行数不能超过数据源行数。",
        severity: "error",
      },
      {
        id: "band_order",
        assert: "band_watch <= band_hit",
        message: "关注切点不能高于达成切点，否则三档会翻过来。",
        severity: "error",
      },
    ],
    interactions: INTERACTIONS,
    exports: ["png", "pdf", "xlsx"],
    attribution: oceanleoAttribution(
      "OceanLeo 内置初始态：磁贴布局下限、达成率分档与尺寸预算取自看板族的数值常量表",
    ),
  },
};

/**
 * 公式展开。第一屏：左栏空符号表（表头照常渲染，让用户看见要填什么），
 * 右栏「还没有推导步骤」，底部状态条 `0 个量 · 0 步 · 量纲 —— · 目标值 ——`。
 *
 * **零个符号、零个步骤是它唯一正常的初始状态。**
 * 旧族 §8 要符号 ≥ 5、已知量 ≥ 2、步骤 ≥ 6、表达式树节点 ≥ 30、
 * 叙述总字符 ≥ 400、源 ≥ 16 KiB——那是一份要上货架的成品推导页的合格线。
 *
 * 状态条里「量纲」与「目标值」两格用**不带 bind 的表格行**渲成「——」：
 * 这两样在没有推导链时不是 0、也不是任何数，它们根本还不存在。
 * 呈现层对没有 bind 的行取 `null`（`interactive-doc-render.ts:512`），
 * 正好渲成占位符。而「0 个量 · 0 步」是真零，照实绑成 metric。
 */
export const FORMULA_WALKTHROUGH_INITIAL_STATE: DocState = {
  pluginId: "formula-derivation-walkthrough",
  displayName: "公式展开",
  kernel: "interactive-doc",
  contentType: "interactive_doc",
  title: "空白推导链与精度档位",
  firstScreen:
    "左栏是空符号表，表头「符号 / 单位 / 角色」照常渲染，一枚「加一个量」；右栏写着还没有推导步骤，「写第一步」在有符号之前是禁用的；底部状态条：0 个量 · 0 步 · 量纲 —— · 目标值 ——。",
  firstAction: "加一个量",
  builtInData: Object.freeze([]),
  project: {
    schema: "oceanleo.interactive-doc.v1",
    version: 1,
    metadata: {
      title: "空白推导链与精度档位",
      summary:
        "一台能改数的推导机：改任何一个已知量，下游步骤跟着重算，不依赖它的项逐位不变。",
      locale: "zh-CN",
      docKind: "formula-walkthrough",
      createdAt: CREATED_AT,
    },
    theme: THEME,
    parameters: [
      {
        id: "symbol_count",
        label: "已列出的量",
        help: "角色四选一：已知量 / 常数 / 派生量 / 目标量。",
        kind: "integer",
        unit: "个",
        min: 0,
        max: 64,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "step_count",
        label: "推导步数",
        help: "一步的推导也是推导，不设「至少 6 步」的门槛。",
        kind: "integer",
        unit: "步",
        min: 0,
        max: 24,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "input_significant_digits",
        label: "输入有效位数",
        help: "决定中间保留位：2 位留 6、3 位留 8、4 位留 10、6 位以上留 12。",
        kind: "integer",
        unit: "位",
        min: 2,
        max: 12,
        step: 1,
        default: 4,
        control: "stepper",
      },
      {
        id: "display_precision",
        label: "显示精度",
        help: "只作用于显示层，不改数值本身。",
        kind: "integer",
        unit: "位",
        min: 0,
        max: 12,
        step: 1,
        default: 4,
        control: "stepper",
      },
      {
        id: "approximation_error_cap",
        label: "近似步相对误差上限",
        kind: "number",
        unit: "倍",
        min: 0,
        max: 1,
        step: 0.01,
        precision: 2,
        default: 0.1,
        control: "slider",
      },
    ],
    computations: [
      {
        id: "symbol_total",
        label: "量",
        // 真零：一个量都还没列，「0 个量」说得通，加第一个符号后立刻变 1，
        // 那一跳本身就解释了「加东西会怎样」。
        expression: "symbol_count",
        unit: "个",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "step_total",
        label: "步",
        expression: "step_count",
        unit: "步",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "steps_remaining",
        label: "还能加几步",
        expression: "step_max - step_count",
        unit: "步",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "intermediate_digits",
        label: "中间保留位",
        // 精度传播档位表，中间多留 4–8 位是为了防截断累积：
        // 不留的话 8 步之后末位偏差会进到显示位。
        expression:
          "if(input_significant_digits <= 2, 6, if(input_significant_digits <= 3, 8, if(input_significant_digits <= 4, 10, 12)))",
        unit: "位",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "average_steps_per_symbol",
        label: "平均每个量几步",
        // 一个量都没有时是 0/0：还没有这回事，显示「—」。
        expression: "step_count / symbol_count",
        unit: "步/个",
        precision: 2,
        guard: GUARD,
      },
      constantNode("step_max", "步骤数上限（运行时）", "24", "步", 0),
      constantNode("function_whitelist_size", "白名单函数", "24", "个", 0),
      constantNode("si_prefix_count", "SI 词头", "24", "档", 0),
      constantNode("tree_depth_max", "表达式树深度上限", "12", "层", 0),
      constantNode("node_argument_max", "单节点参数上限", "4", "个", 0),
      constantNode("recompute_budget_ms", "重算耗时预算", "80", "毫秒", 0),
      constantNode("cycle_tolerance", "依赖图成环容忍", "0", "条", 0),
      constantNode("undefined_symbol_tolerance", "未定义符号容忍", "0", "个", 0),
      constantNode("dimension_mismatch_tolerance", "量纲不一致容忍", "0", "步", 0),
      constantNode("step_basis_count", "步骤依据种类", "7", "种", 0),
    ],
    blocks: [
      {
        id: "intro",
        kind: "prose",
        span: 12,
        text: "这条推导链现在是空的：零个量、零个步骤，这是它唯一正常的初始状态。你要做的第一件事是在左边列出这个公式里出现的量——名字、中文标签、单位、角色，角色是已知量、常数、派生量、目标量四选一。列完至少一个量，右边的「写第一步」才解禁；这不是刁难，是唯一正确的顺序，表达式要引用符号，符号不存在就写不出来。这台机器的核心行为是：改任何一个已知量，依赖它的下游步骤会自动重算，而不依赖它的步骤逐位不变。这不是性能优化，是正确性要求——讲课的人正是靠「哪一项没变」来说清哪一项跟初速度有关、哪一项无关。每一步都要写一句人话解释这步在干什么，并选一个依据：定义、代入、代数变形、恒等式、取极限、单位换算、近似，七选一。这张依据表同时是量纲校验的依据，只有单位换算那一档允许左右单位不同。除零、负数开方、量纲不一致、依赖成环这四类错误一律定位到具体步骤并显示「不可算」，不显示无效数字——那种东西会一路传染下去，让你看不出源头在哪。不设「至少六步才算数」的门槛：一步的推导也是推导。",
      },
      {
        id: "symbol-table",
        kind: "parameter-panel",
        span: 12,
        title: "符号表与精度档（先在左边加一个量）",
        parameterIds: [
          "symbol_count",
          "step_count",
          "input_significant_digits",
          "display_precision",
          "approximation_error_cap",
        ],
      },
      {
        id: "metric-symbols",
        kind: "metric",
        span: 3,
        title: "量",
        bind: "symbol_total",
      },
      { id: "metric-steps", kind: "metric", span: 3, title: "步", bind: "step_total" },
      {
        id: "metric-digits",
        kind: "metric",
        span: 3,
        title: "中间保留位",
        bind: "intermediate_digits",
      },
      {
        id: "metric-remaining",
        kind: "metric",
        span: 3,
        title: "还能加几步",
        bind: "steps_remaining",
      },
      {
        id: "status-bar",
        kind: "table",
        span: 12,
        // 「量纲」与「目标值」两行**故意不给 bind**：没有推导链时它们不是 0，
        // 也不是任何数，是还不存在。呈现层对无 bind 的行取 null，渲成「——」。
        title: "状态条",
        table: {
          rows: [
            { label: "量", bind: "symbol_total", emphasis: "none" },
            { label: "步", bind: "step_total", emphasis: "none" },
            { label: "平均每个量几步", bind: "average_steps_per_symbol", emphasis: "none" },
            { label: "量纲（有步骤之后逐步核对）", emphasis: "none" },
            { label: "目标值（整条链的结果）", emphasis: "total" },
          ],
        },
      },
      {
        id: "precision-table",
        kind: "table",
        span: 6,
        title: "精度与数值边界",
        table: {
          rows: [
            { label: "中间保留位（按当前有效位数档）", bind: "intermediate_digits", emphasis: "none" },
            { label: "表达式树深度上限", bind: "tree_depth_max", emphasis: "none" },
            { label: "单节点参数上限", bind: "node_argument_max", emphasis: "none" },
            { label: "重算耗时预算", bind: "recompute_budget_ms", emphasis: "none" },
          ],
        },
      },
      {
        id: "closure-table",
        kind: "table",
        span: 6,
        title: "封闭集合与零容忍（fail-closed）",
        table: {
          rows: [
            { label: "白名单函数（封闭，未知函数一律拒绝）", bind: "function_whitelist_size", emphasis: "none" },
            { label: "SI 词头", bind: "si_prefix_count", emphasis: "none" },
            { label: "步骤依据种类", bind: "step_basis_count", emphasis: "none" },
            { label: "步骤数上限", bind: "step_max", emphasis: "none" },
            { label: "依赖图成环容忍", bind: "cycle_tolerance", emphasis: "none" },
            { label: "未定义符号容忍", bind: "undefined_symbol_tolerance", emphasis: "none" },
            { label: "量纲不一致容忍", bind: "dimension_mismatch_tolerance", emphasis: "none" },
          ],
        },
      },
      {
        id: "first-action",
        kind: "callout",
        span: 12,
        callout: "info",
        text: "第一个动作：在左栏点「加一个量」，录第一个符号——名字（如 v0）、中文标签（如「初速度」）、单位（如 m/s）、角色（默认已知量）、值。回车保存并空出下一行，可以连续录。录完一个，右栏的「写第一步」就解禁了。",
      },
    ],
    validation: [
      {
        id: "need_first_symbol",
        assert: "symbol_count >= 1",
        message:
          "先在左边加至少一个量：表达式要引用符号，符号不存在就写不出第一步。",
        severity: "info",
      },
      {
        id: "steps_within_runtime_cap",
        assert: "step_count <= step_max",
        message:
          "推导步数超过运行时上限 24 步：拆成两条链，或者把中间结果收成一个派生量。",
        severity: "error",
      },
    ],
    interactions: INTERACTIONS,
    exports: ["pdf", "png", "xlsx"],
    attribution: oceanleoAttribution(
      "OceanLeo 内置初始态：精度传播档位、数值边界与步骤依据表取自公式展开族的数值常量表",
    ),
  },
};

/**
 * 可执行笔记。第一屏：右侧参数栏空着（「先加一个可以改的量」），
 * 左侧文稿栏「这份笔记还是空的」，底部状态条
 * `0 个参数 · 0 个格子 · 0 条依赖 · 无待算`。
 *
 * 这一份尤其不能预置：一份示范笔记里带着别人的参数、别人的公式和别人的断言，
 * 用户要么全删，要么在别人的框架里改，两种都比空白差。
 * 今天用户看到的那份「未命名可算文档（空白起手）· 输入 A / 输入 B / 比例」
 * 就是这个错误的现行版本——它既不是空的，又不是用户的。
 *
 * 状态条那四格里「0 条依赖」和「无待算」都是真零，照实显示；
 * 「平均每个格子几条依赖」这类比值在零格子时显示「—」。
 */
export const EXECUTABLE_NOTEBOOK_INITIAL_STATE: DocState = {
  pluginId: "executable-notebook",
  displayName: "可执行笔记",
  kernel: "interactive-doc",
  contentType: "interactive_doc",
  title: "空白笔记与依赖状态条",
  firstScreen:
    "右侧参数栏空着，只有「加一个参数」；左侧文稿栏写着这份笔记还是空的，三枚入口里「加一个计算格」在没有参数前是禁用的；底部状态条：0 个参数 · 0 个格子 · 0 条依赖 · 无待算。",
  firstAction: "加一个参数",
  builtInData: Object.freeze([]),
  project: {
    schema: "oceanleo.interactive-doc.v1",
    version: 1,
    metadata: {
      title: "空白笔记与依赖状态条",
      summary:
        "改右边的参数，左边引用它的格子会自动重算；闭包外的格子逐位不变。",
      locale: "zh-CN",
      docKind: "executable-note",
      createdAt: CREATED_AT,
    },
    theme: THEME,
    parameters: [
      {
        id: "parameter_count",
        label: "可以改的量",
        help: "没有参数的计算格只能算常数，那是计算器不是笔记。",
        kind: "integer",
        unit: "个",
        min: 0,
        max: 120,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "cell_count",
        label: "格子数",
        help: "五种：文字 / 计算 / 表格 / 图表 / 断言。",
        kind: "integer",
        unit: "个",
        min: 0,
        max: 400,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "dependency_edge_count",
        label: "依赖边",
        kind: "integer",
        unit: "条",
        min: 0,
        max: 2000,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "stale_cell_count",
        label: "待算格",
        help: "上游改了还没算完的格子。每级重算完成后应归零。",
        kind: "integer",
        unit: "个",
        min: 0,
        max: 400,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "assertion_cell_count",
        label: "断言格",
        help: "好东西，但它是你想加时才加的，不是合格线。",
        kind: "integer",
        unit: "个",
        min: 0,
        max: 200,
        step: 1,
        default: 0,
        control: "input",
      },
    ],
    computations: [
      {
        id: "parameter_total",
        label: "参数",
        expression: "parameter_count",
        unit: "个",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "cell_total",
        label: "格子",
        expression: "cell_count",
        unit: "个",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "dependency_total",
        label: "依赖",
        // 真零：0 个格子之间确实是 0 条依赖，这句话成立。
        expression: "dependency_edge_count",
        unit: "条",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "stale_total",
        label: "待算",
        expression: "stale_cell_count",
        unit: "个",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "edges_per_cell",
        label: "平均每个格子几条依赖",
        // 0 个格子时是 0/0：没有平均值这回事，显示「—」。
        expression: "dependency_edge_count / cell_count",
        unit: "条/个",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "assertion_coverage",
        label: "断言覆盖",
        expression: "assertion_cell_count / cell_count",
        unit: "倍",
        precision: 2,
        guard: GUARD,
      },
      constantNode("cell_kind_total", "格子种类", "5", "种", 0),
      constantNode("control_kind_total", "控件种类", "7", "种", 0),
      constantNode("function_whitelist_size", "白名单函数", "24", "个", 0),
      constantNode("l1_budget_ms", "改一个参数值", "40", "毫秒", 0),
      constantNode("l2_budget_ms", "改一个格子的表达式", "80", "毫秒", 0),
      constantNode("l3_budget_ms", "增删格子 / 改依赖", "120", "毫秒", 0),
      constantNode("cycle_tolerance", "依赖成环容忍", "0", "条", 0),
    ],
    blocks: [
      {
        id: "intro",
        kind: "prose",
        span: 12,
        text: "这份笔记还是空的：零个参数、零个格子、零条依赖、没有待算。这是它正常的开始，尤其是这一份不能预置——一份示范笔记里带着别人的参数、别人的公式和别人的断言，你要么全删，要么在别人的框架里改，两种都比空白差。你可以从两条路开始，都合法：加一个可以改的量，或者先写一段文字把想法记下来。加完第一个参数之后，再在左边写一个会算的格子引用它，改参数那个格子就会跟着变——这一句话说的就是这个工具唯一的核心行为。「加一个计算格」在还没有参数时是禁用的，因为没有参数的计算格只能算常数，那是计算器不是笔记。重算分三级：改一个参数值只重算它的下游依赖闭包，改一个格子的表达式还要重建局部依赖边，增删格子或改依赖才全图重建并检环。闭包外的格子必须逐位不变，这不是性能优化而是正确性——你正是靠哪些格子没动来判断依赖关系。依赖成环、引用了不存在的格子、用了白名单外的函数、除零或域外、单个格子求值超时，这五类错误一律定位到具体格子。不设「至少八个格子、至少两条断言」的门槛，把断言设成合格线就等于要求你第一次打开就写自检。",
      },
      {
        id: "notebook-state",
        kind: "parameter-panel",
        span: 12,
        title: "笔记读数",
        parameterIds: [
          "parameter_count",
          "cell_count",
          "dependency_edge_count",
          "stale_cell_count",
          "assertion_cell_count",
        ],
      },
      {
        id: "metric-parameters",
        kind: "metric",
        span: 3,
        title: "参数",
        bind: "parameter_total",
      },
      { id: "metric-cells", kind: "metric", span: 3, title: "格子", bind: "cell_total" },
      {
        id: "metric-dependencies",
        kind: "metric",
        span: 3,
        title: "依赖",
        bind: "dependency_total",
      },
      { id: "metric-stale", kind: "metric", span: 3, title: "待算", bind: "stale_total" },
      {
        id: "status-bar",
        kind: "table",
        span: 12,
        title: "状态条",
        table: {
          rows: [
            { label: "参数", bind: "parameter_total", emphasis: "none" },
            { label: "格子", bind: "cell_total", emphasis: "none" },
            { label: "依赖", bind: "dependency_total", emphasis: "none" },
            { label: "平均每个格子几条依赖", bind: "edges_per_cell", emphasis: "none" },
            { label: "断言覆盖", bind: "assertion_coverage", emphasis: "none" },
            { label: "待算（每级重算后应归零）", bind: "stale_total", emphasis: "total" },
          ],
        },
      },
      {
        id: "recompute-table",
        kind: "table",
        span: 6,
        title: "三级重算预算",
        table: {
          rows: [
            { label: "改一个参数值（只算下游闭包）", bind: "l1_budget_ms", emphasis: "none" },
            { label: "改一个格子的表达式", bind: "l2_budget_ms", emphasis: "none" },
            { label: "增删格子 / 改依赖（全图重建 + 检环）", bind: "l3_budget_ms", emphasis: "none" },
          ],
        },
      },
      {
        id: "capability-table",
        kind: "table",
        span: 6,
        title: "这台机器自带的东西（没有数据集，只有函数集合）",
        table: {
          rows: [
            { label: "格子种类（文字/计算/表格/图表/断言）", bind: "cell_kind_total", emphasis: "none" },
            { label: "控件种类", bind: "control_kind_total", emphasis: "none" },
            { label: "白名单函数", bind: "function_whitelist_size", emphasis: "none" },
            { label: "依赖成环容忍", bind: "cycle_tolerance", emphasis: "none" },
          ],
        },
      },
      {
        id: "first-action",
        kind: "callout",
        span: 12,
        callout: "info",
        text: "第一个动作两条路都行：点「加一个参数」（标签、控件、值、单位、范围与步长），或者直接「写一段文字」。加完第一个参数，在左边写个格子引用它，改这里的值，那个格子就会跟着变。",
      },
    ],
    validation: [
      {
        id: "need_first_parameter",
        assert: "parameter_count >= 1",
        message:
          "先加一个可以改的量，或者直接写一段文字。加完参数，在左边写个会算的格子引用它，改参数那个格子就会跟着变。",
        severity: "info",
      },
      {
        id: "stale_within_cells",
        assert: "stale_cell_count <= cell_count",
        message: "待算格数不能超过格子总数。",
        severity: "error",
      },
    ],
    interactions: INTERACTIONS,
    exports: ["xlsx", "pdf", "png"],
    attribution: oceanleoAttribution(
      "OceanLeo 内置初始态：三级重算预算、格子与控件种类取自可执行笔记族的数值常量表",
    ),
  },
};

export const WORKBENCH_INITIAL_STATES: readonly DocState[] = Object.freeze([
  METRICS_DASHBOARD_INITIAL_STATE,
  FORMULA_WALKTHROUGH_INITIAL_STATE,
  EXECUTABLE_NOTEBOOK_INITIAL_STATE,
]);

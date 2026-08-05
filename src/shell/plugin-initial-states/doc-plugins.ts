/**
 * `interactive-doc` 内核的三个插件：间隔排程、换算器、金融计算器。
 *
 * 这三件今天都落在同一份通用起手件上，第一屏是「输入 A / 输入 B / 比例」——
 * 参数没有名字，公式没有出处，用户看不出这是干什么的。这里给每一件配上
 * **有名有姓的参数与查证过的公式**：
 *
 * - 间隔排程的 SM-2 取值出自 `L3-families/spaced-repetition-scheduler.md:60-64`
 *   （EF 初值 2.5、下限 1.3、`I(1)=1 d`、`I(2)=6 d`、`I(n)=ceil(I(n−1)×EF)`）。
 *   **零张卡就是它唯一正常的初始态**：该文件 §8 要求 `cards[] ≥ 30`、空壳降级
 *   `view_only`，那是素材口径，已作废，这里不遵守。
 * - 换算器的精确因子出自 `L3-families/unit-converter.md` §4（英尺 0.3048 m、
 *   磅 0.453 592 37 kg、华氏斜率 1.8 / 偏移 32，均为定义值）。第一屏写死长度、
 *   重量、温度三组，不给通用换算表 —— 通用表等于没有默认，用户还是不知道该点哪。
 * - 金融计算器的等额本息公式出自 `L3-families/financial-calculator.md` §4.1，
 *   利率与期数值域出自该文件 §4 常量表。
 */

import type { PluginInteractiveDocInitialState } from "./types";

const CREATED_AT = "2026-08-05T00:00:00Z";
const THEME = { accent: "#1F6FEB", density: "regular", gridColumns: 12 };
const GUARD = { onDivideByZero: "null", onNaN: "null" };
const INTERACTIONS = {
  recomputeMode: "on-change",
  resetEnabled: true,
  scenarioSlots: 0,
  maxRecomputeMs: 200,
};
const OCEANLEO_ATTRIBUTION = {
  entries: [
    {
      text: "OceanLeo 内置初始态；参数与公式取自各族 L3 规格的数值常量表",
      licenseCode: "CC0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    },
  ],
};

/**
 * 间隔排程。第一屏：空的复习队列（有列头、零张卡）+ 摊开的 SM-2 参数 +
 * 按当前参数算出来的前四次复习日。用户第一个动作是加第一张卡。
 */
export const SPACED_REPETITION_INITIAL_STATE: PluginInteractiveDocInitialState = {
  pluginId: "spaced-repetition-scheduler",
  displayName: "间隔排程",
  kernel: "interactive-doc",
  contentType: "interactive_doc",
  title: "未命名复习计划（尚无卡片）",
  firstScreen:
    "空的复习队列（今日到期 0 张）、可见的 SM-2 参数，以及按这组参数排出的前四次复习日。",
  firstAction: "加第一张卡",
  builtInData: Object.freeze([]),
  project: {
    schema: "oceanleo.interactive-doc.v1",
    version: 1,
    metadata: {
      title: "未命名复习计划（尚无卡片）",
      summary: "零张卡是正常的开始：先把参数看清楚，再加第一张卡。",
      locale: "zh-CN",
      docKind: "spaced-repetition",
      createdAt: CREATED_AT,
    },
    theme: THEME,
    parameters: [
      {
        id: "ef_initial",
        label: "难度系数初值 EF",
        help: "SM-2 的初始易度因子。每答对一次上调，答错下调，不低于下限。",
        kind: "number",
        unit: "倍",
        min: 1.3,
        max: 2.8,
        step: 0.1,
        precision: 2,
        default: 2.5,
        control: "stepper",
      },
      {
        id: "ef_floor",
        label: "难度系数下限",
        kind: "number",
        unit: "倍",
        min: 1.3,
        max: 2,
        step: 0.1,
        precision: 2,
        default: 1.3,
        control: "stepper",
      },
      {
        id: "first_interval_days",
        label: "第一次复习间隔",
        kind: "integer",
        unit: "天",
        min: 1,
        max: 3,
        step: 1,
        default: 1,
        control: "stepper",
      },
      {
        id: "second_interval_days",
        label: "第二次复习间隔",
        kind: "integer",
        unit: "天",
        min: 2,
        max: 10,
        step: 1,
        default: 6,
        control: "stepper",
      },
      {
        id: "daily_new_limit",
        label: "每天最多新卡",
        kind: "integer",
        unit: "张",
        min: 1,
        max: 200,
        step: 1,
        default: 20,
        control: "slider",
      },
      {
        id: "daily_review_limit",
        label: "每天最多复习",
        kind: "integer",
        unit: "张",
        min: 10,
        max: 2000,
        step: 10,
        default: 200,
        control: "slider",
      },
    ],
    // 这里**没有** `datasets`：`oceanleo.interactive-doc.v1` 要求
    // `datasets[].source.inline` 至少一行（素材口径的遗留），零张卡的空卡表按这套
    // schema 表达不出来。空队列因此落在下面的「今日到期 = 0」与排期预览上，
    // 卡表本身等载体侧放宽后再补 —— 见 signals/W14-request.md。
    computations: [
      {
        id: "third_interval_days",
        label: "第三次复习间隔",
        expression: "ceil(second_interval_days * ef_initial)",
        unit: "天",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "fourth_interval_days",
        label: "第四次复习间隔",
        expression: "ceil(third_interval_days * ef_initial)",
        unit: "天",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "first_month_capacity",
        label: "首月可排入新卡",
        expression: "daily_new_limit * 30",
        unit: "张",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "due_today",
        label: "今日到期",
        // 一张卡都还没有，今天当然是 0 张。加进第一张卡后由卡表接管。
        expression: "0",
        unit: "张",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "review_day_1",
        label: "第一次复习",
        expression: "first_interval_days",
        unit: "第几天",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "review_day_2",
        label: "第二次复习",
        expression: "first_interval_days + second_interval_days",
        unit: "第几天",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "review_day_3",
        label: "第三次复习",
        expression: "review_day_2 + third_interval_days",
        unit: "第几天",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "review_day_4",
        label: "第四次复习",
        expression: "review_day_3 + fourth_interval_days",
        unit: "第几天",
        precision: 0,
        guard: GUARD,
      },
    ],
    blocks: [
      {
        id: "intro",
        kind: "prose",
        span: 12,
        text: "这份复习计划现在是空的 —— 零张卡是它正常的开始，不是出错。间隔排程按 SM-2 排期：第一次复习在第 1 天，第二次在第 6 天，之后每次的间隔等于上一次间隔乘以这张卡的难度系数并向上取整到整天。难度系数初值 2.5，答错会往下调，最低 1.3；卡越难，下一次复习来得越早。下面这组参数决定了整副牌的节奏，你可以先改参数，也可以直接加第一张卡 —— 加进来的卡会立刻按上面的间隔排进队列。",
      },
      {
        id: "params",
        kind: "parameter-panel",
        span: 12,
        title: "排期参数",
        parameterIds: [
          "ef_initial",
          "ef_floor",
          "first_interval_days",
          "second_interval_days",
          "daily_new_limit",
          "daily_review_limit",
        ],
      },
      {
        id: "metric-due-today",
        kind: "metric",
        span: 3,
        title: "今日到期",
        bind: "due_today",
      },
      {
        id: "metric-third",
        kind: "metric",
        span: 3,
        title: "第三次复习",
        bind: "third_interval_days",
      },
      {
        id: "metric-fourth",
        kind: "metric",
        span: 3,
        title: "第四次复习",
        bind: "fourth_interval_days",
      },
      {
        id: "metric-capacity",
        kind: "metric",
        span: 3,
        title: "首月可排入",
        bind: "first_month_capacity",
      },
      {
        id: "schedule-preview",
        kind: "table",
        span: 12,
        title: "一张今天加进来的卡，会在这几天回来",
        table: {
          rows: [
            { label: "第一次复习", bind: "review_day_1", emphasis: "none" },
            { label: "第二次复习", bind: "review_day_2", emphasis: "none" },
            { label: "第三次复习", bind: "review_day_3", emphasis: "none" },
            { label: "第四次复习", bind: "review_day_4", emphasis: "total" },
          ],
        },
      },
      {
        id: "how-to-start",
        kind: "callout",
        span: 12,
        callout: "info",
        text: "加第一张卡：写正面与背面即可，难度系数、间隔与到期日由排程自动写入。",
      },
    ],
    interactions: INTERACTIONS,
    exports: ["csv", "pdf"],
    attribution: OCEANLEO_ATTRIBUTION,
  },
};

/**
 * 换算器。第一屏写死长度、重量、温度三组，每组一个输入加一个目标单位，
 * 因子全是定义值（精确），不是近似。
 */
export const UNIT_CONVERTER_INITIAL_STATE: PluginInteractiveDocInitialState = {
  pluginId: "unit-converter",
  displayName: "换算器",
  kernel: "interactive-doc",
  contentType: "interactive_doc",
  title: "长度 · 重量 · 温度换算",
  firstScreen:
    "三组换算各自摆好：长度（米→英尺等）、重量（千克→磅等）、温度（摄氏→华氏与开尔文），输入框里已有可改的默认值，结果即时算。",
  firstAction: "改一个数看结果",
  builtInData: Object.freeze([]),
  project: {
    schema: "oceanleo.interactive-doc.v1",
    version: 1,
    metadata: {
      title: "长度 · 重量 · 温度换算",
      summary: "三组常用换算，因子取定义值，精确不含近似。",
      locale: "zh-CN",
      docKind: "calculator",
      createdAt: CREATED_AT,
    },
    theme: THEME,
    parameters: [
      {
        id: "length_metres",
        label: "长度",
        kind: "number",
        unit: "m",
        min: -1000000000,
        max: 1000000000,
        step: 0.1,
        precision: 6,
        default: 1,
        control: "input",
      },
      {
        id: "length_target_factor",
        label: "换算到",
        kind: "enum",
        // 每个选项的值就是「1 目标单位 = 多少米」，全部是定义值。
        options: [
          { value: 0.3048, label: "英尺 ft（0.3048 m，定义值）" },
          { value: 0.0254, label: "英寸 in（0.0254 m，定义值）" },
          { value: 0.9144, label: "码 yd（0.9144 m，定义值）" },
          { value: 1609.344, label: "英里 mi（1 609.344 m，定义值）" },
          { value: 1852, label: "海里 nmi（1 852 m，定义值）" },
          { value: 1000, label: "公里 km（1 000 m）" },
        ],
        default: 0.3048,
        control: "select",
      },
      {
        id: "mass_kilograms",
        label: "重量",
        kind: "number",
        unit: "kg",
        min: -1000000000,
        max: 1000000000,
        step: 0.1,
        precision: 6,
        default: 1,
        control: "input",
      },
      {
        id: "mass_target_factor",
        label: "换算到",
        kind: "enum",
        options: [
          { value: 0.45359237, label: "磅 lb（0.453 592 37 kg，定义值）" },
          {
            value: 0.028349523125,
            label: "常衡盎司 oz（28.349 523 125 g，由磅定义）",
          },
          {
            value: 0.0311034768,
            label: "金衡盎司 ozt（31.103 476 8 g，定义值）",
          },
          { value: 907.18474, label: "短吨 ton（907.184 74 kg，由磅定义）" },
          { value: 1000, label: "公吨 t（1 000 kg）" },
        ],
        default: 0.45359237,
        control: "select",
      },
      {
        id: "temperature_celsius",
        label: "温度",
        kind: "number",
        unit: "°C",
        min: -273.15,
        max: 100000,
        step: 0.5,
        precision: 4,
        default: 25,
        control: "input",
      },
    ],
    computations: [
      {
        id: "length_converted",
        label: "长度换算结果",
        expression: "length_metres / length_target_factor",
        precision: 6,
        guard: GUARD,
      },
      {
        id: "mass_converted",
        label: "重量换算结果",
        expression: "mass_kilograms / mass_target_factor",
        precision: 6,
        guard: GUARD,
      },
      {
        id: "temperature_fahrenheit",
        label: "华氏",
        expression: "temperature_celsius * 1.8 + 32",
        unit: "°F",
        precision: 4,
        guard: GUARD,
      },
      {
        id: "temperature_kelvin",
        label: "开尔文",
        expression: "temperature_celsius + 273.15",
        unit: "K",
        precision: 4,
        guard: GUARD,
      },
    ],
    blocks: [
      {
        id: "intro",
        kind: "prose",
        span: 12,
        text: "三组常用换算摆在同一屏上：长度、重量、温度。每组的换算因子都取定义值 —— 英尺正好是 0.3048 米，磅正好是 0.453 592 37 千克，华氏与摄氏之间正好是乘 1.8 加 32，这些不是测出来的近似数，所以来回换算不会掉精度。改任何一个输入框，右边的结果立刻重算；换算一律经基准单位（米、千克、开尔文）中转，避免为每一对单位单独维护一张因子表。要别的量纲（面积、压强、能量、数据量）可以自己加一组。",
      },
      {
        id: "length-panel",
        kind: "parameter-panel",
        span: 6,
        title: "长度",
        parameterIds: ["length_metres", "length_target_factor"],
      },
      {
        id: "length-result",
        kind: "metric",
        span: 6,
        title: "长度换算结果",
        bind: "length_converted",
      },
      {
        id: "mass-panel",
        kind: "parameter-panel",
        span: 6,
        title: "重量",
        parameterIds: ["mass_kilograms", "mass_target_factor"],
      },
      {
        id: "mass-result",
        kind: "metric",
        span: 6,
        title: "重量换算结果",
        bind: "mass_converted",
      },
      {
        id: "temperature-panel",
        kind: "parameter-panel",
        span: 6,
        title: "温度",
        parameterIds: ["temperature_celsius"],
      },
      {
        id: "temperature-table",
        kind: "table",
        span: 6,
        title: "温度换算结果",
        table: {
          rows: [
            { label: "华氏 °F", bind: "temperature_fahrenheit", emphasis: "none" },
            { label: "开尔文 K", bind: "temperature_kelvin", emphasis: "none" },
          ],
        },
      },
    ],
    validation: [
      {
        id: "absolute_zero",
        assert: "temperature_kelvin >= 0",
        message: "低于绝对零度：开尔文不会是负数，请检查摄氏输入。",
        severity: "error",
      },
    ],
    interactions: INTERACTIONS,
    exports: ["csv", "pdf"],
    attribution: OCEANLEO_ATTRIBUTION,
  },
};

/**
 * 金融计算器。第一屏是等额本息月供，参数有名有姓：本金、年利率、期数。
 * 公式 `P × i × (1+i)^n / ((1+i)^n − 1)`，与内核白名单里的 `pmt()` 同解。
 */
export const FINANCIAL_CALCULATOR_INITIAL_STATE: PluginInteractiveDocInitialState = {
  pluginId: "financial-calculator",
  displayName: "金融计算器",
  kernel: "interactive-doc",
  contentType: "interactive_doc",
  title: "等额本息月供试算",
  firstScreen:
    "本金、年利率、期数三个有名有姓的输入，算出每月还款、利息总额、还款总额与首月利息，并摊开等额本息公式。",
  firstAction: "改本金或利率",
  builtInData: Object.freeze([]),
  project: {
    schema: "oceanleo.interactive-doc.v1",
    version: 1,
    metadata: {
      title: "等额本息月供试算",
      summary: "月利率 = 年利率 ÷ 12，按月复利；结果为测算值，不构成报价。",
      locale: "zh-CN",
      docKind: "calculator",
      createdAt: CREATED_AT,
    },
    theme: THEME,
    parameters: [
      {
        id: "principal",
        label: "贷款本金",
        kind: "currency",
        unit: "元",
        min: 0.01,
        max: 1000000000000,
        step: 10000,
        precision: 2,
        default: 1000000,
        control: "input",
      },
      {
        id: "annual_rate_percent",
        label: "年利率",
        kind: "percent",
        unit: "%",
        min: 0,
        max: 100,
        step: 0.05,
        precision: 4,
        default: 4.2,
        control: "input",
      },
      {
        id: "months",
        label: "期数",
        kind: "integer",
        unit: "期",
        min: 1,
        max: 600,
        step: 12,
        default: 360,
        control: "stepper",
      },
    ],
    computations: [
      {
        id: "monthly_rate",
        label: "月利率",
        expression: "annual_rate_percent / 100 / 12",
        precision: 8,
        guard: GUARD,
      },
      {
        id: "monthly_payment",
        label: "每月还款",
        expression: "pmt(monthly_rate, months, principal)",
        unit: "元",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "total_payment",
        label: "还款总额",
        expression: "monthly_payment * months",
        unit: "元",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "total_interest",
        label: "利息总额",
        expression: "total_payment - principal",
        unit: "元",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "first_month_interest",
        label: "首月利息",
        expression: "principal * monthly_rate",
        unit: "元",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "doubling_years",
        label: "72 法则翻倍年数",
        expression: "72 / annual_rate_percent",
        unit: "年",
        precision: 2,
        guard: GUARD,
      },
    ],
    blocks: [
      {
        id: "intro",
        kind: "prose",
        span: 12,
        text: "这是等额本息的月供试算：每期还的钱一样多，前期利息占比高、后期本金占比高。月利率取年利率除以十二，期数按月计。改本金、利率或期数，四个结果同时重算。等额本息之外还有等额本金 —— 每期本金相同、利息递减，首期还得多、后期还得少，总利息比等额本息低；要比较两种口径可以在这份文档里再加一组公式。下面的数字是按你填的参数算出来的测算值，不含手续费、保险与提前还款违约金，也不构成任何机构的报价。",
      },
      {
        id: "params",
        kind: "parameter-panel",
        span: 12,
        title: "贷款条件",
        parameterIds: ["principal", "annual_rate_percent", "months"],
      },
      {
        id: "metric-monthly",
        kind: "metric",
        span: 3,
        title: "每月还款",
        bind: "monthly_payment",
      },
      {
        id: "metric-total-interest",
        kind: "metric",
        span: 3,
        title: "利息总额",
        bind: "total_interest",
      },
      {
        id: "metric-total",
        kind: "metric",
        span: 3,
        title: "还款总额",
        bind: "total_payment",
      },
      {
        id: "metric-first-interest",
        kind: "metric",
        span: 3,
        title: "首月利息",
        bind: "first_month_interest",
      },
      {
        id: "formula",
        kind: "formula",
        span: 12,
        title: "等额本息公式",
        formula: {
          computationId: "monthly_payment",
          steps: [
            { expression: "annual_rate_percent / 100 / 12", note: "先把年利率折成月利率 i" },
            {
              expression: "principal * monthly_rate * pow(1 + monthly_rate, months)",
              note: "分子：本金 × i × (1+i)^n",
            },
            {
              expression: "pow(1 + monthly_rate, months) - 1",
              note: "分母：(1+i)^n − 1",
            },
          ],
        },
      },
      {
        id: "rule-of-72",
        kind: "table",
        span: 12,
        title: "参考",
        table: {
          rows: [
            { label: "月利率", bind: "monthly_rate", emphasis: "none" },
            { label: "72 法则翻倍年数", bind: "doubling_years", emphasis: "none" },
          ],
        },
      },
    ],
    validation: [
      {
        id: "positive_payment",
        assert: "monthly_payment > 0",
        message: "每月还款应为正数，请检查本金与利率。",
        severity: "error",
      },
    ],
    interactions: INTERACTIONS,
    exports: ["xlsx", "pdf"],
    attribution: OCEANLEO_ATTRIBUTION,
  },
};

export const INTERACTIVE_DOC_INITIAL_STATES: readonly PluginInteractiveDocInitialState[] =
  Object.freeze([
    SPACED_REPETITION_INITIAL_STATE,
    UNIT_CONVERTER_INITIAL_STATE,
    FINANCIAL_CALCULATOR_INITIAL_STATE,
  ]);

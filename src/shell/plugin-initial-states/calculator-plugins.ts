/**
 * 两台有免责要求的计算台：法律计算器、医疗计算器。
 *
 * 这两份跟 `doc-plugins.ts` 里的金融计算器与换算器有一处**有意的不一致**，
 * 两份插件文档各自写了一整格来论证它：
 *
 * > **有免责与合规要求的两个（医疗、法律）不预填个案参数；金融与换算器预填出厂档位。**
 * > （`docs/specs/oceanleo-plugins-v1/plugins/medical-calculator.md` §5 末段、
 * > `legal-calculator.md` §5 末段，两处同一条规则。）
 *
 * 理由不是洁癖：一个填好了「男 / 40 岁 / 170 cm / 60 kg / eGFR 97.58 / G1」的
 * 医疗计算器，第一眼像是**已经算过这个用户了**，而 G1 是个正常结果，用户读完就走；
 * 一个填好了「月工资 18 000 / 工龄 3 年 / 赔 63 000 元」的法律计算器，
 * 那个 63 000 会被直接截图发出去。金融计算器上不存在这个风险——没人会以为
 * app 知道自己的房贷。
 *
 * **所以这两份第一屏的「空」只空在个案参数上：法条数值表与公式分级带一打开就是满的。**
 * 用户一个字不填，光看那张十级伤残月数表或那张 CKD 分期表，也已经拿到东西了。
 * 旧族规格 §8 把「零数据的计算器」判成不合格品，那是素材口径，本波整节作废。
 *
 * 未填时结果显示「—」而不是 0，靠的是各自的「输入是否在适用域内」判定除零
 * （见 `doc-plugin-kit.ts` 头部第一条）。医疗计算器那边这同时就是旧规格
 * 失败模式 4 要的东西：**任一输入越域，计算整体阻断，不显示一个可疑的数**。
 */

import {
  CREATED_AT,
  GUARD,
  INTERACTIONS,
  THEME,
  constantNode,
  publicFactAttribution,
  type DocState,
} from "./doc-plugin-kit";

const LEGAL_ATTRIBUTION = publicFactAttribution(
  "OceanLeo 内置初始态：档位结构、参数命名与算式编排",
  "法条数值取自《劳动合同法》第 47、87 条与《劳动法》第 44 条等现行规范；法律法规不受著作权保护",
);

const MEDICAL_ATTRIBUTION = publicFactAttribution(
  "OceanLeo 内置初始态：参数结构、适用域判定与算式编排",
  "公式与分级切点取自 CKD-EPI 2021（去种族版）、Mosteller 式与 WHO 成人分级等公开发表事实",
);

/**
 * 法律计算器。默认档「劳动补偿与赔偿金」。
 *
 * 参数与结果的对照点逐条来自
 * `docs/specs/oceanleo-plugins-v1/plugins/legal-calculator.md` §10「可复算的对照点」，
 * 那一节的数值又搬自旧族 `L3-families/legal-calculator.md` §4.3 与 LEG-8..13：
 *
 * - 工作月数 38、月工资 12 000 → 补偿月数 3.5、经济补偿 42 000 元（LEG-8）
 * - 工作月数 44 → 补偿月数 4.0、经济补偿 48 000 元（LEG-8）
 * - 当地均工资 10 000、月工资 40 000、工作月数 180 → 触发封顶、月数 12、补偿 360 000 元（LEG-9）
 * - 经济补偿 48 000 + 违法解除 → 赔偿金 96 000 元（LEG-12）
 *
 * 只做默认这一档。另外三档（工伤待遇 / 诉讼费与时效 / 利息与上限）在
 * `oceanleo.interactive-doc.v1` 里没有「档位」这个概念，硬塞会变成一屏四套互不相干的
 * 参数——那不是第一屏。切档要的是承载层的一个能力，已写进 `signals/W17-request.md`。
 */
export const LEGAL_CALCULATOR_INITIAL_STATE: DocState = {
  pluginId: "legal-calculator",
  displayName: "法律计算器",
  kernel: "interactive-doc",
  contentType: "interactive_doc",
  title: "劳动补偿与赔偿金测算",
  firstScreen:
    "一组空的具名案件参数（月工资、工作月数、当地月平均工资、加班时长），加上一打开就是满的法条数值表：工龄换补偿月数的规则、加班三档倍数、年休假三档天数，底部是常驻免责区。",
  firstAction: "填月工资和工作月数",
  builtInData: Object.freeze([]),
  project: {
    schema: "oceanleo.interactive-doc.v1",
    version: 1,
    metadata: {
      title: "劳动补偿与赔偿金测算",
      summary:
        "中国大陆 · 现行有效法条 · 本工具用于计算与释法示例，不构成法律意见。",
      locale: "zh-CN",
      docKind: "calculator",
      createdAt: CREATED_AT,
    },
    theme: THEME,
    parameters: [
      {
        id: "monthly_wage",
        label: "月工资",
        help: "口径为解除前 12 个月的平均工资，含奖金与津贴。",
        kind: "currency",
        unit: "元",
        min: 0,
        max: 10000000,
        step: 500,
        precision: 2,
        // 0 = 还没填。法条表满、案件参数空，是本插件第一屏的定义。
        default: 0,
        control: "input",
      },
      {
        id: "service_months",
        label: "工作月数",
        help: "在本单位的实际工作月数，零头按月填，补偿月数会按 0.5 档进位。",
        kind: "integer",
        unit: "月",
        min: 0,
        max: 600,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "local_avg_monthly_wage",
        label: "当地上年度职工月平均工资",
        help: "各地不同、每年变，必须由你填；不填则不判定三倍封顶。",
        kind: "currency",
        unit: "元",
        min: 0,
        max: 1000000,
        step: 500,
        precision: 2,
        default: 0,
        control: "input",
      },
      {
        id: "unlawful_termination",
        label: "解除方式",
        kind: "enum",
        options: [
          { value: 0, label: "依法解除（按经济补偿）" },
          { value: 1, label: "违法解除（第 87 条，二倍赔偿金）" },
        ],
        default: 0,
        control: "radio",
      },
      {
        id: "overtime_weekday_hours",
        label: "工作日延时加班",
        kind: "number",
        unit: "小时",
        min: 0,
        max: 744,
        step: 0.5,
        precision: 2,
        default: 0,
        control: "input",
      },
      {
        id: "overtime_restday_hours",
        label: "休息日加班",
        kind: "number",
        unit: "小时",
        min: 0,
        max: 744,
        step: 0.5,
        precision: 2,
        default: 0,
        control: "input",
      },
      {
        id: "overtime_holiday_hours",
        label: "法定节假日加班",
        kind: "number",
        unit: "小时",
        min: 0,
        max: 744,
        step: 0.5,
        precision: 2,
        default: 0,
        control: "input",
      },
      {
        id: "unused_annual_leave_days",
        label: "未休年休假",
        kind: "integer",
        unit: "天",
        min: 0,
        max: 15,
        step: 1,
        default: 0,
        control: "stepper",
      },
    ],
    computations: [
      // ---- 常驻法条数值表：一打开就是满的，与案件参数无关 ----
      constantNode("statute_payroll_days", "月计薪天数", "21.75", "天"),
      constantNode("statute_overtime_weekday", "工作日延时倍数", "1.5", "倍"),
      constantNode("statute_overtime_restday", "休息日倍数", "2", "倍"),
      constantNode("statute_overtime_holiday", "法定节假日倍数", "3", "倍"),
      constantNode("statute_cap_multiple", "三倍封顶倍数", "3", "倍"),
      constantNode("statute_cap_years", "触发封顶时年限上限", "12", "年"),
      constantNode("statute_unlawful_multiple", "违法解除倍数", "2", "倍"),
      constantNode("statute_leave_extra", "未休年休假另付倍数", "2", "倍"),
      constantNode("statute_leave_days_tier1", "满 1 年不满 10 年", "5", "天", 0),
      constantNode("statute_leave_days_tier2", "满 10 年不满 20 年", "10", "天", 0),
      constantNode("statute_leave_days_tier3", "满 20 年以上", "15", "天", 0),
      // ---- 案件参数驱动的结果 ----
      {
        id: "service_full_years",
        label: "整年数",
        expression: "floor(service_months / 12)",
        unit: "年",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "service_remainder_months",
        label: "零头月数",
        expression: "service_months - service_full_years * 12",
        unit: "月",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "severance_months_raw",
        label: "补偿月数（未封顶）",
        // 第 47 条：每满 1 年 1 个月；零头满 6 个月计 1，不满 6 个月计 0.5；
        // 零头为 0 时不加。38 个月 → 3 + 0.5 = 3.5；44 个月 → 3 + 1 = 4.0。
        expression:
          "service_full_years + if(service_remainder_months >= 6, 1, if(service_remainder_months > 0, 0.5, 0))",
        unit: "个月",
        precision: 1,
        guard: GUARD,
      },
      {
        id: "severance_cap_base",
        label: "三倍封顶线",
        expression: "local_avg_monthly_wage * statute_cap_multiple",
        unit: "元",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "cap_triggered",
        label: "是否触发三倍封顶",
        // 当地月平均工资没填就不判定：失败模式 2 明令它是显式输入，缺失时拒绝判封顶。
        expression:
          "if(local_avg_monthly_wage > 0 && monthly_wage > severance_cap_base, 1, 0)",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "severance_base",
        label: "计算基数",
        expression: "if(cap_triggered > 0, severance_cap_base, monthly_wage)",
        unit: "元",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "severance_months",
        label: "补偿月数",
        // 12 年上限只在触发三倍封顶时适用（§10「劳动争议」）。
        expression:
          "if(cap_triggered > 0, min(severance_months_raw, statute_cap_years), severance_months_raw)",
        unit: "个月",
        precision: 1,
        guard: GUARD,
      },
      {
        id: "severance_amount",
        label: "经济补偿",
        expression: "severance_base * severance_months",
        unit: "元",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "unlawful_amount",
        label: "违法解除赔偿金",
        expression:
          "if(unlawful_termination > 0, severance_amount * statute_unlawful_multiple, 0)",
        unit: "元",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "daily_wage",
        label: "日工资",
        expression: "monthly_wage / statute_payroll_days",
        unit: "元",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "hourly_wage",
        label: "小时工资",
        expression: "daily_wage / 8",
        unit: "元",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "overtime_pay",
        label: "加班工资",
        expression:
          "hourly_wage * (overtime_weekday_hours * statute_overtime_weekday + overtime_restday_hours * statute_overtime_restday + overtime_holiday_hours * statute_overtime_holiday)",
        unit: "元",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "annual_leave_pay",
        label: "未休年休假报酬",
        // 300 % 里正常工资那一份已经发过了，这里只算另付的 200 %。
        expression:
          "daily_wage * unused_annual_leave_days * statute_leave_extra",
        unit: "元",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "claim_total",
        label: "主张合计",
        expression:
          "severance_amount + unlawful_amount + overtime_pay + annual_leave_pay",
        unit: "元",
        precision: 2,
        guard: GUARD,
      },
    ],
    blocks: [
      {
        id: "intro",
        kind: "prose",
        span: 12,
        text: "这台计算器现在没有任何案件事实，这是它正常的开始：个案的数字必须由你自己填一遍，填这个动作本身就是在提醒你，算出来的金额取决于你填的事实对不对。下面那几张法条数值表不一样，它们一打开就是满的——工龄怎么换成补偿月数、加班三档各按几倍、未休年休假按几天几倍，全部按现行法条摆在这里，你一个字不填也能直接看。补偿月数按《劳动合同法》第 47 条算：每满一年一个月工资，零头满六个月算一个月、不满六个月算半个月；月工资高于当地上年度职工月平均工资三倍的，按三倍封顶，且年限最多算十二年。违法解除按第 87 条给二倍。当地月平均工资各地不同、每年都变，所以它必须由你填，不填就不判封顶。",
      },
      {
        id: "case-params",
        kind: "parameter-panel",
        span: 12,
        title: "案件事实（先填月工资和工作月数）",
        parameterIds: [
          "monthly_wage",
          "service_months",
          "local_avg_monthly_wage",
          "unlawful_termination",
          "overtime_weekday_hours",
          "overtime_restday_hours",
          "overtime_holiday_hours",
          "unused_annual_leave_days",
        ],
      },
      {
        id: "metric-months",
        kind: "metric",
        span: 3,
        title: "补偿月数",
        bind: "severance_months",
      },
      {
        id: "metric-base",
        kind: "metric",
        span: 3,
        title: "计算基数",
        bind: "severance_base",
      },
      {
        id: "metric-severance",
        kind: "metric",
        span: 3,
        title: "经济补偿",
        bind: "severance_amount",
      },
      {
        id: "metric-unlawful",
        kind: "metric",
        span: 3,
        title: "违法解除赔偿金",
        bind: "unlawful_amount",
      },
      {
        id: "result-detail",
        kind: "table",
        span: 12,
        title: "逐项明细（各项之和即主张合计）",
        table: {
          rows: [
            { label: "经济补偿（第 47 条）", bind: "severance_amount", emphasis: "none" },
            { label: "违法解除赔偿金（第 87 条）", bind: "unlawful_amount", emphasis: "none" },
            { label: "加班工资（《劳动法》第 44 条）", bind: "overtime_pay", emphasis: "none" },
            { label: "未休年休假报酬（年休假条例第 5 条）", bind: "annual_leave_pay", emphasis: "none" },
            { label: "主张合计", bind: "claim_total", emphasis: "total" },
          ],
        },
      },
      {
        id: "formula-severance",
        kind: "formula",
        span: 12,
        title: "经济补偿是怎么算出来的",
        formula: {
          computationId: "severance_amount",
          steps: [
            {
              expression: "floor(service_months / 12)",
              note: "先取整年数：每满一年计一个月工资",
            },
            {
              expression:
                "if(service_remainder_months >= 6, 1, if(service_remainder_months > 0, 0.5, 0))",
              note: "零头满 6 个月计 1 个月，不满 6 个月计 0.5 个月",
            },
            {
              expression: "if(cap_triggered > 0, severance_cap_base, monthly_wage)",
              note: "计算基数：触发三倍封顶时改按当地月平均工资 × 3",
            },
            {
              expression: "severance_base * severance_months",
              note: "基数 × 月数",
            },
          ],
        },
      },
      {
        id: "statute-severance",
        kind: "table",
        span: 6,
        title: "法条数值 · 补偿与封顶（《劳动合同法》第 47、87 条）",
        table: {
          rows: [
            { label: "三倍封顶倍数", bind: "statute_cap_multiple", emphasis: "none" },
            { label: "触发封顶时年限上限", bind: "statute_cap_years", emphasis: "none" },
            { label: "违法解除倍数", bind: "statute_unlawful_multiple", emphasis: "none" },
            { label: "月计薪天数", bind: "statute_payroll_days", emphasis: "none" },
          ],
        },
      },
      {
        id: "statute-overtime",
        kind: "table",
        span: 6,
        title: "法条数值 · 加班倍数（《劳动法》第 44 条）",
        table: {
          rows: [
            { label: "工作日延时", bind: "statute_overtime_weekday", emphasis: "none" },
            { label: "休息日", bind: "statute_overtime_restday", emphasis: "none" },
            { label: "法定节假日", bind: "statute_overtime_holiday", emphasis: "none" },
          ],
        },
      },
      {
        id: "statute-leave",
        kind: "table",
        span: 12,
        title: "法条数值 · 年休假天数与报酬（《职工带薪年休假条例》第 3、5 条）",
        table: {
          rows: [
            { label: "满 1 年不满 10 年", bind: "statute_leave_days_tier1", emphasis: "none" },
            { label: "满 10 年不满 20 年", bind: "statute_leave_days_tier2", emphasis: "none" },
            { label: "满 20 年以上", bind: "statute_leave_days_tier3", emphasis: "none" },
            { label: "未休时另付倍数（合计 300 %）", bind: "statute_leave_extra", emphasis: "none" },
          ],
        },
      },
      {
        id: "disclaimer",
        kind: "callout",
        span: 12,
        callout: "warn",
        text: "本工具只按现行法条做数值计算，不是法律意见，也不预测裁判结果。实际金额取决于证据、当地口径与个案情节，请以律师意见和法院认定为准。每条公式旁标注的法条与施行日期是它的依据：《劳动合同法》第 47、87 条自 2008-01-01 施行，《职工带薪年休假条例》自 2008-01-01 施行。",
      },
    ],
    validation: [
      {
        id: "need_case_facts",
        assert: "monthly_wage > 0 && service_months > 0",
        message:
          "填月工资和工作月数两格，补偿月数与经济补偿当场出数。",
        severity: "info",
      },
      {
        id: "need_local_average",
        assert: "local_avg_monthly_wage > 0",
        message:
          "需填当地上年度职工月平均工资，才能判定是否触发三倍封顶。",
        severity: "info",
      },
      {
        id: "cap_notice",
        // 触发封顶时这条转红，就是「不许悄悄把 40 000 按 30 000 算却不说」那条要求。
        assert: "cap_triggered == 0",
        message:
          "已触发三倍封顶：计算基数改按当地上年度职工月平均工资 × 3，且年限最多算 12 年。",
        severity: "warn",
      },
    ],
    interactions: INTERACTIONS,
    exports: ["pdf", "xlsx"],
    attribution: LEGAL_ATTRIBUTION,
  },
};

/**
 * 医疗计算器。
 *
 * 对照点逐条来自
 * `docs/specs/oceanleo-plugins-v1/plugins/medical-calculator.md` §10：
 *
 * - 身高 170 cm、体重 60 kg → BMI 20.76（MED-8）
 * - 男、40 岁、Scr 1.0 mg/dL → eGFR 97.58、G1（MED-9）
 * - 同上 Scr 2.6 → eGFR 31.00；Scr 4.0 → eGFR 18.49（MED-9）
 * - 血钙 8.4、白蛋白 2.5 → 校正钙 9.60（MED-11）
 *
 * 五张临床量表（GCS / Apgar / qSOFA / CURB-65 / CHA₂DS₂-VASc）第一屏一张都不放：
 * 挂着这枚按键的 app 面对的是拿着体检报告的普通人，把 qSOFA 摆在第一屏，
 * 唯一的效果是让一个感冒的人给自己打分。文档要求收进默认折叠的抽屉，
 * 而 `oceanleo.interactive-doc.v1` 没有「抽屉」这种块，所以本波不放——
 * 不是漏了，见 `signals/W17-request.md`。
 */
export const MEDICAL_CALCULATOR_INITIAL_STATE: DocState = {
  pluginId: "medical-calculator",
  displayName: "医疗计算器",
  kernel: "interactive-doc",
  contentType: "interactive_doc",
  title: "体检指标换算与分级",
  firstScreen:
    "七个空的具名参数（性别、年龄、身高、体重、血肌酐、白蛋白、血钙），四条写出来的公式，以及一打开就是满的两张分级切点表：WHO 成人 BMI 四档与 CKD 六档，底部是常驻免责区。",
  firstAction: "填身高和体重",
  builtInData: Object.freeze([]),
  project: {
    schema: "oceanleo.interactive-doc.v1",
    version: 1,
    metadata: {
      title: "体检指标换算与分级",
      summary:
        "只做公式计算，不是诊断也不是用药建议；输入越出适用域时整体阻断，不出一个可疑的数。",
      locale: "zh-CN",
      docKind: "calculator",
      createdAt: CREATED_AT,
    },
    theme: THEME,
    parameters: [
      {
        id: "sex_female",
        label: "性别",
        help: "进 CKD-EPI 的 κ、α 与女性因子。",
        kind: "enum",
        options: [
          { value: 0, label: "男（κ 0.9 · α −0.302）" },
          { value: 1, label: "女（κ 0.7 · α −0.241 · 另乘 1.012）" },
        ],
        default: 0,
        control: "radio",
      },
      {
        id: "age_years",
        label: "年龄",
        help: "适用域 0–120 岁；CKD-EPI 是成人公式，需满 18 岁。",
        kind: "integer",
        unit: "岁",
        // 下限写 0 是因为 0 在这里表示「还没填」；真正的适用域由下面的
        // validation 逐条守，这正是失败模式 4 要的「越域即阻断」。
        min: 0,
        max: 120,
        step: 1,
        default: 0,
        control: "input",
      },
      {
        id: "height_cm",
        label: "身高",
        help: "适用域 20–250 cm。",
        kind: "number",
        unit: "cm",
        min: 0,
        max: 250,
        step: 0.5,
        precision: 2,
        default: 0,
        control: "input",
      },
      {
        id: "weight_kg",
        label: "体重",
        help: "适用域 0.5–300 kg。分母域下限严格大于 0，填 0 不会得到无穷大。",
        kind: "number",
        unit: "kg",
        min: 0,
        max: 300,
        step: 0.1,
        precision: 2,
        default: 0,
        control: "input",
      },
      {
        id: "serum_creatinine",
        label: "血肌酐",
        help: "mg/dL 体系。µmol/L 除以 88.4 换过来。",
        kind: "number",
        unit: "mg/dL",
        min: 0,
        max: 30,
        step: 0.1,
        precision: 3,
        default: 0,
        control: "input",
      },
      {
        id: "albumin",
        label: "白蛋白",
        help: "mg/dL 体系用 g/dL。g/L 除以 10 换过来。",
        kind: "number",
        unit: "g/dL",
        min: 0,
        max: 8,
        step: 0.1,
        precision: 2,
        default: 0,
        control: "input",
      },
      {
        id: "calcium",
        label: "血钙",
        help: "mg/dL 体系。mmol/L 乘以 4.0 换过来。",
        kind: "number",
        unit: "mg/dL",
        min: 0,
        max: 20,
        step: 0.1,
        precision: 2,
        default: 0,
        control: "input",
      },
    ],
    computations: [
      // ---- 适用域判定：三组输入各一个闸，未填或越域时整组结果显示「—」 ----
      {
        id: "body_inputs_ready",
        label: "身高体重是否在适用域内",
        expression:
          "if(height_cm >= 20 && height_cm <= 250 && weight_kg >= 0.5 && weight_kg <= 300, 1, 0)",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "renal_inputs_ready",
        label: "肾功能输入是否在适用域内",
        // CKD-EPI 声明的是成人公式：套在 2 岁孩子身上必须输出「不适用」而不是一个数。
        expression:
          "if(age_years >= 18 && age_years <= 120 && serum_creatinine > 0, 1, 0)",
        precision: 0,
        guard: GUARD,
      },
      {
        id: "calcium_inputs_ready",
        label: "校正钙输入是否齐全",
        expression: "if(calcium > 0 && albumin > 0, 1, 0)",
        precision: 0,
        guard: GUARD,
      },
      // ---- 四条主公式 ----
      {
        id: "height_m",
        label: "身高（米）",
        expression: "height_cm / 100",
        unit: "m",
        precision: 4,
        guard: GUARD,
      },
      {
        id: "bmi",
        label: "BMI",
        // 除以适用域闸：不在域内时整体阻断成 null，呈现层显示「—」而不是 0。
        expression: "weight_kg / pow(height_m, 2) / body_inputs_ready",
        unit: "kg/m²",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "bsa_mosteller",
        label: "体表面积（Mosteller 式）",
        expression: "sqrt(height_cm * weight_kg / 3600) / body_inputs_ready",
        unit: "m²",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "ckd_kappa",
        label: "CKD-EPI κ",
        expression: "if(sex_female > 0, 0.7, 0.9)",
        unit: "mg/dL",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "ckd_alpha",
        label: "CKD-EPI α",
        expression: "if(sex_female > 0, -0.241, -0.302)",
        precision: 3,
        guard: GUARD,
      },
      {
        id: "scr_ratio",
        label: "Scr / κ",
        // 闸放在这一步：不在适用域内时这里就变成 null，整条 eGFR 链随之为 null，
        // 而不是先算出 pow(0, -0.302) = 无穷大再去兜。
        expression: "serum_creatinine / ckd_kappa / renal_inputs_ready",
        precision: 6,
        guard: GUARD,
      },
      {
        id: "egfr",
        label: "eGFR（CKD-EPI 2021 去种族版）",
        expression:
          "142 * pow(min(scr_ratio, 1), ckd_alpha) * pow(max(scr_ratio, 1), -1.2) * pow(0.9938, age_years) * if(sex_female > 0, 1.012, 1)",
        unit: "mL/min/1.73 m²",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "creatinine_clearance",
        label: "肌酐清除率（Cockcroft-Gault）",
        expression:
          "(140 - age_years) * weight_kg / (72 * serum_creatinine) * if(sex_female > 0, 0.85, 1) / renal_inputs_ready / body_inputs_ready",
        unit: "mL/min",
        precision: 2,
        guard: GUARD,
      },
      {
        id: "corrected_calcium",
        label: "校正钙",
        expression:
          "(calcium + 0.8 * (4.0 - albumin)) / calcium_inputs_ready",
        unit: "mg/dL",
        precision: 2,
        guard: GUARD,
      },
      // ---- 常驻分级切点：一打开就是满的 ----
      constantNode("band_bmi_underweight", "偏瘦上界", "18.5", "kg/m²", 1),
      constantNode("band_bmi_overweight", "超重下界", "25", "kg/m²", 1),
      constantNode("band_bmi_obese", "肥胖下界", "30", "kg/m²", 1),
      constantNode("band_ckd_g1", "G1 下界", "90", "mL/min/1.73 m²", 0),
      constantNode("band_ckd_g2", "G2 下界", "60", "mL/min/1.73 m²", 0),
      constantNode("band_ckd_g3a", "G3a 下界", "45", "mL/min/1.73 m²", 0),
      constantNode("band_ckd_g3b", "G3b 下界", "30", "mL/min/1.73 m²", 0),
      constantNode("band_ckd_g4", "G4 下界", "15", "mL/min/1.73 m²", 0),
      constantNode("unit_creatinine_factor", "肌酐 mg/dL → µmol/L", "88.4", "倍", 1),
      constantNode("unit_calcium_factor", "血钙 mmol/L → mg/dL", "4", "倍", 1),
      constantNode("unit_albumin_factor", "白蛋白 g/dL → g/L", "10", "倍", 0),
    ],
    blocks: [
      {
        id: "intro",
        kind: "prose",
        span: 12,
        text: "这台计算器现在没有任何化验值，这是它正常的开始。个人的数字必须由你照着报告自己填一遍：一个已经填好一套身高体重、结果显示「正常」的计算器，第一眼像是已经算过你了，你可能读完就走。下面四条公式与两张分级切点表不一样，它们一打开就是满的，你一个字不填也能直接看。BMI 是体重除以身高的平方；体表面积用 Mosteller 式，即身高厘米数乘体重公斤数除以三千六百再开平方；eGFR 用 CKD-EPI 2021 去种族版，肌酐、年龄、性别一起代进去；校正钙是实测钙加上零点八乘以四减去白蛋白。任何一项输入越出适用域，那一组结果整体显示为空，不会给你一个看着像真的、其实不能用的数——这一条比多算一个数重要。",
      },
      {
        id: "params",
        kind: "parameter-panel",
        span: 12,
        title: "化验与体格数据（先填身高和体重）",
        parameterIds: [
          "sex_female",
          "age_years",
          "height_cm",
          "weight_kg",
          "serum_creatinine",
          "albumin",
          "calcium",
        ],
      },
      { id: "metric-bmi", kind: "metric", span: 3, title: "BMI", bind: "bmi" },
      {
        id: "metric-bsa",
        kind: "metric",
        span: 3,
        title: "体表面积",
        bind: "bsa_mosteller",
      },
      { id: "metric-egfr", kind: "metric", span: 3, title: "eGFR", bind: "egfr" },
      {
        id: "metric-calcium",
        kind: "metric",
        span: 3,
        title: "校正钙",
        bind: "corrected_calcium",
      },
      {
        id: "formula-egfr",
        kind: "formula",
        span: 12,
        title: "eGFR 是怎么算出来的（CKD-EPI 2021，去种族版）",
        formula: {
          computationId: "egfr",
          steps: [
            {
              expression: "if(sex_female > 0, 0.7, 0.9)",
              note: "先按性别取 κ：女 0.7、男 0.9 mg/dL",
            },
            {
              expression: "serum_creatinine / ckd_kappa",
              note: "肌酐除以 κ，得到低段与高段共用的比值",
            },
            {
              expression:
                "pow(min(scr_ratio, 1), ckd_alpha) * pow(max(scr_ratio, 1), -1.2)",
              note: "低段用 α（女 −0.241 / 男 −0.302），高段固定 −1.200",
            },
            {
              expression: "142 * pow(0.9938, age_years) * if(sex_female > 0, 1.012, 1)",
              note: "前系数 142、年龄因子 0.9938^年龄，女性再乘 1.012",
            },
          ],
        },
      },
      {
        id: "derived-detail",
        kind: "table",
        span: 12,
        title: "全部派生指标",
        table: {
          rows: [
            { label: "BMI（WHO 成人分级）", bind: "bmi", emphasis: "none" },
            { label: "体表面积（Mosteller 式，用于剂量折算）", bind: "bsa_mosteller", emphasis: "none" },
            { label: "eGFR（CKD-EPI 2021 去种族版）", bind: "egfr", emphasis: "none" },
            { label: "肌酐清除率（Cockcroft-Gault）", bind: "creatinine_clearance", emphasis: "none" },
            { label: "校正钙（实测钙 + 0.8 ×（4.0 − 白蛋白））", bind: "corrected_calcium", emphasis: "none" },
          ],
        },
      },
      {
        id: "band-bmi",
        kind: "table",
        span: 6,
        title: "分级切点 · WHO 成人 BMI",
        table: {
          rows: [
            { label: "偏瘦：低于", bind: "band_bmi_underweight", emphasis: "none" },
            { label: "超重：不低于", bind: "band_bmi_overweight", emphasis: "none" },
            { label: "肥胖：不低于", bind: "band_bmi_obese", emphasis: "none" },
          ],
        },
      },
      {
        id: "band-ckd",
        kind: "table",
        span: 6,
        title: "分级切点 · CKD 分期（eGFR 下界）",
        table: {
          rows: [
            { label: "G1 正常", bind: "band_ckd_g1", emphasis: "none" },
            { label: "G2 正常", bind: "band_ckd_g2", emphasis: "none" },
            { label: "G3a 关注", bind: "band_ckd_g3a", emphasis: "none" },
            { label: "G3b 关注", bind: "band_ckd_g3b", emphasis: "none" },
            { label: "G4 危急（低于此为 G5）", bind: "band_ckd_g4", emphasis: "none" },
          ],
        },
      },
      {
        id: "unit-factors",
        kind: "table",
        span: 12,
        title: "单位换算因子（本屏一律用 mg/dL 体系；换算不改分级）",
        table: {
          rows: [
            { label: "肌酐 mg/dL 换 µmol/L：乘", bind: "unit_creatinine_factor", emphasis: "none" },
            { label: "血钙 mmol/L 换 mg/dL：乘", bind: "unit_calcium_factor", emphasis: "none" },
            { label: "白蛋白 g/dL 换 g/L：乘", bind: "unit_albumin_factor", emphasis: "none" },
          ],
        },
      },
      {
        id: "disclaimer",
        kind: "callout",
        span: 12,
        callout: "warn",
        text: "本工具只做公式计算，不是诊断，也不是用药建议。计算结果不能替代医生的判断。指标异常请带原始报告就医。公式版本印在各自标题上：eGFR 为 CKD-EPI 2021 去种族版，体表面积为 Mosteller 式，BMI 分档为 WHO 成人分级。",
      },
    ],
    validation: [
      {
        id: "need_body_inputs",
        assert: "body_inputs_ready > 0",
        message:
          "填身高和体重两格，BMI 与体表面积当场出数并落档；适用域是身高 20–250 cm、体重 0.5–300 kg。",
        severity: "info",
      },
      {
        id: "need_renal_inputs",
        assert: "renal_inputs_ready > 0",
        message:
          "eGFR 还要年龄与血肌酐；CKD-EPI 是成人公式，未满 18 岁时不出数而不是给一个不适用的值。",
        severity: "info",
      },
      {
        id: "need_calcium_inputs",
        assert: "calcium_inputs_ready > 0",
        message: "校正钙要同时有血钙与白蛋白两项。",
        severity: "info",
      },
    ],
    interactions: INTERACTIONS,
    exports: ["pdf", "xlsx", "png"],
    attribution: MEDICAL_ATTRIBUTION,
  },
};

export const CALCULATOR_INITIAL_STATES: readonly DocState[] = Object.freeze([
  LEGAL_CALCULATOR_INITIAL_STATE,
  MEDICAL_CALCULATOR_INITIAL_STATE,
]);

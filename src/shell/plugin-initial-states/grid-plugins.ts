/**
 * `grid` 内核的三个非编辑类插件：台账、文献矩阵、三表模型。
 *
 * 这三件的第一屏是同一个形状：**零行数据，但有列头**。列头（以及三表模型的科目行）
 * 是插件自己的结构，不是别人的内容 —— 一张没有「日期 / 项目 / 金额 / 备注」的台账
 * 不成其为台账，而预先塞几笔账目就成了预置示例数据，那正是要根除的素材口径。
 *
 * 注意 `grid` 内核一身二任：它同时是编辑类插件「表格编辑器」（打开用户上传的
 * xlsx）的渲染内核。编辑类那条路没有初始态 —— 它的内容来自被打开的那件素材。
 */

import type { PluginGridInitialState, PluginInitialSheet } from "./types";

/** 表头一行：加粗、浅底，与 `grid-model` 的 `formats` 同形（键是 `行:列`）。 */
function headerFormats(columnCount: number): Record<string, Record<string, unknown>> {
  const formats: Record<string, Record<string, unknown>> = {};
  for (let column = 0; column < columnCount; column += 1) {
    formats[`0:${column}`] = {
      type: "text",
      bold: true,
      background: "#F1F5F9",
      align: "left",
    };
  }
  return formats;
}

/** 一张只有列头的表：首行列头，其后 `blankRows` 行空行。 */
function headerOnlySheet(
  name: string,
  headers: readonly string[],
  blankRows = 19,
): PluginInitialSheet {
  const width = headers.length;
  const rows: string[][] = [[...headers]];
  for (let row = 0; row < blankRows; row += 1) {
    rows.push(Array.from({ length: width }, () => ""));
  }
  return { name, rows, formats: headerFormats(width) };
}

/**
 * 一张「首列是固定科目、其余列留空」的表。科目行同样是结构：
 * 一张没有「营业收入」的利润表不成其为利润表。
 */
function lineItemSheet(
  name: string,
  headers: readonly string[],
  lineItems: readonly string[],
): PluginInitialSheet {
  const width = headers.length;
  const rows: string[][] = [[...headers]];
  for (const item of lineItems) {
    rows.push([item, ...Array.from({ length: width - 1 }, () => "")]);
  }
  const formats = headerFormats(width);
  for (let row = 1; row <= lineItems.length; row += 1) {
    formats[`${row}:0`] = { type: "text", bold: false, align: "left" };
  }
  return { name, rows, formats };
}

/** 台账。四列列头出自任务书裁定；金额列按金额格式，日期列按日期格式。 */
const LEDGER_SHEET: PluginInitialSheet = (() => {
  const sheet = headerOnlySheet("台账", ["日期", "项目", "金额", "备注"]);
  const formats: Record<string, Record<string, unknown>> = {
    ...(sheet.formats ?? {}),
  };
  for (let row = 1; row < sheet.rows.length; row += 1) {
    formats[`${row}:0`] = { type: "date", align: "left" };
    formats[`${row}:2`] = { type: "currency", decimals: 2, align: "right" };
  }
  return { ...sheet, formats };
})();

export const LEDGER_REGISTER_INITIAL_STATE: PluginGridInitialState = {
  pluginId: "ledger-register",
  displayName: "台账",
  kernel: "grid",
  contentType: "grid",
  title: "未命名台账",
  firstScreen: "一张空台账：日期、项目、金额、备注四列列头，零行数据。",
  firstAction: "记第一笔",
  builtInData: Object.freeze([]),
  sheets: Object.freeze([LEDGER_SHEET]),
};

/**
 * 文献矩阵。抽取表的 12 个字段、偏倚四域、PRISMA 九节点都是方法学结构，
 * 出处 `L3-families/literature-matrix.md` §4.2（抽取字段）与 §4.1（PRISMA 等式）。
 */
export const LITERATURE_MATRIX_INITIAL_STATE: PluginGridInitialState = {
  pluginId: "literature-matrix",
  displayName: "文献矩阵",
  kernel: "grid",
  contentType: "grid",
  title: "未命名文献矩阵",
  firstScreen:
    "三张空表：抽取表 12 个字段列头、偏倚评估四域、PRISMA 九个计数节点，零条题录。",
  firstAction: "录入第一条题录",
  builtInData: Object.freeze([]),
  sheets: Object.freeze([
    headerOnlySheet("抽取", [
      "编号",
      "作者与年份",
      "研究设计",
      "研究对象",
      "样本量",
      "干预/暴露",
      "对照",
      "主要结局",
      "效应量",
      "效应量单位",
      "随访时长(月)",
      "国家/地区",
      "结论摘录",
      "筛选状态",
    ]),
    headerOnlySheet("偏倚评估", [
      "编号",
      "选择与分组",
      "测量与结局评估",
      "缺失数据",
      "报告与利益冲突",
      "总体判定",
    ]),
    lineItemSheet(
      "PRISMA",
      ["节点", "条数", "说明"],
      [
        "检索命中",
        "去重删除",
        "进入筛选",
        "题录排除",
        "待取全文",
        "全文未获取",
        "进入评估",
        "全文排除",
        "最终纳入",
      ],
    ),
  ]),
};

const THREE_STATEMENT_PERIODS = ["第 1 期", "第 2 期", "第 3 期", "第 4 期", "第 5 期"];
const THREE_STATEMENT_HEADERS = ["科目", ...THREE_STATEMENT_PERIODS];

/**
 * 三表模型。五张表的角色与科目行出自
 * `L3-families/three-statement-model.md` §3.1（`sheets[].role` 五角色）、
 * §4.1（12 条勾稽关系涉及的科目）与 §4.2（五条必备检查行）。
 * 期数默认 5 期，是可改的结构默认值，不是内容。
 */
export const THREE_STATEMENT_MODEL_INITIAL_STATE: PluginGridInitialState = {
  pluginId: "three-statement-model",
  displayName: "三表模型",
  kernel: "grid",
  contentType: "grid",
  title: "未命名三表模型",
  firstScreen:
    "五张空表：假设、利润表、现金流量表、资产负债表、检查；科目行齐全，五期数字全空。",
  firstAction: "填第一条假设",
  builtInData: Object.freeze([]),
  sheets: Object.freeze([
    lineItemSheet("假设", THREE_STATEMENT_HEADERS, [
      "收入增长率",
      "毛利率",
      "销售费用率",
      "管理费用率",
      "折旧率",
      "资本支出率",
      "应收周转天数",
      "存货周转天数",
      "应付周转天数",
      "借款利率",
      "股利支付率",
      "所得税率",
    ]),
    lineItemSheet("利润表", THREE_STATEMENT_HEADERS, [
      "营业收入",
      "营业成本",
      "毛利",
      "销售费用",
      "管理费用",
      "折旧摊销",
      "营业利润",
      "利息费用",
      "利润总额",
      "所得税",
      "净利润",
    ]),
    lineItemSheet("现金流量表", THREE_STATEMENT_HEADERS, [
      "净利润",
      "折旧摊销",
      "应收账款变动",
      "存货变动",
      "应付账款变动",
      "经营活动现金流",
      "资本支出",
      "投资活动现金流",
      "借款净额",
      "股利",
      "筹资活动现金流",
      "现金净变动",
      "期末现金",
    ]),
    lineItemSheet("资产负债表", THREE_STATEMENT_HEADERS, [
      "货币资金",
      "应收账款",
      "存货",
      "固定资产净额",
      "资产合计",
      "应付账款",
      "有息负债",
      "负债合计",
      "实收资本",
      "未分配利润",
      "权益合计",
      "负债与权益合计",
    ]),
    // 五条检查的判据与容差是会计恒等式，属于结构；只有「结果」一列等数字进来。
    {
      name: "检查",
      rows: [
        ["检查项", "判据", "容差", "结果"],
        ["平衡表", "资产合计 − (负债合计 + 权益合计) = 0", "0.00 元", ""],
        ["现金勾稽", "期末现金 − 货币资金 = 0", "0.01 元", ""],
        ["留存收益递推", "期末未分配利润 − (期初 + 净利润 − 股利) = 0", "0.01 元", ""],
        ["固定资产递推", "期末净额 − (期初 + 资本支出 − 折旧) = 0", "0.01 元", ""],
        ["债务递推", "期末债务 − (期初 + 提款 − 还款) = 0", "0.01 元", ""],
      ],
      formats: headerFormats(4),
    },
  ]),
};

export const GRID_INITIAL_STATES: readonly PluginGridInitialState[] =
  Object.freeze([
    LEDGER_REGISTER_INITIAL_STATE,
    LITERATURE_MATRIX_INITIAL_STATE,
    THREE_STATEMENT_MODEL_INITIAL_STATE,
  ]);

// ============================================================================
// @oceanleo/ui — 回放页的写死样例
// ----------------------------------------------------------------------------
// `GET /v1/share/<share_id>`（W04）还没上线时，页面拿它开发与自检。任务书明令：
// **不要**为了看见页面去改后端。上线之后这份数据仍然有用——它是「三种预览形态」
// （无 / 长文本 / 表格）同时出现的最小样本。
// ============================================================================

import type { SharedReplay } from "./share-client";

const T0 = Date.parse("2026-08-20T02:00:00.000Z");

function at(secondsFromStart: number): string {
  return new Date(T0 + secondsFromStart * 1000).toISOString();
}

export const REPLAY_SAMPLE: SharedReplay = {
  share_id: "sample",
  title: "看一眼英伟达最近的股价，顺手做张周报封面",
  created_at: at(0),
  messages: [
    {
      id: 1,
      role: "user",
      kind: "text",
      content: "看一眼英伟达最近的股价，顺手做张周报封面。",
      created_at: at(0),
    },
    {
      id: 2,
      role: "assistant",
      kind: "plan",
      content: "先取行情，再按行情里的涨跌做封面配色。",
      created_at: at(2),
    },
    {
      // 老任务的形态：只有工具名与一句话，没有 args_preview / result_preview。
      // 页面必须照常渲染成「无预览」，这一条就是那个回归样本。
      id: 3,
      role: "assistant",
      kind: "step",
      content: "查一下英伟达最近的公开行情",
      meta: { tool: "web_search", step_index: 1, status: "done" },
      created_at: at(4),
    },
    {
      id: 4,
      role: "assistant",
      kind: "step",
      content: "读取行情页",
      meta: {
        tool: "read_url",
        step_index: 2,
        status: "done",
        args_preview: '{"url":"https://finance.yahoo.com/quote/NVDA/history"}',
        result_preview: [
          "日期\t开盘\t最高\t最低\t收盘\t成交量",
          "2026-08-19\t182.40\t186.10\t181.55\t185.220\t41,203,900",
          "2026-08-18\t179.05\t183.22\t178.60\t182.400\t38,551,200",
          "2026-08-17\t176.80\t180.10\t176.05\t179.050\t35,904,700",
          "2026-08-16\t174.20\t177.65\t173.90\t176.800\t33,118,400",
        ].join("\n"),
      },
      created_at: at(7),
    },
    {
      id: 5,
      role: "assistant",
      kind: "step",
      content: "生成周报封面",
      meta: {
        tool: "gen_image",
        step_index: 3,
        status: "done",
        args_preview:
          '{"prompt":"科技风周报封面，主色湖蓝，中央留出标题区，右下角一条上扬折线","ratio":"3:4"}',
        result_preview:
          "已生成 1 张 1024×1365 的封面图，主色 #0ea5e9，右下角折线与本周收盘上扬一致。",
      },
      created_at: at(19),
    },
    {
      id: 6,
      role: "assistant",
      kind: "text",
      content:
        "英伟达最近四个交易日连续收涨，从 176.80 走到 185.22，累计约 +4.8%，成交量同步放大。\n周报封面已经按上扬的走势做成湖蓝配色，中间留了标题区，可以直接填字。",
      meta: { final: true },
      created_at: at(24),
    },
  ],
};

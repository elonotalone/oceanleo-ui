/**
 * `interactive-doc` 内核那批插件共用的几样东西。
 *
 * `doc-plugins.ts` 里 `W14` 那三份把同样的常量各自写了一份；这里不去动它们，
 * 新增的十份共用本文件，避免同一个 accent 色值在十三处各写一遍。
 *
 * ## 两条贯穿十份初始态的做法
 *
 * **一、「还没有数」与「算出来是 0」是两件事，第一屏必须分得开。**
 * 求值器对除零走 `onDivideByZero: "null"`，呈现层拿到 `null` 会渲成
 * `INTERACTIVE_DOC_VALUE_PLACEHOLDER`（`interactive-doc-render.ts:261`，即「—」，
 * 并按 `:275` 走 warn 配色）。所以「零行数据时的均值」写成
 * `合计 / 行数` 就会如实显示「—」，而不是撒谎显示 0。
 * 反过来，台账式的真零——「未作答 = 题目数 − 已答数 = 0」——就照实写 0。
 * 哪一格用哪种，逐份在注释里给了理由，判据是那句话：**0 在这一格是不是真的。**
 *
 * **二、参数一律有名有姓，且第一屏的取值是「空」而不是「示例」。**
 * 案件数、题目数、节点数这类计数默认 0；插件自己的规则参数（及格线、语速、
 * 达成率切点、SM-2 那种）带出厂值，因为那是插件的结构，不是别人的内容。
 */

import type { PluginInteractiveDocInitialState } from "./types";

/** 十份共用同一个创建时刻，序列化后字节确定，便于逐份对账。 */
export const CREATED_AT = "2026-08-05T00:00:00Z";

export const THEME = { accent: "#1F6FEB", density: "regular", gridColumns: 12 };

/**
 * 除零与 NaN 一律回空值。**十份初始态全部依赖这条**：第一屏上那些「—」
 * 就是它产生的，不是漏算。
 */
export const GUARD = { onDivideByZero: "null", onNaN: "null" };

export const INTERACTIONS = {
  recomputeMode: "on-change",
  resetEnabled: true,
  scenarioSlots: 0,
  maxRecomputeMs: 200,
};

const CC0_URL = "https://creativecommons.org/publicdomain/zero/1.0/";
/**
 * 公有领域标记。法条数值与公开发表的医学公式属于**不受著作权保护的公开事实**，
 * 标成 CC0 是错的（CC0 是权利人主动放弃权利，前提是本来有权利）。
 * 与 `geo-plugins.ts` 给 Natural Earth 标 PDM 同一条判法。
 */
const PDM_URL = "https://creativecommons.org/publicdomain/mark/1.0/";

/** 插件自己的结构、算法与文案：是我们写的，放 CC0。 */
export function oceanleoAttribution(text: string) {
  return { entries: [{ text, licenseCode: "CC0", licenseUrl: CC0_URL }] };
}

/** 结构是我们写的（CC0），内置的那批公开事实另起一条（PDM）。 */
export function publicFactAttribution(ownText: string, factText: string) {
  return {
    entries: [
      { text: ownText, licenseCode: "CC0", licenseUrl: CC0_URL },
      { text: factText, licenseCode: "PDM", licenseUrl: PDM_URL },
    ],
  };
}

/**
 * 一条只读常量：它的值就写在表达式里。
 *
 * 这是十份初始态里「常驻数值表一打开就是满的」的实现手法——法条月数表、
 * 分级切点、语速档、栅格常量都走这条。它们是插件自带的规范性事实，
 * 不是「预置的示例数据」：用户不会想删掉《劳动合同法》第 47 条的月数规则。
 */
export function constantNode(
  id: string,
  label: string,
  value: string,
  unit?: string,
  precision = 2,
) {
  return {
    id,
    label,
    expression: value,
    ...(unit ? { unit } : {}),
    precision,
    guard: GUARD,
  };
}

export type DocState = PluginInteractiveDocInitialState;

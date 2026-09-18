// 生成合成内容标识（算法备案显式标识 + 文件制作要素）。
//
// 开关与后端同一语义：境内开，海外不变。env 强开/强关优先于家族。
// com 家族且未设 env 时，调用方必须保证 DOM / 导出字节与本文件落地前逐字相同。

import { currentDomainFamily } from "./domain-family";

/** 画面/界面上的显式标识文字。 */
export const AIGC_LABEL_TEXT = "AI生成，内容仅供参考";

/** 复制/导出文本时写在起始处的提示语。 */
export const AIGC_TEXT_NOTICE = "本内容由人工智能生成，仅供参考";

/** 服务提供者名称或编码（统一社会信用代码写在名称后）。 */
export const AIGC_SERVICE_PROVIDER =
  "深圳市极目野光科技有限公司（统一社会信用代码 91440300MAKE54BD0T）";

function aigcLabelEnvOverride(): boolean | undefined {
  const raw = (process.env.NEXT_PUBLIC_OCEANLEO_AIGC_LABEL || "")
    .trim()
    .toLowerCase();
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return undefined;
}

/** 当前是否应写入显式标识与制作要素。env 强开/强关 > 家族 cn。 */
export function aigcLabelActive(): boolean {
  const override = aigcLabelEnvOverride();
  if (override !== undefined) return override;
  return currentDomainFamily() === "cn";
}

/**
 * 开关开时前置提示语与空行；已经以提示语开头则不重复。
 * 开关关时原样返回（引用相等以外的逐字相同）。
 */
export function withAigcTextNotice(text: string): string {
  if (!aigcLabelActive()) return text;
  if (text.startsWith(AIGC_TEXT_NOTICE)) return text;
  return `${AIGC_TEXT_NOTICE}\n\n${text}`;
}

export function aigcMetadata(contentId: string): {
  AIGC: "true";
  ServiceProvider: string;
  ContentID: string;
  ProducedAt: string;
} {
  return {
    AIGC: "true",
    ServiceProvider: AIGC_SERVICE_PROVIDER,
    ContentID: contentId,
    ProducedAt: new Date().toISOString(),
  };
}

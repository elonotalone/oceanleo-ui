/**
 * AIPPT：让模型直接产页（W07 判据 4）。
 *
 * 任务书原文：「用 `doc/AI_PPT_SCHEMA.md` 让模型直接产页；正交：内容（schema）×
 * 模板（版式）× 主题分离，`deck-packs` 映射为 PPTist 模板/主题」。
 *
 * ## 三轴在这里怎么分开的
 *
 * | 轴 | 谁产出 | 落在哪 |
 * |---|---|---|
 * | **内容** | 模型（按 `AIPPT_CONTENT_SCHEMA` 产 JSON） | `AipptOutline.slides[]` —— 纯文字，**不含任何坐标与颜色** |
 * | **版式** | `AIPPT_LAYOUTS` 把每种页类型摆成具体几何 | 逻辑像素坐标 |
 * | **主题** | `deck-packs` 的 `DeckPack` | `PptistTheme` |
 *
 * 模型只写内容那一轴。**它产不出坐标，也不该产** —— 让 LLM 猜 `left: 137.5`
 * 是三轮实践已经否定过的路子（合同「AI 凭空排版做模板已被三轮实践否定」）。
 * 版式由程序摆，主题由 pack 给，于是「换主题不动内容、换版式不动主题」天然成立。
 *
 * 与 `deck-pptist-carrier.ts` 的分工：那份把**存量 deck IR** 转过去（判据 3），
 * 这份让模型**新建**（判据 4）。两份都产同一个 `PptistDocument`。
 */

import {
  applyDeckPackTheme,
  PPTIST_CARRIER_FORMAT,
  PPTIST_VIEWPORT_WIDTH,
  pptistViewportRatio,
  type PptistDocument,
  type PptistElement,
  type PptistSlide,
} from "./deck-pptist-carrier";
import { packById } from "./deck-packs";

/** 模型要产的页类型。闭集——开放集会让版式表接不住。 */
export type AipptSlideKind = "cover" | "contents" | "transition" | "content" | "end";

/** 一页的内容。**没有一个几何或颜色字段**，这是正交的前提。 */
export interface AipptSlideContent {
  kind: AipptSlideKind;
  title: string;
  /** 正文要点；`cover` / `transition` 通常为空。 */
  bullets?: string[];
  /** 副标题（`cover`）或小标题（`content`）。 */
  subtitle?: string;
  /** 演讲备注。 */
  notes?: string;
}

export interface AipptOutline {
  title: string;
  slides: AipptSlideContent[];
}

/**
 * 交给模型的 schema 说明（JSON Schema 形状，字面量）。
 *
 * 写成字面量常量而不是运行时拼装：这份文本会原样进提示词，
 * 拼装出来的东西没法在测试里逐字钉住，而提示词漂了模型输出就漂。
 */
export const AIPPT_CONTENT_SCHEMA = {
  type: "object",
  required: ["title", "slides"],
  properties: {
    title: { type: "string", description: "演示文稿标题" },
    slides: {
      type: "array",
      minItems: 1,
      maxItems: 40,
      items: {
        type: "object",
        required: ["kind", "title"],
        properties: {
          kind: {
            type: "string",
            enum: ["cover", "contents", "transition", "content", "end"],
            description: "页面类型；封面/目录/过渡/正文/结束",
          },
          title: { type: "string", maxLength: 60 },
          subtitle: { type: "string", maxLength: 120 },
          bullets: {
            type: "array",
            maxItems: 6,
            items: { type: "string", maxLength: 80 },
            description: "正文要点，每条一行；封面与过渡页留空",
          },
          notes: { type: "string", maxLength: 500, description: "演讲备注" },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;

/** 提示词里对模型的硬约束。与上面的 schema 是同一件事的两种说法。 */
export const AIPPT_PROMPT_RULES = [
  "只输出内容，不要输出任何坐标、字号、颜色——版式与主题由程序决定。",
  "每页要点不超过 6 条，每条不超过 80 字。",
  "第一页必须是 cover，最后一页必须是 end。",
  "超过 8 页时在每个主题段落前插入一页 transition。",
] as const;

const PAGE_HEIGHT_16_9 = PPTIST_VIEWPORT_WIDTH * pptistViewportRatio("16:9");

interface LayoutBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface AipptLayout {
  title: LayoutBox;
  subtitle?: LayoutBox;
  body?: LayoutBox;
  titleFontSize: number;
  bodyFontSize: number;
}

/**
 * 版式表：每种页类型摆成什么样。**这一轴归程序，不归模型。**
 * 坐标是 `AI_PPT_SCHEMA.md` 的逻辑像素（画布 1000 × 562.5）。
 */
export const AIPPT_LAYOUTS: Record<AipptSlideKind, AipptLayout> = {
  cover: {
    title: { left: 100, top: 200, width: 800, height: 90 },
    subtitle: { left: 100, top: 300, width: 800, height: 50 },
    titleFontSize: 44,
    bodyFontSize: 20,
  },
  contents: {
    title: { left: 80, top: 60, width: 840, height: 60 },
    body: { left: 80, top: 150, width: 840, height: 350 },
    titleFontSize: 32,
    bodyFontSize: 20,
  },
  transition: {
    title: { left: 100, top: 240, width: 800, height: 80 },
    titleFontSize: 36,
    bodyFontSize: 20,
  },
  content: {
    title: { left: 80, top: 60, width: 840, height: 60 },
    subtitle: { left: 80, top: 120, width: 840, height: 36 },
    body: { left: 80, top: 170, width: 840, height: 330 },
    titleFontSize: 30,
    bodyFontSize: 18,
  },
  end: {
    title: { left: 100, top: 250, width: 800, height: 80 },
    titleFontSize: 36,
    bodyFontSize: 20,
  },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function textElement(id: string, box: LayoutBox, html: string): PptistElement {
  return {
    id,
    type: "text",
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    rotate: 0,
    content: html,
    defaultFontName: "",
    // 元素级颜色刻意留 PPTist 出厂值而不是从 pack 里取：主题轴只改 `theme`，
    // 元素上一旦写死颜色就会把主题顶掉，「换皮不动结构」当场失效。
    defaultColor: "#333333",
    lineHeight: 1.4,
  };
}

function paragraph(text: string, fontSize: number, align = "left"): string {
  return `<p style="text-align:${align}"><span style="font-size:${fontSize}px">${escapeHtml(
    text,
  )}</span></p>`;
}

function buildSlide(content: AipptSlideContent, index: number): PptistSlide {
  const layout = AIPPT_LAYOUTS[content.kind];
  const elements: PptistElement[] = [];
  const idBase = `aippt-${String(index + 1).padStart(2, "0")}`;
  const centered = content.kind === "cover" || content.kind === "transition" || content.kind === "end";

  elements.push(
    textElement(
      `${idBase}-title`,
      layout.title,
      paragraph(content.title, layout.titleFontSize, centered ? "center" : "left"),
    ),
  );

  if (content.subtitle && layout.subtitle) {
    elements.push(
      textElement(
        `${idBase}-subtitle`,
        layout.subtitle,
        paragraph(content.subtitle, layout.bodyFontSize, centered ? "center" : "left"),
      ),
    );
  }

  const bullets = content.bullets || [];
  if (bullets.length && layout.body) {
    elements.push(
      textElement(
        `${idBase}-body`,
        layout.body,
        bullets.map((line) => paragraph(`• ${line}`, layout.bodyFontSize)).join(""),
      ),
    );
  }

  return {
    id: idBase,
    elements,
    remark: content.notes || undefined,
    type: content.kind,
  };
}

/** 模型产出的大纲是不是合法内容轴。**不合法要说清哪里不合法**（R7）。 */
export function validateAipptOutline(value: unknown): {
  ok: boolean;
  reason?: string;
} {
  if (!value || typeof value !== "object") {
    return { ok: false, reason: "大纲不是一个对象。" };
  }
  const outline = value as Partial<AipptOutline>;
  if (typeof outline.title !== "string" || !outline.title) {
    return { ok: false, reason: "缺少 title。" };
  }
  if (!Array.isArray(outline.slides) || !outline.slides.length) {
    return { ok: false, reason: "slides 必须是非空数组。" };
  }
  const kinds = new Set<AipptSlideKind>(["cover", "contents", "transition", "content", "end"]);
  for (const [index, slide] of outline.slides.entries()) {
    if (!slide || typeof slide !== "object") {
      return { ok: false, reason: `第 ${index + 1} 页不是对象。` };
    }
    if (!kinds.has(slide.kind)) {
      return { ok: false, reason: `第 ${index + 1} 页的 kind「${String(slide.kind)}」不在闭集内。` };
    }
    if (typeof slide.title !== "string" || !slide.title) {
      return { ok: false, reason: `第 ${index + 1} 页缺少 title。` };
    }
    if (slide.bullets && !Array.isArray(slide.bullets)) {
      return { ok: false, reason: `第 ${index + 1} 页的 bullets 不是数组。` };
    }
  }
  return { ok: true };
}

/**
 * 内容轴 + 版式轴 (+ 可选主题轴) → PPTist 文档。
 *
 * 不传 `packId` 就只有内容与版式，主题是 PPTist 出厂值 ⇒
 * **同一份大纲配不同 pack 得到的 `slides` 逐字节相同**，这就是正交的可演示形态
 * （`tests/deck-pptist-carrier.test.mjs` 的正交用例判的就是这一条）。
 */
export function aipptOutlineToPptist(
  outline: AipptOutline,
  options: { packId?: string | null } = {},
): PptistDocument {
  const base: PptistDocument = {
    format: PPTIST_CARRIER_FORMAT,
    title: outline.title,
    viewportSize: PPTIST_VIEWPORT_WIDTH,
    viewportRatio: pptistViewportRatio("16:9"),
    theme: {
      backgroundColor: "#ffffff",
      themeColors: ["#5b9bd5", "#ed7d31", "#a5a5a5", "#ffc000", "#4472c4", "#70ad47"],
      fontColor: "#333333",
      fontName: "",
      outline: { style: "solid", width: 2, color: "#525252" },
      shadow: { h: 3, v: 3, blur: 2, color: "#808080" },
    },
    slides: outline.slides.map(buildSlide),
    warnings: [],
  };

  const pack = options.packId ? packById(options.packId) : undefined;
  return pack ? applyDeckPackTheme(base, pack) : base;
}

export { PAGE_HEIGHT_16_9 };

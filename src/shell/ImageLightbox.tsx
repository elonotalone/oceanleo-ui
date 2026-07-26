"use client";

// ============================================================================
// @oceanleo/ui — 首页 app 卡片的「大卡片」= 多模板详情浮层（合同 §0.3，2026-07-26）
// ----------------------------------------------------------------------------
// 版式（参考 Base44 模板详情弹层）：
//   左上：主预览大图 = **当前选中模板**的真实素材（无模板时回退 app 封面 / emoji tint）
//   左下：缩略图条，切换同一 app 下的多份模板；**只有 1 份（或 0 份）时整条不渲染**
//   右侧：素材标题、说明（无模板时退回代表 prompt 全文）、标签
//   右侧按钮（三个，合同 §0.3 定死）：「编辑模板」「生成类似」「下载」
//     - 编辑模板 = 把**当前选中的那份素材**载入编辑器（W4 workspaceTemplateEditHref）
//     - 生成类似 = 进操作台并预填代表 prompt + preset.set（既有 ?fill=preset，app 级）
//     - 下载     = 下载**当前选中模板**的真实文件（W4 templateDownloadHref）
//   「高级编辑」这个名字本轮取消，统一叫「编辑模板」（推翻 2026-07-25 合同 §0 第 8 条）。
//
// 切换模板时，右侧标题/说明/标签与三个按钮的目标**全部跟随当前选中项**——这是本组件
// 最容易回归的地方，由 `tests/template-showcase.test.mjs` 钉死。
//
// 「无模板 app」的形态（合同 Done when 5；W8* 全量铺开之前 30 个站都处在这一档）：
// 「编辑模板」「下载」都以**存在选中模板**为前提，「生成类似」以**代表 prompt 非空**
// 为前提，于是无模板的 app 按这三档降级，主预览退回 app 封面、右侧标题退回 app 名、
// 说明退回代表 prompt 全文：
//   A. 有代表 prompt + 调用方给了 `editHref` 兜底 → 「编辑模板」(app 级空编辑器) + 「生成类似」
//   B. 有代表 prompt、无 `editHref`               → 只有「生成类似」
//   C. 都没有（music 站那 22 个）                  → 零按钮，降级成纯预览浮层（关闭途径仍在）
// `editHref` 刻意做成调用方显式传入、而不是这里自动 `workspaceAppAdvancedHref(appId)`：
// 那样每个 app 都会长出一颗名为「编辑模板」却打开空编辑器的按钮，正是 §0.3 要消灭的。
//
// 为什么不复用 `../ui` 的 <Modal>：Modal 走 createPortal(document.body)，首帧
// （SSR / 未 mount）什么都不渲染，而本组件要能在服务端与 node --test 里被静态渲染断言。
// 因此这里自带遮罩 + Esc 关闭 + 打开即聚焦，行为与 Modal 对齐。**改版时不得换成 Modal。**
//
// 文件名仍是 `ImageLightbox.tsx`（W2 的独占边界）：`src/shell/index.ts` 与
// `HomeAppCards.tsx` 都从 `./ImageLightbox` 导入，那两个文件归 W1，改文件名会让整包
// typecheck 在 W1 落地前红掉。组件名已按合同 §3 更名为 `TemplateShowcase`，旧名
// `ImageLightbox` 保留为一层薄兼容壳，等 W1 切完调用点即可删。
// ============================================================================

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { assetPreviewUrl, assetThumbUrl } from "../lib/asset-thumb";
import { useUI } from "../i18n/ui/useUI";
import type { TemplateMaterial } from "./app-catalog";
import {
  templateDownloadHref as defaultDownloadHref,
  workspaceTemplateEditHref as defaultEditHref,
} from "./site-catalog-controller";

/** @deprecated 本轮已收敛到 W3 的 `TemplateMaterial`（合同 §3），改用那个。 */
export type ShowcaseTemplate = TemplateMaterial;

export interface TemplateShowcaseProps {
  /** 所属 app id，「编辑模板」深链要用。 */
  appId?: string;
  /** 标题（app 名）。同时作为 dialog 的无障碍名。 */
  title: string;
  /**
   * 该 app 下挂的模板素材（本轮每 app 1–2 份）。调用方请传 W3 的
   * `appTemplates(app)`——它已剔除缺 id/title/previewUrl/artifactId 的脏条目。
   */
  templates?: TemplateMaterial[];
  /** 打开时默认选中的模板；不给则选第一份。 */
  initialTemplateId?: string;
  /**
   * 无模板时的回退大图：素材 key（`"<category>/<slug>"`）或完整 http(s) URL。
   * 有模板时以选中模板的 `previewUrl` 为准。 */
  imageKey?: string;
  /** 连回退大图都没有时的图示（emoji / 单字），保证不留白。 */
  fallbackIcon?: ReactNode;
  accent?: string;
  /** 代表 prompt 全文；为空 → 不渲染「生成类似」（不得跳空预填）。 */
  prompt?: string | null;
  /** 「生成类似」目标（app 级，W4 的 `workspaceAppFillHref(appId)`）。 */
  fillHref?: string;
  /**
   * @deprecated 不传即可：默认直接调 W4 的 `workspaceTemplateEditHref(appId, templateId)`。
   * 只为 W1 尚未拆掉的显式接线留着，删掉行为不变。
   */
  templateEditHref?: (appId: string, templateId: string) => string;
  /**
   * @deprecated 不传即可：默认直接把**整份**选中素材交给 W4 的 `templateDownloadHref`，
   * 由它在自带 https 直链与 W7 端点之间裁决。只为 W1 尚未拆掉的显式接线留着。
   */
  templateDownloadHref?: (templateId: string) => string;
  /**
   * **没有任何模板时**「编辑模板」的兜底目标（旧「高级编辑」那个 app 级空编辑器）。
   * 只在 `templates` 为空时生效；有模板时永远走 `workspaceTemplateEditHref(选中项)`。
   * 不给 → 无模板的 app 干脆不显示「编辑模板」（见文件头「无模板 app」一节）。 */
  editHref?: string;
  onClose: () => void;
}

/** 选中模板的解析：id 命中优先，否则回落第一份（templates 变化时不会选到空）。 */
function resolveSelected(
  templates: TemplateMaterial[],
  selectedId: string | null,
): TemplateMaterial | null {
  if (templates.length === 0) return null;
  const hit = selectedId ? templates.find((t) => t.id === selectedId) : undefined;
  return hit ?? templates[0];
}

export function TemplateShowcase({
  appId = "",
  title,
  templates,
  initialTemplateId,
  imageKey,
  fallbackIcon,
  accent = "#4f46e5",
  prompt,
  fillHref,
  templateEditHref,
  templateDownloadHref,
  editHref,
  onClose,
}: TemplateShowcaseProps) {
  const tt = useUI();
  const closeRef = useRef<HTMLButtonElement>(null);

  const list = useMemo(
    () => (templates ?? []).filter((t) => t && typeof t.id === "string" && t.id !== ""),
    [templates],
  );
  const [selectedId, setSelectedId] = useState<string | null>(initialTemplateId ?? null);
  const selected = resolveSelected(list, selectedId);
  const promptText = (prompt || "").trim();

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ——— 右侧信息与三个按钮的目标，全部由 `selected` 派生：切换模板即同步跟随 ———
  const paneTitle = selected?.title?.trim() || title;
  const paneSummary = (selected?.summary || "").trim() || promptText;
  // 说明段来自模板时是普通描述；回退到代表 prompt 时要挂「代表 prompt」小标题并保留换行。
  const summaryIsPrompt = !(selected?.summary || "").trim() && promptText !== "";
  const paneTags = (selected?.tags ?? []).filter((t) => (t || "").trim() !== "");

  const bigImage = selected?.previewUrl
    ? assetPreviewUrl(selected.previewUrl)
    : imageKey
      ? assetPreviewUrl(imageKey)
      : "";

  // 「编辑模板」与「下载」的目标由 W4 的两个 helper 现算，入参是**当前选中项**。
  // 下载优先用素材自带的 https 直链，否则走 W7 的端点——这条优先级住在 helper 里，
  // 本组件不复制一份，否则两处会各自漂移。
  const editTarget = selected
    ? appId
      ? (templateEditHref ?? defaultEditHref)(appId, selected.id)
      : ""
    : editHref || "";
  const downloadTarget = selected
    ? templateDownloadHref
      ? templateDownloadHref(selected.id)
      : defaultDownloadHref(selected)
    : "";
  const similarTarget = promptText && fillHref ? fillHref : "";

  const actionClass =
    "rounded-lg px-3.5 py-2 text-center text-[12.5px] font-medium transition hover:opacity-90";
  const ghostAction = `${actionClass} border border-stone-200 text-stone-700 hover:bg-stone-50`;

  return (
    <div
      data-image-lightbox
      data-template-showcase
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // 左右分栏容不下 max-w-2xl（672px），放宽到 max-w-5xl（1024px）。
        className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-3">
          <h3 className="truncate text-[15px] font-semibold text-stone-900">{title}</h3>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={tt("关闭")}
            className="rounded-md px-2 py-1 text-[18px] leading-none text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
          >
            ×
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-5 py-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          {/* ——— 左列：主预览 + 多模板缩略图条 ——— */}
          <div className="min-w-0">
            <div
              data-template-showcase-preview
              className="relative w-full overflow-hidden rounded-xl bg-stone-100"
              style={{ aspectRatio: "16 / 10" }}
            >
              {bigImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={bigImage}
                  alt={paneTitle}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span
                  className="grid h-full w-full place-items-center text-[48px]"
                  style={{ background: `${accent}14`, color: accent }}
                >
                  {fallbackIcon ?? "✨"}
                </span>
              )}
            </div>

            {/* 只有 1 份模板时不显示切换条（合同 §0.3）。 */}
            {list.length > 1 ? (
              <div
                data-template-showcase-thumbs
                role="group"
                aria-label={tt("切换模板")}
                className="mt-3 flex flex-wrap gap-2"
              >
                {list.map((item) => {
                  const active = item.id === selected?.id;
                  const thumb = item.previewUrl ? assetThumbUrl(item.previewUrl) : "";
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-template-thumb
                      data-template-id={item.id}
                      data-active={active ? "1" : "0"}
                      aria-pressed={active}
                      title={item.title || title}
                      onClick={() => setSelectedId(item.id)}
                      className={`relative h-14 w-20 overflow-hidden rounded-lg border-2 bg-stone-100 transition ${
                        active ? "border-stone-900" : "border-transparent hover:border-stone-300"
                      }`}
                      style={active ? { borderColor: accent } : undefined}
                    >
                      {thumb ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <span
                          className="grid h-full w-full place-items-center text-[18px]"
                          style={{ background: `${accent}14`, color: accent }}
                        >
                          {fallbackIcon ?? "✨"}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* ——— 右列：标题 / 说明 / 标签 / 三个按钮 ——— */}
          <div className="flex min-w-0 flex-col">
            <h4
              data-template-showcase-title
              className="text-[15px] font-semibold leading-snug text-stone-900"
            >
              {paneTitle}
            </h4>

            {paneSummary ? (
              <>
                {summaryIsPrompt ? (
                  <p className="mt-3 text-[12px] font-medium text-stone-400">{tt("代表 prompt")}</p>
                ) : null}
                <pre
                  data-template-showcase-summary
                  className={`${summaryIsPrompt ? "mt-1.5" : "mt-2.5"} max-h-[34vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-stone-200 bg-stone-50/70 px-4 py-3 font-sans text-[13px] leading-relaxed text-stone-700`}
                >
                  {paneSummary}
                </pre>
              </>
            ) : null}

            {paneTags.length > 0 ? (
              <div data-template-showcase-tags className="mt-3 flex flex-wrap gap-1.5">
                {paneTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-stone-100 px-2.5 py-1 text-[11.5px] text-stone-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}

            {/* 三个按钮的可见性：编辑模板/下载依赖「有模板」，生成类似依赖「有代表 prompt」。
                三者都缺 → 大卡片降级成纯预览（标题 + 大图 + 关闭），不留死按钮。 */}
            <div className="mt-5 flex flex-col gap-2 md:mt-auto md:pt-5">
              {editTarget ? (
                <a
                  data-showcase-action="edit"
                  href={editTarget}
                  className={`${actionClass} text-white`}
                  style={{ background: accent }}
                >
                  {tt("编辑模板")}
                </a>
              ) : null}
              {similarTarget ? (
                <a data-showcase-action="similar" href={similarTarget} className={ghostAction}>
                  {tt("生成类似")}
                </a>
              ) : null}
              {downloadTarget ? (
                <a
                  data-showcase-action="download"
                  href={downloadTarget}
                  download
                  rel="noopener"
                  className={ghostAction}
                >
                  {tt("下载")}
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ——————————————————————————————————————————————————————————————————————————
// 兼容壳：`src/shell/index.ts:390` 与 `HomeAppCards.tsx:508` 仍在用旧名与旧 props，
// 那两个文件归 W1。保留这层让整包 typecheck 在 W1 切换调用点之前保持绿。
// W1 切到 `TemplateShowcase` 之后，本段连同 `ImageLightboxProps` 一起删。
// 旧 `advancedHref`（app 级空编辑器）映射到新的无模板兜底 `editHref`，
// 所以旧调用点在模板数据到位前不会丢掉编辑入口。
// ——————————————————————————————————————————————————————————————————————————

/** @deprecated 改用 `TemplateShowcaseProps`。 */
export interface ImageLightboxProps {
  title: string;
  /** 转发给 `TemplateShowcase`，让旧名调用点也能先把模板数据接上。 */
  appId?: string;
  templates?: TemplateMaterial[];
  imageKey?: string;
  fallbackIcon?: ReactNode;
  accent?: string;
  prompt?: string | null;
  /** @deprecated 大卡片不再放「prompt」按钮（合同 §0.3 三按钮定死），首页卡上那颗仍在。 */
  onUsePrompt?: (prompt: string) => void;
  fillHref?: string;
  /** @deprecated 旧「高级编辑」目标；现作为**无模板**时「编辑模板」的兜底。 */
  advancedHref?: string;
  onClose: () => void;
}

/** @deprecated 改用 `TemplateShowcase`。 */
export function ImageLightbox({ advancedHref, onUsePrompt: _onUsePrompt, ...rest }: ImageLightboxProps) {
  return <TemplateShowcase {...rest} editHref={advancedHref} />;
}

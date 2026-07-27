"use client";

// ============================================================================
// @oceanleo/ui — 首页 app 卡片的「大卡片」= 多模板详情浮层（合同 §0.4，2026-07-27）
// ----------------------------------------------------------------------------
// 版式（参考 Base44 模板详情弹层）：
//   左上：主预览大图 = **当前选中模板**的真实素材（无模板时回退 app 封面 / emoji tint）
//   左下：缩略图条，切换同一 app 下的多份模板；**只有 1 份（或 0 份）时整条不渲染**
//   右侧：素材标题、说明（无模板时退回代表 prompt 全文）、标签
//   右侧按钮（**恰好三个，顺序定死**，合同 §0.4）：「预览&编辑」「生成类似」「更多」
//     - 预览&编辑 = 进该 app **库里的只读预览页**（`workspaceTemplatePreviewHref`）
//     - 生成类似 = 进操作台并预填代表 prompt + preset.set（既有 ?fill=preset，app 级）
//     - 更多     = 进**本站探索页**并锚定该 app（`exploreAppHref`）
//
// 为什么「预览&编辑」落在预览页而不是编辑器（操作员 2026-07-27 原话）：用户在探索时点这颗
// 按钮只是想「看看这份素材长什么样」，直接把重型编辑器怼到脸上是误入。所以本轮改成先进
// 库里的只读预览（3D 可拖拽 / website 可交互 / 文档可翻页），**预览页内再点「编辑」才 fork**
// 出独立副本进编辑器（W4）。旧名「编辑模…」这类叫法本轮全站废除，17 语只留「预览&编辑」。
//
// 为什么这里没有「下载」（操作员 2026-07-27 原话第 3 条）：大卡片是**探索**面，下载是
// **取用**动作，混在一起会让探索路径变重。下载入口本轮迁到库详情页与探索页素材卡（W5），
// 那两处才有登录态、配额与失败分档的上下文。连带删掉的还有本文件旧版那整套下载态机
// （登录探测 / pending 防重复点 / 四档错误文案）——**四档错误文案的 17 语词条刻意保留**，
// W5 的素材卡要复用同一套下载体验，删词条会让那边 16 个 locale 齐刷刷露中文。
//
// 切换模板时，右侧标题/说明/标签与三个按钮的目标**全部跟随当前选中项**——这是本组件
// 最容易回归的地方，由 `tests/template-showcase.test.mjs` 钉死。
//
// 「无模板 app」的形态（W10* 把素材补到 3–4 份之前仍会遇到）：三颗按钮各有各的前提，
// 缺谁掉谁，绝不留死按钮：
//   - 预览&编辑：要有**选中模板的 artifactId**（预览页按 artifact 定位）。没有模板时
//     退到调用方显式给的 `editHref` 兜底；连兜底都没有就不渲染。
//   - 生成类似：要有非空代表 prompt。
//   - 更多    ：只要能拼出探索页深链（有 appId 或调用方给了 `exploreHref`）就在。
// 「更多」几乎恒在，这是刻意的：素材还没补齐的 app 上，它是用户唯一的去处，
// 比上一轮那种「零按钮纯预览浮层」强。
//
// 为什么不复用 `../ui` 的 <Modal>：Modal 走 createPortal(document.body)，首帧
// （SSR / 未 mount）什么都不渲染，而本组件要能在服务端与 node --test 里被静态渲染断言。
// 因此这里自带遮罩 + Esc 关闭 + 打开即聚焦，行为与 Modal 对齐。**改版时不得换成 Modal。**
//
// 文件名仍是 `ImageLightbox.tsx`：`src/shell/index.ts` 与 `HomeAppCards.tsx` 都从
// `./ImageLightbox` 导入，那两个文件归 W1，改文件名会让整包 typecheck 在 W1 落地前红掉。
// 组件名已按合同 §3.1 更名为 `TemplateShowcase`，旧名 `ImageLightbox` 保留为一层薄兼容壳，
// 等 W1 切完调用点即可删。
// ============================================================================

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { assetPreviewUrl, assetThumbUrl } from "../lib/asset-thumb";
import { useUI } from "../i18n/ui/useUI";
import type { TemplateMaterial } from "./app-catalog";
import {
  exploreAppHref as defaultExploreHref,
  workspaceTemplatePreviewHref as defaultPreviewHref,
} from "./site-catalog-controller";

/** @deprecated 本轮已收敛到 `TemplateMaterial`（合同 §3.1），改用那个。 */
export type ShowcaseTemplate = TemplateMaterial;

export interface TemplateShowcaseProps {
  /** 所属 app id，「预览&编辑」与「更多」两条深链都要用。 */
  appId?: string;
  /** 标题（app 名）。同时作为 dialog 的无障碍名。 */
  title: string;
  /**
   * 该 app 下挂的模板素材（本轮起常态 3–4 份）。调用方请传
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
  /** 「生成类似」目标（app 级，`workspaceAppFillHref(appId)`）。 */
  fillHref?: string;
  /**
   * 覆盖「预览&编辑」的落点解析。**不传即可**：默认走
   * `workspaceTemplatePreviewHref(appId, artifactId)`（合同 §3.1 锁死的 query 形状，
   * W4 的库预览页认它）。只为 locale 前缀站与尚未拆掉的显式接线留着。
   */
  templatePreviewHref?: (appId: string, artifactId: string) => string;
  /**
   * 覆盖「更多」的落点。**不传即可**：默认走 `exploreAppHref(appId)` →
   * `/explore?app=<appId>`（W5 的探索页认这个 query）。locale 前缀站可传自己那条。
   */
  exploreHref?: string;
  /**
   * **没有任何可预览模板时**「预览&编辑」的兜底目标。只在没有选中模板（或选中模板缺
   * `artifactId`）时生效；有模板时永远走 `workspaceTemplatePreviewHref(选中项)`。
   * 不给 → 无模板的 app 干脆不显示「预览&编辑」（见文件头「无模板 app」一节）。
   *
   * ⚠ 本轮语义已从「进编辑器」改为「进预览页」：调用方传进来的应当是一条**只读落点**。
   */
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
  templatePreviewHref,
  exploreHref,
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

  // 「预览&编辑」按 **artifactId** 定位（库预览页按 artifact 取数，不是 templateId）。
  // 选中项缺 artifactId 时这条深链拼不出只读落点，宁可退回调用方给的兜底，也不产出
  // 一条点进去空转的链接。
  const previewArtifactId = (selected?.artifactId || "").trim();
  const previewTarget =
    appId && previewArtifactId
      ? (templatePreviewHref ?? defaultPreviewHref)(appId, previewArtifactId)
      : editHref || "";
  const similarTarget = promptText && fillHref ? fillHref : "";
  // 「更多」不依赖模板：素材还没补齐的 app 上它恰恰是最该在的那颗。
  const moreTarget = exploreHref || (appId ? defaultExploreHref(appId) : "");

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

            {/* 只有 1 份模板时不显示切换条（合同 §0.4）。 */}
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

            {/* 三个按钮，顺序定死：预览&编辑 → 生成类似 → 更多（合同 §0.4）。
                各自的前提见文件头；缺前提的那颗整颗不渲染，不留死按钮。 */}
            <div className="mt-5 flex flex-col gap-2 md:mt-auto md:pt-5">
              {previewTarget ? (
                <a
                  data-showcase-action="preview"
                  href={previewTarget}
                  className={`${actionClass} text-white`}
                  style={{ background: accent }}
                >
                  {tt("预览&编辑")}
                </a>
              ) : null}
              {similarTarget ? (
                <a data-showcase-action="similar" href={similarTarget} className={ghostAction}>
                  {tt("生成类似")}
                </a>
              ) : null}
              {moreTarget ? (
                <a data-showcase-action="more" href={moreTarget} className={ghostAction}>
                  {tt("更多")}
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
// 兼容壳：`src/shell/index.ts` 与 `HomeAppCards.tsx` 仍在用旧名与旧 props，那两个文件
// 归 W1。保留这层让整包 typecheck 在 W1 切换调用点之前保持绿。W1 切到 `TemplateShowcase`
// 之后，本段连同 `ImageLightboxProps` 一起删。
// 旧 `advancedHref`（app 级空编辑器）映射到无模板兜底 `editHref`——注意本轮该兜底的语义
// 已是「只读预览落点」，调用方应尽快换成库预览页那条。
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
  /** @deprecated 大卡片不再放「prompt」按钮（合同 §0.4 三按钮定死），首页卡上那颗仍在。 */
  onUsePrompt?: (prompt: string) => void;
  fillHref?: string;
  /** @deprecated 旧的 app 级编辑器目标；现作为**无模板**时「预览&编辑」的兜底。 */
  advancedHref?: string;
  onClose: () => void;
}

/** @deprecated 改用 `TemplateShowcase`。 */
export function ImageLightbox({ advancedHref, onUsePrompt: _onUsePrompt, ...rest }: ImageLightboxProps) {
  return <TemplateShowcase {...rest} editHref={advancedHref} />;
}

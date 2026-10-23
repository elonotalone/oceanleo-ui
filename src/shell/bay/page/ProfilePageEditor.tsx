"use client";

// A bounded settings sidebar and the actual public-page renderer share one durable document.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { BayProfilePage, BayShowcaseItem } from "../../../lib/bay/directory";
import {
  BAY_PAGE_BLOCK_LABELS, BAY_PAGE_MAX_BYTES, BAY_PAGE_PALETTES,
  applyPageTemplate, insertBlock, moveBlock, newBlock, pageDocBytes,
  patchBlock, patchTheme, removeBlock, samePageDoc, syncHeroName,
  type BayPageBlock, type BayPageDoc, type BayPageTemplateId,
} from "../../../lib/bay/page-doc";
import { addShowcaseWork, isBayHandle, removeShowcaseItem } from "../../../lib/bay/seller";
import { pickLibraryWork } from "../needs/LibraryWorkPicker";
import { BayVettingSection } from "../seller/BayVettingSection";
import { useBayEnabled, useBaySignedIn } from "../shell/bay-state";
import { ProfilePage, type BayPageIdentity } from "./ProfilePage";
import { ProfilePageSettings, PAGE_EDITOR_BUTTON, PAGE_EDITOR_QUIET } from "./ProfilePageSettings";

export interface ProfilePageEditorProps {
  page: BayProfilePage;
  initial: BayPageDoc;
  initialIdentity: BayPageIdentity;
  saving: boolean;
  error: string;
  onSave: (doc: BayPageDoc, identity: BayPageIdentity) => void;
  onCancel: () => void;
  vettingFocus?: number;
}

function afterLayout(run: () => void): () => void {
  if (typeof requestAnimationFrame === "function") {
    const frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }
  const timer = setTimeout(run, 0);
  return () => clearTimeout(timer);
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  } catch {
    return false;
  }
}

export function ProfilePageEditor({ page, initial, initialIdentity, saving, error, onSave, onCancel, vettingFocus = 0 }: ProfilePageEditorProps) {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const bayOn = useBayEnabled();
  const showVetting = signedIn && bayOn;
  const vettingRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const alignPending = useRef<(() => void) | null>(null);
  const alignAfterLoad = useRef(false);
  const [base] = useState(initial);
  const [baseIdentity] = useState(initialIdentity);
  const [doc, setDoc] = useState(initial);
  const [identity, setIdentity] = useState(initialIdentity);
  const [templateId, setTemplateId] = useState<BayPageTemplateId | null>(null);
  const [selectedBlock, setSelectedBlock] = useState(initial.blocks[0]?.id || "");
  const [preview, setPreview] = useState(false);
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [discarding, setDiscarding] = useState(false);
  const [showcase, setShowcase] = useState<BayShowcaseItem[]>(() => page.showcase || []);
  const [showcaseBusy, setShowcaseBusy] = useState(false);
  const [showcaseError, setShowcaseError] = useState("");
  const handleOk = isBayHandle(identity.handle);
  const dirty = !samePageDoc(doc, base) || JSON.stringify(identity) !== JSON.stringify(baseIdentity);
  const tooBig = useMemo(() => pageDocBytes(doc) > BAY_PAGE_MAX_BYTES, [doc]);
  const canSave = dirty && !saving && !tooBig && handleOk && Boolean(identity.display_name.trim());
  const canvasPage = useMemo(() => ({ ...page, showcase, profile: { ...page.profile, ...identity, avatar_url: identity.avatar_url || null } }), [page, showcase, identity]);
  const onBlock = (id: string, patch: Partial<BayPageBlock>) => setDoc((current) => patchBlock(current, id, patch));
  const onIdentity = (patch: Partial<BayPageIdentity>) => {
    if (patch.display_name !== undefined) {
      const nextName = patch.display_name;
      setDoc((current) => syncHeroName(syncHeroName(current, identity.display_name, nextName), baseIdentity.display_name, nextName));
    }
    setIdentity((current) => ({ ...current, ...patch }));
  };

  useEffect(() => {
    if (!dirty) return;
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [dirty]);

  const scheduleAlign = useCallback(() => {
    if (alignPending.current) return;
    alignPending.current = afterLayout(() => {
      alignPending.current = null;
      const node = vettingRef.current;
      if (!node) return;
      node.scrollIntoView?.({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
      node.focus?.({ preventScroll: true });
    });
  }, []);
  useEffect(() => {
    if (!vettingFocus || !showVetting) return;
    setPreview(false);
    alignAfterLoad.current = true;
    scheduleAlign();
    return () => { alignPending.current?.(); alignPending.current = null; };
  }, [vettingFocus, showVetting, scheduleAlign]);
  const onVettingLoaded = useCallback(() => {
    if (!alignAfterLoad.current) return;
    alignAfterLoad.current = false;
    scheduleAlign();
  }, [scheduleAlign]);

  function focusBlock(id: string) {
    setSelectedBlock(id);
    setPreview(false);
    afterLayout(() => {
      const node = canvasRef.current?.querySelector<HTMLElement>(`[data-bay-page-block-edit="${id}"]`);
      node?.scrollIntoView?.({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
    });
  }

  async function importWork() {
    if (showcaseBusy || saving) return;
    setShowcaseBusy(true);
    setShowcaseError("");
    try {
      const work = await pickLibraryWork({ title: tt("从我的库挑一件作品") });
      if (!work) return;
      const next = await addShowcaseWork(work);
      setShowcase(next.items || []);
    } catch (err) {
      setShowcaseError(err instanceof Error && err.message ? err.message : tt("没保存成功，请稍后再试。"));
    } finally {
      setShowcaseBusy(false);
    }
  }
  async function dropWork(id: string) {
    if (showcaseBusy || saving) return;
    setShowcaseBusy(true);
    setShowcaseError("");
    try {
      await removeShowcaseItem(id);
      setShowcase((items) => items.filter((item) => item.id !== id));
    } catch (err) {
      setShowcaseError(err instanceof Error && err.message ? err.message : tt("没保存成功，请稍后再试。"));
    } finally {
      setShowcaseBusy(false);
    }
  }

  const renderBlockChrome = (block: BayPageBlock, _index: number, children: ReactNode) => (
    <div data-bay-page-block-edit={block.id} data-bay-page-block-selected={selectedBlock === block.id ? "true" : undefined}
      onFocusCapture={() => setSelectedBlock(block.id)} onClick={() => setSelectedBlock(block.id)}
      className="relative rounded-xl outline-dashed outline-1 outline-offset-8 outline-transparent hover:outline-neutral-300 focus-within:outline-neutral-300">
      <span className="mb-3 inline-flex rounded-full border border-neutral-200 bg-white px-2 py-1 text-[10px] font-medium text-neutral-500">{tt(BAY_PAGE_BLOCK_LABELS[block.type].name)}</span>
      {children}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden pb-3 pt-3" data-bay-page-editor
      onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); if (canSave) onSave(doc, identity); } }}>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3" data-bay-page-editor-header>
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold tracking-tight text-neutral-900">{tt("设计你的个人主页")}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-neutral-500" role="status" aria-live="polite">
            <span className="inline-flex items-center gap-1.5"><span aria-hidden className={`h-1.5 w-1.5 rounded-full ${identity.published ? "bg-emerald-500" : "bg-neutral-300"}`} />{identity.published ? tt("已公开") : tt("未公开")}</span>
            <span aria-hidden>·</span>{saving ? tt("保存中…") : dirty ? tt("有未保存的修改") : tt("已保存")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => dirty ? setDiscarding(true) : onCancel()} disabled={saving} data-bay-page-action="cancel" className={PAGE_EDITOR_QUIET}>{tt("取消")}</button>
          <button type="button" onClick={() => onSave(doc, identity)} disabled={!canSave} data-bay-page-action="save"
            className={`${PAGE_EDITOR_BUTTON} bg-neutral-900 px-5 text-white hover:bg-neutral-800 disabled:opacity-40`}>{saving ? tt("保存中…") : tt("保存主页")}</button>
        </div>
      </header>
      {discarding ? (
        <div role="alert" data-bay-page-discard className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-neutral-800">
          <span>{tt("放弃未保存的修改？")}</span><div className="flex gap-2">
            <button type="button" data-bay-page-action="continue" className={PAGE_EDITOR_QUIET} onClick={() => setDiscarding(false)}>{tt("继续编辑")}</button>
            <button type="button" data-bay-page-action="discard" className={`${PAGE_EDITOR_BUTTON} bg-white text-rose-700`} onClick={onCancel}>{tt("放弃修改")}</button>
          </div>
        </div>
      ) : null}
      {error || showcaseError ? <p role="alert" className="shrink-0 rounded-lg bg-rose-50 px-4 py-2 text-[12px] text-rose-700">{tt(error || showcaseError)}</p> : null}
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row" data-bay-page-workspace>
        <ProfilePageSettings doc={doc} identity={identity} saving={saving} tooBig={tooBig} selectedBlock={selectedBlock} templateId={templateId}
          onIdentity={onIdentity} onTheme={(patch) => setDoc((current) => patchTheme(current, patch))}
          onTemplate={(id) => { setDoc((current) => applyPageTemplate(current, id, tt)); setTemplateId(id); }}
          onFocusBlock={focusBlock} onMoveBlock={(id, direction) => setDoc((current) => moveBlock(current, id, direction))}
          onRemoveBlock={(id) => setDoc((current) => removeBlock(current, id))}
          onAddBlock={(type) => { const block = newBlock(type, tt); setDoc((current) => insertBlock(current, block)); focusBlock(block.id); }} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100" data-bay-page-preview-shell>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-neutral-200 bg-white px-3 py-2">
            <div className="flex items-center gap-1" role="group" aria-label={tt("预览")}>
              <button type="button" data-bay-page-preview="edit" aria-pressed={!preview} onClick={() => setPreview(false)} className={`${PAGE_EDITOR_BUTTON} py-1.5 text-[12px] ${!preview ? "bg-neutral-100 text-neutral-900" : "text-neutral-500"}`}>{tt("编辑内容")}</button>
              <button type="button" data-bay-page-preview="preview" aria-pressed={preview} onClick={() => setPreview(true)} className={`${PAGE_EDITOR_BUTTON} py-1.5 text-[12px] ${preview ? "bg-neutral-100 text-neutral-900" : "text-neutral-500"}`}>{tt("预览主页")}</button>
            </div>
            <div className="flex items-center gap-1" role="group" aria-label={tt("预览")}>
              {(["desktop", "mobile"] as const).map((value) => <button key={value} type="button" data-bay-page-viewport={value} aria-pressed={viewport === value} onClick={() => setViewport(value)} className={`${PAGE_EDITOR_BUTTON} py-1.5 text-[12px] ${viewport === value ? "bg-neutral-100 text-neutral-900" : "text-neutral-500"}`}>{value === "desktop" ? tt("电脑版") : tt("手机版")}</button>)}
            </div>
          </div>
          <div ref={canvasRef} className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4" data-bay-page-canvas>
            {!preview ? <p className="mb-3 text-[11px] leading-4 text-neutral-500">{tt("点击画布中的文字即可编辑；在左侧调整版块顺序。")}</p> : null}
            <div className="mx-auto w-full overflow-hidden rounded-xl border border-neutral-200 shadow-sm" style={{ maxWidth: viewport === "mobile" ? 390 : 1120 }} data-bay-page-canvas-card data-bay-page-preview-mode={viewport}>
              <fieldset disabled={saving} className="min-w-0" style={{ background: BAY_PAGE_PALETTES[doc.theme.tone].bg }}>
                <ProfilePage page={canvasPage} doc={doc} editing={!preview} editingIdentity={false} compact={viewport === "mobile"} identity={identity} onBlock={onBlock} renderBlockChrome={!preview ? renderBlockChrome : undefined} onShowcaseImport={() => void importWork()} onShowcaseRemove={(id) => void dropWork(id)} showcaseBusy={showcaseBusy || saving} />
              </fieldset>
            </div>
            {showVetting ? <div ref={vettingRef} tabIndex={-1} data-bay-mine-vetting className={`mt-4 scroll-mt-4 outline-none ${preview ? "hidden" : ""}`}><p className="mb-2 px-1 text-[11px] text-neutral-500">{tt("作品集和资质核验单独保存。")}</p><BayVettingSection onLoaded={onVettingLoaded} /></div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

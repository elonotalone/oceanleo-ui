"use client";

// 编辑主页：顶上一张主题栏卡（底色、主色、字体、封面、是否公开），下面是主页本身那张卡——点文字直接改，
// 页头改名字 / 地址 / 头像 / 技能，每个版块右上角有上移 / 下移 / 删除。只改版面，不产生任何代码。
// 主页卡之后是「资质核验」白卡：只有本人看得到，不属于公开主页，所以不套主页的主题色。
// 从「去核验」进来时（vettingFocus 变大）自动滚到这张卡。页面底色上只有这几张卡，不铺整页白板。

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import type { BayProfilePage, BayShowcaseItem } from "../../../lib/bay/directory";
import {
  BAY_PAGE_ACCENTS,
  BAY_PAGE_BLOCK_LABELS,
  BAY_PAGE_BLOCK_TYPES,
  BAY_PAGE_FONTS,
  BAY_PAGE_FONT_LABELS,
  BAY_PAGE_FONT_STACKS,
  BAY_PAGE_MAX_BLOCKS,
  BAY_PAGE_MAX_BYTES,
  BAY_PAGE_PALETTES,
  BAY_PAGE_TONES,
  BAY_PAGE_TONE_LABELS,
  insertBlock,
  moveBlock,
  newBlock,
  pageDocBytes,
  patchBlock,
  patchTheme,
  removeBlock,
  type BayPageBlock,
  type BayPageBlockType,
  type BayPageDoc,
} from "../../../lib/bay/page-doc";
import { addShowcaseWork, isBayHandle, removeShowcaseItem } from "../../../lib/bay/seller";
import { BayCoverDrop } from "../form/BayCoverDrop";
import { pickLibraryWork } from "../needs/LibraryWorkPicker";
import { BayVettingSection } from "../seller/BayVettingSection";
import { useBayEnabled, useBaySignedIn } from "../shell/bay-state";
import { ProfilePage, type BayPageIdentity } from "./ProfilePage";

const MOTION = "transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]";
const BAR_BUTTON = `rounded-lg px-3 py-1.5 text-[13px] font-medium ${MOTION}`;
const CHROME_BUTTON = `rounded-full bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white ${MOTION} hover:bg-stone-800 disabled:opacity-30`;

function sameIdentity(left: BayPageIdentity, right: BayPageIdentity): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export interface ProfilePageEditorProps {
  page: BayProfilePage;
  initial: BayPageDoc;
  initialIdentity: BayPageIdentity;
  saving: boolean;
  error: string;
  onSave: (doc: BayPageDoc, identity: BayPageIdentity) => void;
  onCancel: () => void;
  /** 从「去核验」进来：每变大一次就滚到资质核验卡一次。0 = 不滚。 */
  vettingFocus?: number;
}

/** 等版面排好再做事（核验卡刚挂上、主页内容还在铺）。 */
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

function Swatch({ selected, onClick, label, children }: { selected: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`rounded-full p-1 ${MOTION} ${selected ? "ring-2 ring-neutral-900 ring-offset-2" : "ring-1 ring-black/10 hover:ring-black/30"}`}
    >
      {children}
    </button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{title}</span>
      <div role="radiogroup" aria-label={title} className="flex flex-wrap items-center gap-2">
        {children}
      </div>
    </div>
  );
}

function AddBlockMenu({ onPick, disabled }: { onPick: (type: BayPageBlockType) => void; disabled: boolean }) {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  if (disabled) {
    return <p className="py-6 text-center text-[13px] text-neutral-500">{tt("一张主页最多 {n} 个版块。", { n: BAY_PAGE_MAX_BLOCKS })}</p>;
  }
  return (
    <div className="mx-auto w-full max-w-5xl px-5 pb-10 sm:px-8" data-bay-page-add>
      {open ? (
        <div className="text-stone-900">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[14px] font-semibold">{tt("添加版块")}</p>
            <button type="button" onClick={() => setOpen(false)} className={`${BAR_BUTTON} text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900`}>
              {tt("收起")}
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {BAY_PAGE_BLOCK_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                data-bay-page-add-type={type}
                onClick={() => {
                  onPick(type);
                  setOpen(false);
                }}
                className={`px-0 py-3 text-left ${MOTION} hover:opacity-80`}
              >
                <span className="block text-[14px] font-semibold">{tt(BAY_PAGE_BLOCK_LABELS[type].name)}</span>
                <span className="mt-0.5 block text-[12px] text-neutral-500">{tt(BAY_PAGE_BLOCK_LABELS[type].hint)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-bay-page-add-open
          className={`flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-stone-300 px-4 py-4 text-[13px] font-medium text-stone-600 ${MOTION} hover:border-stone-900 hover:text-stone-900`}
        >
          <span aria-hidden className="text-[18px] leading-none">
            +
          </span>
          {tt("添加版块")}
        </button>
      )}
    </div>
  );
}

export function ProfilePageEditor({ page, initial, initialIdentity, saving, error, onSave, onCancel, vettingFocus = 0 }: ProfilePageEditorProps) {
  const tt = useUI();
  // 资质核验只给登录后、LeoBay 开着的本人（境内没有 LeoBay，这一块不出现）。
  const signedIn = useBaySignedIn();
  const bayOn = useBayEnabled();
  const showVetting = signedIn && bayOn;
  const vettingRef = useRef<HTMLDivElement>(null);
  // 进入编辑那一刻的版面：之后父组件再怎么重画，「有没有改动」都跟它比。
  const [base] = useState<BayPageDoc>(initial);
  const [baseIdentity] = useState<BayPageIdentity>(initialIdentity);
  const [doc, setDoc] = useState<BayPageDoc>(initial);
  const [identity, setIdentity] = useState<BayPageIdentity>(initialIdentity);
  const [showcase, setShowcase] = useState<BayShowcaseItem[]>(() => page.showcase || []);
  const [showcaseBusy, setShowcaseBusy] = useState(false);
  const [showcaseError, setShowcaseError] = useState("");
  const theme = doc.theme;
  const handleOk = isBayHandle(identity.handle);
  const dirty = doc !== base || !sameIdentity(identity, baseIdentity);
  const tooBig = useMemo(() => pageDocBytes(doc) > BAY_PAGE_MAX_BYTES, [doc]);
  const canvasPage = useMemo(() => ({ ...page, showcase, profile: { ...page.profile, ...identity, avatar_url: identity.avatar_url || null } }), [page, showcase, identity]);

  const onBlock = (id: string, patch: Partial<BayPageBlock>) => setDoc((current) => patchBlock(current, id, patch));
  const onIdentity = (patch: Partial<BayPageIdentity>) => setIdentity((current) => ({ ...current, ...patch }));

  useEffect(() => {
    if (!vettingFocus || !showVetting) return;
    return afterLayout(() => {
      const node = vettingRef.current;
      if (!node) return;
      node.scrollIntoView?.({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
      node.focus?.({ preventScroll: true });
    });
  }, [vettingFocus, showVetting]);

  async function importWork() {
    if (showcaseBusy) return;
    setShowcaseBusy(true);
    setShowcaseError("");
    try {
      const work = await pickLibraryWork({ title: tt("从我的库挑一件作品") });
      if (!work) return;
      const next = await addShowcaseWork(work);
      setShowcase(next.items || []);
    } catch (err) {
      setShowcaseError(err instanceof Error ? err.message : "");
    } finally {
      setShowcaseBusy(false);
    }
  }

  async function dropWork(id: string) {
    setShowcaseError("");
    try {
      await removeShowcaseItem(id);
      setShowcase((items) => items.filter((item) => item.id !== id));
    } catch (err) {
      setShowcaseError(err instanceof Error ? err.message : "");
    }
  }

  const renderBlockChrome = (block: BayPageBlock, index: number, children: ReactNode) => (
    <div className="group/block relative rounded-xl outline-dashed outline-1 outline-offset-8 outline-transparent hover:outline-stone-400/70 focus-within:outline-stone-400/70" data-bay-page-block-edit={block.id}>
      <div className="absolute -top-4 right-0 z-10 flex items-center gap-1.5">
        <span className="rounded-full bg-white px-3 py-2 text-[12px] font-semibold text-neutral-700 shadow-sm ring-1 ring-black/10">{tt(BAY_PAGE_BLOCK_LABELS[block.type].name)}</span>
        <button type="button" disabled={index === 0} onClick={() => setDoc((current) => moveBlock(current, block.id, -1))} className={CHROME_BUTTON} data-bay-page-block-action="up">
          {tt("上移")}
        </button>
        <button
          type="button"
          disabled={index === doc.blocks.length - 1}
          onClick={() => setDoc((current) => moveBlock(current, block.id, 1))}
          className={CHROME_BUTTON}
          data-bay-page-block-action="down"
        >
          {tt("下移")}
        </button>
        <button type="button" onClick={() => setDoc((current) => removeBlock(current, block.id))} className={CHROME_BUTTON} data-bay-page-block-action="remove">
          {tt("删除")}
        </button>
      </div>
      {children}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-4 pt-3 sm:px-4" data-bay-page-editor>
      <div className="sticky top-0 z-20 shrink-0 rounded-xl border border-neutral-200 bg-white/95 px-4 py-3 text-neutral-900 shadow-sm backdrop-blur sm:px-5" data-bay-page-toolbar>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-wrap items-end gap-x-6 gap-y-3">
            <Group title={tt("底色")}>
              {BAY_PAGE_TONES.map((tone) => {
                const palette = BAY_PAGE_PALETTES[tone];
                return (
                  <Swatch key={tone} selected={theme.tone === tone} label={tt(BAY_PAGE_TONE_LABELS[tone])} onClick={() => setDoc((current) => patchTheme(current, { tone }))}>
                    <span className="block h-6 w-6 rounded-full" style={{ background: `linear-gradient(135deg, ${palette.bg} 50%, ${palette.surface} 50%)`, boxShadow: `inset 0 0 0 1px ${palette.border}` }} />
                  </Swatch>
                );
              })}
            </Group>
            <Group title={tt("主色")}>
              {BAY_PAGE_ACCENTS.map((accent) => (
                <Swatch key={accent} selected={theme.accent.toLowerCase() === accent} label={accent} onClick={() => setDoc((current) => patchTheme(current, { accent }))}>
                  <span className="block h-6 w-6 rounded-full" style={{ background: accent }} />
                </Swatch>
              ))}
              <label className="relative inline-flex cursor-pointer items-center rounded-full p-1 ring-1 ring-black/10" title={tt("自选颜色")}>
                <span className="block h-6 w-6 rounded-full" style={{ background: "conic-gradient(#ef4444, #eab308, #10b981, #0ea5e9, #6366f1, #ec4899, #ef4444)" }} />
                <input
                  type="color"
                  value={theme.accent}
                  aria-label={tt("自选颜色")}
                  onChange={(event) => setDoc((current) => patchTheme(current, { accent: event.target.value }))}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
            </Group>
            <Group title={tt("字体")}>
              {BAY_PAGE_FONTS.map((font) => (
                <button
                  key={font}
                  type="button"
                  role="radio"
                  aria-checked={theme.font === font}
                  onClick={() => setDoc((current) => patchTheme(current, { font }))}
                  style={{ fontFamily: BAY_PAGE_FONT_STACKS[font] }}
                  className={`${BAR_BUTTON} ${theme.font === font ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
                >
                  {tt(BAY_PAGE_FONT_LABELS[font])}
                </button>
              ))}
            </Group>
            <Group title={tt("封面")}>
              {(["gradient", "image", "none"] as const).map((style) => (
                <button
                  key={style}
                  type="button"
                  role="radio"
                  aria-checked={theme.cover_style === style}
                  onClick={() => setDoc((current) => patchTheme(current, { cover_style: style }))}
                  className={`${BAR_BUTTON} ${theme.cover_style === style ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
                >
                  {style === "gradient" ? tt("渐变") : style === "image" ? tt("图片") : tt("不要")}
                </button>
              ))}
            </Group>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={identity.published}
              data-bay-page-published={identity.published ? "true" : "false"}
              onClick={() => onIdentity({ published: !identity.published })}
              className={`${BAR_BUTTON} ${identity.published ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"}`}
            >
              {tt("公开主页")}
            </button>
            <button type="button" onClick={onCancel} disabled={saving} data-bay-page-action="cancel" className={`${BAR_BUTTON} border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50`}>
              {tt("取消")}
            </button>
            <button
              type="button"
              onClick={() => onSave(doc, identity)}
              disabled={saving || tooBig || !dirty || !handleOk || !identity.display_name.trim()}
              data-bay-page-action="save"
              className={`${BAR_BUTTON} bg-neutral-900 px-6 text-white hover:bg-neutral-800 disabled:opacity-40`}
            >
              {saving ? tt("保存中…") : tt("保存主页")}
            </button>
          </div>
        </div>
        {theme.cover_style === "image" ? (
          <div className="mt-3">
            <BayCoverDrop
              url={theme.cover_url}
              onUrl={(url) => setDoc((current) => patchTheme(current, { cover_url: url }))}
            />
          </div>
        ) : null}
        {error ? <p className="mt-2 text-[12px] text-rose-600">{tt(error)}</p> : null}
        {showcaseError ? <p className="mt-2 text-[12px] text-rose-600">{tt(showcaseError)}</p> : null}
        {!handleOk ? <p className="mt-2 text-[12px] text-rose-600">{tt("主页地址要用 3–32 位小写字母、数字、下划线或连字符，以字母或数字开头。")}</p> : null}
        {tooBig ? <p className="mt-2 text-[12px] text-rose-600">{tt("内容太多了，删掉一些文字或图片再保存。")}</p> : null}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto" data-bay-page-canvas>
        <div className="overflow-hidden rounded-xl border border-neutral-200" data-bay-page-canvas-card>
          <ProfilePage
            page={canvasPage}
            doc={doc}
            editing
            identity={identity}
            onIdentity={onIdentity}
            onBlock={onBlock}
            renderBlockChrome={renderBlockChrome}
            onShowcaseImport={() => void importWork()}
            onShowcaseRemove={(id) => void dropWork(id)}
            showcaseBusy={showcaseBusy}
          />
          <div style={{ background: BAY_PAGE_PALETTES[theme.tone].bg }}>
            <AddBlockMenu disabled={doc.blocks.length >= BAY_PAGE_MAX_BLOCKS} onPick={(type) => setDoc((current) => insertBlock(current, newBlock(type, tt)))} />
          </div>
        </div>
        {showVetting ? (
          <div ref={vettingRef} tabIndex={-1} data-bay-mine-vetting className="scroll-mt-32 outline-none">
            <BayVettingSection />
          </div>
        ) : null}
      </div>
    </div>
  );
}

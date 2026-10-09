"use client";

// 编辑主页：顶上一条主题栏（底色风格、主色、字体、封面），下面就是主页本身——点文字直接改，
// 每个版块右上角有上移 / 下移 / 删除，版块之间和页面最下面可以添加版块。只改版面，不产生任何代码。

import { useMemo, useState, type ReactNode } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import type { BayProfilePage } from "../../../lib/bay/directory";
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
  safePageUrl,
  type BayPageBlock,
  type BayPageBlockType,
  type BayPageDoc,
} from "../../../lib/bay/page-doc";
import { ProfilePage } from "./ProfilePage";

const MOTION = "transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]";
const BAR_BUTTON = `rounded-lg px-3 py-1.5 text-[13px] font-medium ${MOTION}`;
const CHROME_BUTTON = `rounded-lg bg-stone-900 px-3 py-1.5 text-[12px] font-medium text-white ${MOTION} hover:bg-stone-800 disabled:opacity-30`;

export interface ProfilePageEditorProps {
  page: BayProfilePage;
  initial: BayPageDoc;
  saving: boolean;
  error: string;
  onSave: (doc: BayPageDoc) => void;
  onCancel: () => void;
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
        <div className="rounded-xl border border-stone-200 bg-white p-4 text-stone-900">
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
                className={`rounded-xl border border-stone-200 px-4 py-3 text-left ${MOTION} hover:border-stone-400 hover:bg-stone-50`}
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
          className={`flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-stone-300 bg-white px-4 py-4 text-[13px] font-medium text-stone-600 ${MOTION} hover:border-stone-900 hover:text-stone-900`}
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

export function ProfilePageEditor({ page, initial, saving, error, onSave, onCancel }: ProfilePageEditorProps) {
  const tt = useUI();
  // 进入编辑那一刻的版面：之后父组件再怎么重画，「有没有改动」都跟它比。
  const [base] = useState<BayPageDoc>(initial);
  const [doc, setDoc] = useState<BayPageDoc>(initial);
  const [coverDraft, setCoverDraft] = useState(initial.theme.cover_url);
  const theme = doc.theme;
  const dirty = doc !== base;
  const tooBig = useMemo(() => pageDocBytes(doc) > BAY_PAGE_MAX_BYTES, [doc]);
  const coverInvalid = Boolean(coverDraft.trim()) && !safePageUrl(coverDraft);

  const onBlock = (id: string, patch: Partial<BayPageBlock>) => setDoc((current) => patchBlock(current, id, patch));

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
    <div className="flex min-h-0 flex-1 flex-col" data-bay-page-editor>
      <div className="sticky top-0 z-20 shrink-0 border-b border-neutral-200 bg-white/95 px-4 py-3 text-neutral-900 backdrop-blur sm:px-6" data-bay-page-toolbar>
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
            <button type="button" onClick={onCancel} disabled={saving} data-bay-page-action="cancel" className={`${BAR_BUTTON} border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50`}>
              {tt("取消")}
            </button>
            <button
              type="button"
              onClick={() => onSave(doc)}
              disabled={saving || tooBig || !dirty}
              data-bay-page-action="save"
              className={`${BAR_BUTTON} bg-neutral-900 px-6 text-white hover:bg-neutral-800 disabled:opacity-40`}
            >
              {saving ? tt("保存中…") : tt("保存主页")}
            </button>
          </div>
        </div>
        {theme.cover_style === "image" ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="url"
              inputMode="url"
              value={coverDraft}
              placeholder="https://"
              aria-label={tt("封面图地址")}
              onChange={(event) => {
                const value = event.target.value;
                setCoverDraft(value);
                const safe = safePageUrl(value);
                if (safe || !value.trim()) setDoc((current) => patchTheme(current, { cover_url: safe }));
              }}
              className={`min-w-0 flex-1 rounded-full border border-neutral-200 bg-white px-4 py-2.5 text-[13px] outline-none ${MOTION} focus-visible:ring-2 focus-visible:ring-neutral-300`}
            />
            <span className={`text-[12px] ${coverInvalid ? "text-rose-600" : "text-neutral-500"}`}>
              {coverInvalid ? tt("地址要以 https:// 开头") : tt("粘贴一张横向大图的地址")}
            </span>
          </div>
        ) : null}
        {error ? <p className="mt-2 text-[12px] text-rose-600">{tt(error)}</p> : null}
        {tooBig ? <p className="mt-2 text-[12px] text-rose-600">{tt("内容太多了，删掉一些文字或图片再保存。")}</p> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" data-bay-page-canvas>
        <ProfilePage page={page} doc={doc} editing onBlock={onBlock} renderBlockChrome={renderBlockChrome} />
        <div style={{ background: BAY_PAGE_PALETTES[theme.tone].bg }}>
          <AddBlockMenu disabled={doc.blocks.length >= BAY_PAGE_MAX_BLOCKS} onPick={(type) => setDoc((current) => insertBlock(current, newBlock(type, tt)))} />
        </div>
      </div>
    </div>
  );
}

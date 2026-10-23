"use client";

import { useState, type ReactNode } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  BAY_PAGE_ACCENTS, BAY_PAGE_BLOCK_LABELS, BAY_PAGE_BLOCK_TYPES, BAY_PAGE_FONTS,
  BAY_PAGE_FONT_LABELS, BAY_PAGE_FONT_STACKS, BAY_PAGE_MAX_BLOCKS,
  BAY_PAGE_PALETTES, BAY_PAGE_TEMPLATES, BAY_PAGE_TONES, BAY_PAGE_TONE_LABELS,
  type BayPageBlockType, type BayPageDoc, type BayPageTemplateId, type BayPageTheme,
} from "../../../lib/bay/page-doc";
import { isBayHandle } from "../../../lib/bay/seller";
import { BayCoverDrop } from "../form/BayCoverDrop";
import { EditableText } from "./EditableText";
import type { BayPageIdentity } from "./ProfilePage";

const MOTION = "transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]";
export const PAGE_EDITOR_BUTTON = `rounded-full px-3 py-2 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 ${MOTION}`;
export const PAGE_EDITOR_QUIET = `${PAGE_EDITOR_BUTTON} bg-white text-neutral-600 hover:bg-neutral-100 disabled:opacity-40`;
const INPUT = "w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-[13px] leading-5 text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-neutral-300";

interface SettingsProps {
  doc: BayPageDoc;
  identity: BayPageIdentity;
  saving: boolean;
  tooBig: boolean;
  selectedBlock: string;
  templateId: BayPageTemplateId | null;
  onIdentity: (patch: Partial<BayPageIdentity>) => void;
  onTheme: (patch: Partial<BayPageTheme>) => void;
  onTemplate: (id: BayPageTemplateId) => void;
  onFocusBlock: (id: string) => void;
  onMoveBlock: (id: string, direction: -1 | 1) => void;
  onRemoveBlock: (id: string) => void;
  onAddBlock: (type: BayPageBlockType) => void;
}

function SidebarSection({ title, children, extra }: { title: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="border-b border-neutral-100 p-4 last:border-b-0">
      <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-[13px] font-semibold text-neutral-900">{title}</h3>{extra}</div>
      {children}
    </section>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <div className="space-y-2"><span className="block text-[12px] font-medium text-neutral-600">{title}</span><div role="radiogroup" aria-label={title} className="flex flex-wrap items-center gap-2">{children}</div></div>;
}

function Swatch({ selected, onClick, label, children }: { selected: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={selected} aria-label={label} title={label} onClick={onClick}
      className={`rounded-full p-1 outline-none ${MOTION} focus-visible:ring-2 focus-visible:ring-neutral-300 ${selected ? "ring-2 ring-neutral-300 ring-offset-2" : "ring-1 ring-neutral-200 hover:ring-neutral-300"}`}>
      {children}
    </button>
  );
}

function TagInput({ items, label, onChange }: { items: string[]; label: string; onChange: (items: string[]) => void }) {
  const [draft, setDraft] = useState(items.join(", "));
  return (
    <label className="block space-y-1.5"><span className="text-[12px] text-neutral-600">{label}</span>
      <input value={draft} aria-label={label} className={INPUT} maxLength={820} onChange={(event) => {
        setDraft(event.target.value);
        onChange([...new Set(event.target.value.split(/[,，\n]/).map((item) => item.trim().slice(0, 40)).filter(Boolean))].slice(0, 20));
      }} />
    </label>
  );
}

function AddBlockMenu({ onPick, disabled }: { onPick: (type: BayPageBlockType) => void; disabled: boolean }) {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  return (
    <div data-bay-page-add className="mt-3">
      <button type="button" disabled={disabled} aria-expanded={open} data-bay-page-add-open onClick={() => setOpen((value) => !value)}
        className={`${PAGE_EDITOR_QUIET} flex w-full items-center justify-center gap-2 border border-dashed border-neutral-300 disabled:cursor-not-allowed`}>
        <span aria-hidden className="text-[18px] leading-none">+</span>{tt("添加版块")}
      </button>
      {disabled ? <p className="mt-2 text-[12px] text-neutral-500">{tt("一张主页最多 {n} 个版块。", { n: BAY_PAGE_MAX_BLOCKS })}</p> : null}
      {open && !disabled ? <div className="mt-2 space-y-1 rounded-xl bg-neutral-50 p-2">{BAY_PAGE_BLOCK_TYPES.map((type) => (
        <button key={type} type="button" data-bay-page-add-type={type} className="w-full rounded-lg px-2 py-2 text-left hover:bg-white focus-visible:ring-2 focus-visible:ring-neutral-300"
          onClick={() => { onPick(type); setOpen(false); }}>
          <span className="block text-[12px] font-semibold text-neutral-800">{tt(BAY_PAGE_BLOCK_LABELS[type].name)}</span><span className="mt-0.5 block text-[11px] leading-4 text-neutral-500">{tt(BAY_PAGE_BLOCK_LABELS[type].hint)}</span>
        </button>
      ))}</div> : null}
    </div>
  );
}

function TemplateThumbnail({ template }: { template: (typeof BAY_PAGE_TEMPLATES)[number] }) {
  const palette = BAY_PAGE_PALETTES[template.tone];
  return (
    <div aria-hidden className="h-20 overflow-hidden rounded-lg border" style={{ background: palette.bg, borderColor: palette.border }}>
      {template.cover_style !== "none" ? <div className="h-5" style={{ background: template.accent, opacity: 0.5 }} /> : <div className="h-3" />}
      <div className="space-y-1.5 px-2.5 py-2"><div className="h-1.5 w-1/2 rounded-full" style={{ background: palette.fg, opacity: 0.8 }} /><div className="h-1 w-4/5 rounded-full" style={{ background: palette.muted, opacity: 0.4 }} />
        {template.id === "portfolio" || template.id === "studio" ? <div className="grid grid-cols-3 gap-1 pt-0.5">{[0, 1, 2].map((item) => <div key={item} className="h-5 rounded" style={{ background: template.accent, opacity: 0.14 + item * 0.08 }} />)}</div> : <div className="h-1 w-3/5 rounded-full" style={{ background: palette.muted, opacity: 0.35 }} />}
      </div>
    </div>
  );
}

export function ProfilePageSettings(props: SettingsProps) {
  const tt = useUI();
  const { doc, identity, saving, tooBig, selectedBlock, templateId, onIdentity, onTheme, onTemplate, onFocusBlock, onMoveBlock, onRemoveBlock, onAddBlock } = props;
  const theme = doc.theme;
  return (
    <aside className="max-h-48 shrink-0 overflow-y-auto rounded-xl border border-neutral-200 bg-white lg:max-h-none lg:w-72" data-bay-page-toolbar aria-label={tt("页面设计")}>
      <fieldset disabled={saving} className="min-w-0 disabled:opacity-60">
        <SidebarSection title={tt("页面模板")}>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label={tt("页面模板")}>{BAY_PAGE_TEMPLATES.map((template) => (
            <button key={template.id} type="button" data-bay-page-template={template.id} aria-pressed={templateId === template.id} onClick={() => onTemplate(template.id)}
              className={`rounded-xl border p-2 text-left outline-none ${MOTION} focus-visible:ring-2 focus-visible:ring-neutral-300 ${templateId === template.id ? "border-neutral-300 bg-neutral-50 ring-1 ring-neutral-200" : "border-neutral-100 hover:bg-neutral-50"}`}>
              <TemplateThumbnail template={template} /><span className="mt-2 block text-[12px] font-semibold text-neutral-800">{tt(template.name)}</span><span className="mt-0.5 block text-[10px] leading-4 text-neutral-500">{tt(template.hint)}</span>
            </button>
          ))}</div><p className="mt-3 text-[11px] leading-4 text-neutral-500">{tt("模板会保留已有内容与图片，只调整风格和顺序。")}</p>
        </SidebarSection>
        <SidebarSection title={tt("个人资料")}>
          <div className="space-y-3">
            <BayCoverDrop url={identity.avatar_url} onUrl={(url) => onIdentity({ avatar_url: url })} variant="avatar" disabled={saving} />
            <div data-bay-field="display_name"><span className="mb-1.5 block text-[12px] text-neutral-600">{tt("显示名")}</span><EditableText value={identity.display_name} editing onChange={(value) => onIdentity({ display_name: value })} label={tt("显示名")} maxLength={80} className={INPUT} /></div>
            <div data-bay-field="handle"><span className="mb-1.5 block text-[12px] text-neutral-600">{tt("主页地址")}</span><div className="flex items-center gap-1"><span className="text-[13px] text-neutral-400">@</span><EditableText value={identity.handle} editing onChange={(value) => onIdentity({ handle: value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} label={tt("主页地址")} maxLength={32} className={INPUT} /></div></div>
            <div data-bay-field="skills"><TagInput items={identity.skills} label={tt("技能")} onChange={(skills) => onIdentity({ skills })} /></div>
            <div data-bay-field="languages"><TagInput items={identity.languages} label={tt("语言")} onChange={(languages) => onIdentity({ languages })} /></div>
            <p className="text-[11px] text-neutral-500">{tt("多项内容用逗号分隔。")}</p>
            {!isBayHandle(identity.handle) ? <p role="alert" className="text-[11px] leading-4 text-rose-600">{tt("主页地址要用 3–32 位小写字母、数字、下划线或连字符，以字母或数字开头。")}</p> : null}
            {!identity.display_name.trim() ? <p role="alert" className="text-[11px] text-rose-600">{tt("显示名不能为空。")}</p> : null}
          </div>
        </SidebarSection>
        <SidebarSection title={tt("页面设计")}>
          <div className="space-y-4">
            <Group title={tt("底色")}>{BAY_PAGE_TONES.map((tone) => {
              const palette = BAY_PAGE_PALETTES[tone];
              return <Swatch key={tone} selected={theme.tone === tone} label={tt(BAY_PAGE_TONE_LABELS[tone])} onClick={() => onTheme({ tone })}><span className="block h-5 w-5 rounded-full" style={{ background: `linear-gradient(135deg, ${palette.bg} 50%, ${palette.surface} 50%)`, boxShadow: `inset 0 0 0 1px ${palette.border}` }} /></Swatch>;
            })}</Group>
            <Group title={tt("主色")}>{BAY_PAGE_ACCENTS.map((accent) => <Swatch key={accent} selected={theme.accent.toLowerCase() === accent} label={accent} onClick={() => onTheme({ accent })}><span className="block h-5 w-5 rounded-full" style={{ background: accent }} /></Swatch>)}
              <label className="relative inline-flex cursor-pointer rounded-full p-1 ring-1 ring-neutral-200" title={tt("自选颜色")}><span className="block h-5 w-5 rounded-full" style={{ background: "conic-gradient(#ef4444, #eab308, #10b981, #0ea5e9, #6366f1, #ec4899, #ef4444)" }} /><input type="color" value={theme.accent} aria-label={tt("自选颜色")} className="absolute inset-0 cursor-pointer opacity-0" onChange={(event) => onTheme({ accent: event.target.value })} /></label>
            </Group>
            <Group title={tt("字体")}>{BAY_PAGE_FONTS.map((font) => <button key={font} type="button" role="radio" aria-checked={theme.font === font} onClick={() => onTheme({ font })} style={{ fontFamily: BAY_PAGE_FONT_STACKS[font] }} className={`${PAGE_EDITOR_BUTTON} px-2 py-1.5 text-[12px] ${theme.font === font ? "bg-neutral-100 text-neutral-900" : "text-neutral-500 hover:bg-neutral-50"}`}>{tt(BAY_PAGE_FONT_LABELS[font])}</button>)}</Group>
            <Group title={tt("封面")}>{(["gradient", "image", "none"] as const).map((style) => <button key={style} type="button" role="radio" aria-checked={theme.cover_style === style} onClick={() => onTheme({ cover_style: style })} className={`${PAGE_EDITOR_BUTTON} px-2 py-1.5 text-[12px] ${theme.cover_style === style ? "bg-neutral-100 text-neutral-900" : "text-neutral-500 hover:bg-neutral-50"}`}>{style === "gradient" ? tt("渐变") : style === "image" ? tt("图片") : tt("不要")}</button>)}</Group>
            {theme.cover_style === "image" ? <div data-bay-page-cover-settings><BayCoverDrop url={theme.cover_url} onUrl={(url) => onTheme({ cover_url: url })} disabled={saving} /></div> : null}
          </div>
        </SidebarSection>
        <SidebarSection title={tt("版块顺序")} extra={<span className="text-[11px] text-neutral-400">{doc.blocks.length}/{BAY_PAGE_MAX_BLOCKS}</span>}>
          <ol className="space-y-1" data-bay-page-outline>{doc.blocks.map((block, index) => (
            <li key={block.id} data-bay-page-outline-id={block.id} className={`flex min-w-0 items-center gap-1 rounded-lg p-1 ${selectedBlock === block.id ? "bg-neutral-100" : "hover:bg-neutral-50"}`}>
              <button type="button" onClick={() => onFocusBlock(block.id)} aria-current={selectedBlock === block.id ? "true" : undefined} className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-2 text-left text-[12px] text-neutral-700"><span className="w-4 shrink-0 text-[10px] tabular-nums text-neutral-400">{String(index + 1).padStart(2, "0")}</span><span className="truncate">{block.title || tt(BAY_PAGE_BLOCK_LABELS[block.type].name)}</span></button>
              <button type="button" data-bay-page-block-action="up" aria-label={tt("上移")} title={tt("上移")} disabled={index === 0} onClick={() => onMoveBlock(block.id, -1)} className="rounded p-1 text-[12px] text-neutral-500 hover:bg-neutral-200 disabled:opacity-25">↑</button>
              <button type="button" data-bay-page-block-action="down" aria-label={tt("下移")} title={tt("下移")} disabled={index === doc.blocks.length - 1} onClick={() => onMoveBlock(block.id, 1)} className="rounded p-1 text-[12px] text-neutral-500 hover:bg-neutral-200 disabled:opacity-25">↓</button>
              <button type="button" data-bay-page-block-action="remove" aria-label={tt("删除")} title={tt("删除")} onClick={() => onRemoveBlock(block.id)} className="rounded p-1 text-[14px] text-neutral-400 hover:bg-rose-50 hover:text-rose-600">×</button>
            </li>
          ))}</ol><AddBlockMenu disabled={doc.blocks.length >= BAY_PAGE_MAX_BLOCKS} onPick={onAddBlock} />
        </SidebarSection>
        <SidebarSection title={tt("公开主页")}>
          <button type="button" role="switch" aria-checked={identity.published} data-bay-page-published={identity.published ? "true" : "false"} onClick={() => onIdentity({ published: !identity.published })} className="flex w-full items-center justify-between gap-3 rounded-lg bg-neutral-50 p-3 text-[12px] font-medium text-neutral-700"><span>{identity.published ? tt("已公开") : tt("未公开")}</span><span aria-hidden className={`flex h-5 w-9 items-center rounded-full px-0.5 ${identity.published ? "justify-end bg-emerald-600" : "bg-neutral-300"}`}><span className="h-4 w-4 rounded-full bg-white" /></span></button>
          <p className="mt-2 text-[11px] leading-4 text-neutral-500">{identity.published ? tt("公开后，任何人都可以访问这张主页。") : tt("保存后，仅你自己可以查看这张主页。")}</p>
          {tooBig ? <p role="alert" className="mt-2 text-[12px] text-rose-600">{tt("内容太多了，删掉一些文字或图片再保存。")}</p> : null}
        </SidebarSection>
      </fieldset>
    </aside>
  );
}

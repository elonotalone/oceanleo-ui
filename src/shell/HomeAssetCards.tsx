"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { DomainFamily } from "../contracts/domain-family";
import { useUI } from "../i18n/ui/useUI";
import { resolvePublicAssetMedia } from "../lib/asset-delivery";
import { brandColorFor } from "../lib/brand-color";
import { APP_CARD_GRID_CLASS, AppCardFrame, AppCardShell, AppCardText, AppCardThumb } from "./app-card-shell";
import { AddPromptModal, PromptCardModal } from "./HomePromptModals";
import { loadCustomPromptCards, promptCardsForSite, saveCustomPromptCards, type PromptCard } from "./home-cards";
import { homeAssetCardKey, homeAssetSections, type HomeAssetRef, type HomeAssetSection, type HomeAssetSectionId } from "./home-asset-cards-model";

const SECTION_COPY = { video: "视频素材", image: "图片素材", website: "网站素材", essay: "文章素材" } as const;
const SECTION_ICONS = { video: "🎬", image: "🖼️", website: "🌐", essay: "📄" } as const;

export interface HomeAssetCardsProps {
  /** Pass GET /v1/home/assets.sections; fetching/retry belongs to the host. */
  sections: readonly HomeAssetSection[];
  siteId: string;
  accent?: string;
  /** Pass the request family for identical SSR/client preview resolution. */
  family?: DomainFamily;
  loading?: boolean;
  error?: boolean;
  onOpenAsset: (ref: HomeAssetRef) => void;
  /** Same placeholder/highlight action as HomeAppCards; never attaches an asset. */
  onPick: (prompt: string) => void;
}

export function HomeAssetCards({ sections, siteId, accent = "#4f46e5", family, loading = false, error = false, onOpenAsset, onPick }: HomeAssetCardsProps) {
  const tt = useUI();
  const instanceId = useId();
  const sectionNodes = useRef<Partial<Record<HomeAssetSectionId, HTMLElement | null>>>({});
  const [active, setActive] = useState<HomeAssetSectionId>("video");
  // Keep the loaded site's identity with its cards, so switching sites cannot write old cards to a new key.
  const [stored, setStored] = useState<{ siteId: string; cards: PromptCard[] }>({ siteId, cards: [] });
  const custom = stored.siteId === siteId ? stored.cards : [];
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PromptCard | null>(null);
  const groups = useMemo(() => homeAssetSections(sections), [sections]);
  const presets = useMemo(() => promptCardsForSite(siteId), [siteId]);
  const categories = [...new Set(custom.map((card) => card.category).filter(Boolean))];

  useEffect(() => {
    setStored({ siteId, cards: loadCustomPromptCards(siteId) });
    setAdding(false);
    setEditing(null);
  }, [siteId]);

  function persist(cards: PromptCard[]) {
    setStored({ siteId, cards });
    saveCustomPromptCards(siteId, cards);
  }

  function saveAsMine(card: PromptCard) {
    if (!card.custom || !card.id.startsWith("custom-")) {
      persist([{ ...card, id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, custom: true, category: card.category || tt("我的") }, ...custom]);
    } else {
      persist(custom.map((previous) => previous.id === card.id ? { ...card, custom: true } : previous));
    }
  }

  function jump(id: HomeAssetSectionId) {
    setActive(id);
    const target = sectionNodes.current[id];
    target?.scrollIntoView({ block: "start", behavior: "auto" });
    target?.focus({ preventScroll: true });
  }

  return (
    <section className="w-full" data-home-asset-cards>
      <nav aria-label={tt("首页素材分类")} className="flex flex-wrap items-center gap-1 border-b border-stone-200/70">
        {groups.map(({ id }) => (
          <button key={id} type="button" aria-controls={`${instanceId}-${id}`} aria-current={active === id ? "location" : undefined}
            onClick={() => jump(id)} className="relative rounded px-3 pb-2 pt-1 text-[13px] text-stone-600 focus-visible:outline focus-visible:outline-2"
            style={active === id ? { color: accent, boxShadow: `inset 0 -2px ${accent}` } : undefined}>
            {tt(SECTION_COPY[id])}
          </button>
        ))}
      </nav>
      {loading && <p role="status" className="py-3 text-sm text-stone-500">{tt("正在加载首页素材…")}</p>}
      {error && <p role="alert" className="py-3 text-sm text-stone-500">{tt("首页素材暂时无法加载，请稍后重试。")}</p>}
      {groups.map(({ id, items }) => (
        <section key={id} id={`${instanceId}-${id}`} ref={(node) => { sectionNodes.current[id] = node; }} tabIndex={-1}
          aria-labelledby={`${instanceId}-${id}-heading`} className="scroll-mt-4 pt-5 focus-visible:outline focus-visible:outline-2" data-home-asset-section={id}>
          <h2 id={`${instanceId}-${id}-heading`} className="mb-3 text-sm font-semibold text-stone-800">{tt(SECTION_COPY[id])}</h2>
          <div className={APP_CARD_GRID_CLASS}>
            {items.map((item) => (
              <div key={homeAssetCardKey(item.ref)} data-home-asset-ref={homeAssetCardKey(item.ref)}
                className="[&:focus-within_[data-app-card-actions]]:translate-y-0">
                <AppCardShell variant="home" accent={accent}
                  app={{ id: homeAssetCardKey(item.ref), name: item.title, tagline: item.summary, icon: SECTION_ICONS[id] }}
                  image={resolvePublicAssetMedia(item.preview.key || item.preview.url || "", { purpose: "thumb", family })}
                  cardActionLabel={tt("打开素材：{title}", { title: item.title })}
                  onCardClick={() => onOpenAsset(item.ref)}
                  primaryAction={item.promptText?.trim() ? { label: tt("prompt"), onClick: () => onPick(item.promptText!) } : null}
                />
              </div>
            ))}
          </div>
          {!items.length && !loading && !error && <p className="py-3 text-sm text-stone-400" data-home-asset-empty={id}>
            {tt(id === "video" ? "暂无可用视频素材" : "暂无可用素材")}
          </p>}
        </section>
      ))}
      <section aria-labelledby={`${instanceId}-prompts`} className="pt-5" data-home-custom-prompts>
        <h2 id={`${instanceId}-prompts`} className="mb-3 text-sm font-semibold text-stone-800">{tt("我的 prompt")}</h2>
        <div className={APP_CARD_GRID_CLASS}>
          {custom.map((card) => (
            <AppCardFrame key={card.id} variant="home" actionLabel={card.title} onAction={() => onPick(card.prompt)}
              actions={<button type="button" onClick={() => setEditing(card)} aria-label={tt("编辑 prompt：{title}", { title: card.title })}
                className="absolute right-1.5 top-1.5 rounded-md bg-white/90 p-1 text-stone-500 focus-visible:outline focus-visible:outline-2">✎</button>}>
              <AppCardThumb icon={card.icon || "✨"} color={brandColorFor(card.id)} alt={card.title} />
              <AppCardText name={card.title} tagline={card.desc || card.prompt} />
            </AppCardFrame>
          ))}
          <button type="button" onClick={() => setAdding(true)} data-home-add-prompt
            className="flex min-h-[100px] items-center justify-center gap-1.5 rounded-xl border border-dashed border-stone-300 bg-white/60 p-3 text-[13px] text-stone-500 focus-visible:outline focus-visible:outline-2">
            <span aria-hidden="true">＋</span>{tt("添加 prompt")}
          </button>
        </div>
      </section>
      {adding && <AddPromptModal accent={accent} presets={presets} existing={custom} categories={categories} onAdd={saveAsMine} onClose={() => setAdding(false)} />}
      {editing && <PromptCardModal card={editing} isNew={false} accent={accent} categories={categories}
        onUse={(text) => { onPick(text); setEditing(null); }}
        onSave={(card) => { saveAsMine(card); setEditing(null); }}
        onDelete={editing.custom ? () => { persist(custom.filter((card) => card.id !== editing.id)); setEditing(null); } : undefined}
        onClose={() => setEditing(null)} />}
    </section>
  );
}

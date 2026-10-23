"use client";

// LeoBay 个人主页：封面 + 身份 + 一叠「版块」。版面来自一份 JSON（`page_doc`），颜色与字体由主题决定。
// 同一个组件既是别人看到的主页，也是本人编辑时的画布（`editing`）：编辑时文字原地可改，每个版块多出一条操作条。
// 自动列出的三种版块（我的发布 / 作品集 / 评价）直接铺在页上。

import { useState, type CSSProperties, type ReactNode } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import type { BayProfilePage, BayPublicProfile } from "../../../lib/bay/directory";
import { profileDisplayName, splitShowcase } from "../../../lib/bay/directory";
import {
  coverGradient,
  pageThemeVars,
  safePageUrl,
  type BayPageBlock,
  type BayPageDoc,
} from "../../../lib/bay/page-doc";
import type { BayService } from "../../../lib/bay/services";
import type { BayFeedItem } from "../../../lib/bay/types";
import { BayCoverDrop } from "../form/BayCoverDrop";
import { openBay } from "../shell/bay-state";
import { ratingShort, responseTimeText, safeHttpUrl } from "../supply/format";
import { Avatar, PracticeLine, ReputationGrid, ReviewList } from "../supply/parts";
import { ServiceCard } from "../supply/ServiceCard";
import { EditableText } from "./EditableText";

const MOTION = "transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]";

/** 画布上能改的那几项身份（名字、地址、头像、技能、语言、是否公开）。简介在开场/文字版块里。 */
export interface BayPageIdentity {
  handle: string;
  display_name: string;
  avatar_url: string;
  skills: string[];
  languages: string[];
  published: boolean;
}

export interface ProfilePageProps {
  page: BayProfilePage;
  doc: BayPageDoc;
  /** 本人在编辑：文字可改，版块带操作条。 */
  editing?: boolean;
  /** Builder identity fields live in its sidebar; older inline callers retain their behavior. */
  editingIdentity?: boolean;
  /** A phone preview must use phone geometry even inside a desktop browser. */
  compact?: boolean;
  onBlock?: (id: string, patch: Partial<BayPageBlock>) => void;
  /** 编辑时包在每个版块外面的操作条（上移 / 下移 / 删除 / 在下面加）。 */
  renderBlockChrome?: (block: BayPageBlock, index: number, children: ReactNode) => ReactNode;
  /** 身份区右侧的操作（先聊聊 / 收藏 / 编辑主页…）。 */
  actions?: ReactNode;
  /** 「先聊聊」按钮按下：版块里的按钮与身份区的按钮走同一个动作。本人看自己的主页时不传。 */
  onTalk?: () => void;
  /** 官方账号主页上的「逛官方现成文件」。 */
  onBrowseMaterials?: () => void;
  identity?: BayPageIdentity;
  onIdentity?: (patch: Partial<BayPageIdentity>) => void;
  onShowcaseImport?: () => void;
  onShowcaseRemove?: (id: string) => void;
  showcaseBusy?: boolean;
  /** 本人看未公开的主页：一条提示，不是第二张表。 */
  unpublished?: boolean;
}

function asFeedItem(service: BayService, profile: BayPublicProfile): BayFeedItem & { delivery_days: number | null } {
  const extra = service as BayService & { listing_kind?: "service" | "digital" };
  return {
    kind: "service",
    id: service.id,
    title: service.title,
    summary: service.summary,
    category: service.category,
    created_at: service.created_at || "",
    posted_site: null,
    handling_site: service.category || "oceanleo",
    price: {
      min_fen: service.min_price_fen ?? service.price_fen ?? null,
      max_fen: null,
      unit: service.price_unit || "project",
      currency: service.currency || "CNY",
    },
    author: {
      user_id: profile.user_id,
      handle: profile.handle,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      verified_level: 0,
      rating_avg: profile.rating_avg ?? null,
      rating_count: profile.rating_count ?? 0,
    },
    stats: { order_count: service.order_count },
    status: service.status,
    deadline_at: null,
    cover_url: service.cover_url,
    has_attached_work: false,
    delivery_days: service.delivery_days,
    ...(extra.listing_kind ? { listing_kind: extra.listing_kind } : {}),
  };
}

const accentButton: CSSProperties = { background: "var(--bp-accent)", color: "var(--bp-accent-ink)" };

function AccentButton({ label, onClick, large }: { label: string; onClick?: () => void; large?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      data-bay-page-cta
      style={accentButton}
      className={`inline-flex items-center justify-center rounded-lg font-medium ${MOTION} hover:opacity-90 disabled:cursor-default ${
        large ? "px-4 py-2 text-[14px]" : "px-3 py-1.5 text-[13px]"
      }`}
    >
      {label}
    </button>
  );
}

function BlockTitle({ block, editing, onBlock, fallback }: { block: BayPageBlock; editing: boolean; onBlock?: ProfilePageProps["onBlock"]; fallback: string }) {
  const tt = useUI();
  return (
    <EditableText
      as="h2"
      value={editing ? block.title ?? "" : block.title || fallback}
      editing={editing}
      onChange={(title) => onBlock?.(block.id, { title })}
      maxLength={200}
      label={tt("版块标题")}
      className="text-[17px] font-semibold leading-tight tracking-tight"
    />
  );
}

/** 浅色内容区：里面放共用的发布卡片、评价列表（它们只有浅色一套）。 */
function LightCard({ children }: { children: ReactNode }) {
  return <div className="rounded-xl bg-white p-4 text-stone-900">{children}</div>;
}

function EmptyLine({ text }: { text: string }) {
  return (
    <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-[13px]" style={{ borderColor: "var(--bp-border)", color: "var(--bp-muted)" }}>
      {text}
    </p>
  );
}

function ImageUrlAdder({ onAdd, label }: { onAdd: (url: string) => void; label: string }) {
  const tt = useUI();
  return (
    <form
      className="mt-3 flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const input = event.currentTarget.elements.namedItem("url") as HTMLInputElement | null;
        const url = safePageUrl(input?.value);
        if (!url || !input) return;
        onAdd(url);
        input.value = "";
      }}
    >
      <input
        name="url"
        type="url"
        inputMode="url"
        placeholder="https://"
        aria-label={label}
        className={`min-w-0 flex-1 rounded-full border bg-transparent px-4 py-2.5 text-[13px] outline-none ${MOTION} focus-visible:ring-2 focus-visible:ring-neutral-300`}
        style={{ borderColor: "var(--bp-border)", color: "var(--bp-fg)" }}
      />
      <button type="submit" className={`rounded-full px-4 py-2.5 text-[13px] font-medium ${MOTION} hover:opacity-80`} style={{ background: "var(--bp-accent-soft)", color: "var(--bp-fg)" }}>
        {tt("添加")}
      </button>
    </form>
  );
}

function TagPills({
  items,
  editing,
  onChange,
  addLabel,
  field,
  tone,
}: {
  items: string[];
  editing: boolean;
  onChange?: (items: string[]) => void;
  addLabel: string;
  field: string;
  tone: "accent" | "outline";
}) {
  const tt = useUI();
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const chip =
    tone === "accent"
      ? "rounded-full px-3 py-1 font-medium"
      : "rounded-full border px-3 py-1";
  const chipStyle: CSSProperties =
    tone === "accent" ? { background: "var(--bp-accent-soft)" } : { borderColor: "var(--bp-border)", color: "var(--bp-muted)" };

  function commit(raw: string) {
    const value = raw.trim();
    setDraft("");
    setAdding(false);
    if (!value || items.includes(value) || items.length >= 20) return;
    onChange?.([...items, value]);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-bay-field={field}>
      {items.map((item) => (
        <span key={`${field}-${item}`} className={`inline-flex items-center gap-1 ${chip}`} style={chipStyle}>
          {item}
          {editing ? (
            <button
              type="button"
              aria-label={tt("移除")}
              onClick={() => onChange?.(items.filter((row) => row !== item))}
              className={`rounded-full px-1 text-[11px] leading-none ${MOTION} hover:opacity-60`}
            >
              ×
            </button>
          ) : null}
        </span>
      ))}
      {editing && adding ? (
        <input
          autoFocus
          value={draft}
          maxLength={40}
          aria-label={addLabel}
          onChange={(event) => setDraft(event.target.value.replace(/\n/g, " "))}
          onBlur={() => commit(draft)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit(draft);
            }
            if (event.key === "Escape") {
              setDraft("");
              setAdding(false);
            }
          }}
          className={`w-28 rounded-full border bg-transparent px-3 py-1 text-[12px] outline-none ${MOTION} focus-visible:ring-2 focus-visible:ring-neutral-300`}
          style={{ borderColor: "var(--bp-border)", color: "var(--bp-fg)" }}
        />
      ) : null}
      {editing && !adding && items.length < 20 ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={`rounded-full border border-dashed px-3 py-1 text-[12px] font-medium ${MOTION} hover:opacity-70`}
          style={{ borderColor: "var(--bp-border)", color: "var(--bp-muted)" }}
        >
          + {addLabel}
        </button>
      ) : null}
    </div>
  );
}

function RemoveChip({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`absolute right-2 top-2 rounded-full bg-black/65 px-2.5 py-1.5 text-[11px] font-medium text-white ${MOTION} hover:bg-black/85`}
    >
      {label}
    </button>
  );
}

function BlockBody({ block, props }: { block: BayPageBlock; props: ProfilePageProps }) {
  const tt = useUI();
  const { page, editing = false, compact = false, onBlock, onTalk } = props;
  const { profile, services, showcase, reviews } = page;
  const patch = (next: Partial<BayPageBlock>) => onBlock?.(block.id, next);

  switch (block.type) {
    case "hero":
      return (
        <div className={compact ? "py-4" : "py-4 sm:py-6"}>
          <EditableText
            as="h2"
            value={block.title ?? ""}
            editing={editing}
            onChange={(title) => patch({ title })}
            maxLength={200}
            label={tt("大标题")}
            className={compact ? "text-[28px] font-semibold leading-tight tracking-tight" : "text-[28px] font-semibold leading-tight tracking-tight sm:text-[40px]"}
          />
          <div className="mt-4 max-w-2xl">
            <EditableText
              value={block.subtitle ?? ""}
              editing={editing}
              onChange={(subtitle) => patch({ subtitle })}
              maxLength={400}
              multiline
              label={tt("副标题")}
              className={compact ? "text-[16px] leading-relaxed" : "text-[17px] leading-relaxed sm:text-[19px]"}
              style={{ color: "var(--bp-muted)" }}
            />
          </div>
          {block.cta_label || editing ? (
            <div className="mt-7 flex flex-wrap items-center gap-3">
              {editing ? (
                <span style={accentButton} className="inline-flex rounded-lg px-4 py-2 text-[14px] font-medium">
                  <EditableText
                    as="span"
                    value={block.cta_label ?? ""}
                    editing
                    onChange={(cta_label) => patch({ cta_label })}
                    maxLength={40}
                    label={tt("按钮文字")}
                    className="w-28 text-center text-[15px] font-semibold"
                  />
                </span>
              ) : (
                <AccentButton label={block.cta_label || tt("先聊聊")} onClick={onTalk} large />
              )}
            </div>
          ) : null}
        </div>
      );

    case "text":
      return (
        <div>
          <BlockTitle block={block} editing={editing} onBlock={onBlock} fallback="" />
          <div className="mt-3 max-w-3xl">
            <EditableText
              value={block.body ?? ""}
              editing={editing}
              onChange={(body) => patch({ body })}
              maxLength={4000}
              multiline
              label={tt("正文")}
              className="text-[16px] leading-[1.8]"
              style={{ color: "var(--bp-fg)", opacity: 0.86 }}
            />
          </div>
        </div>
      );

    case "gallery": {
      const images = block.images ?? [];
      return (
        <div>
          <BlockTitle block={block} editing={editing} onBlock={onBlock} fallback="" />
          {images.length ? (
            <div className={compact ? "mt-4 columns-2 gap-3" : "mt-4 columns-2 gap-3 sm:columns-3"} data-bay-page-gallery>
              {images.map((image, index) => (
                <figure key={`${image.url}-${index}`} className="relative mb-3 break-inside-avoid overflow-hidden rounded-2xl" style={{ background: "var(--bp-surface)" }}>
                  <img src={image.url} alt={image.caption} loading="lazy" className="block w-full" />
                  {image.caption && !editing ? (
                    <figcaption className="px-3 py-2 text-[12px]" style={{ color: "var(--bp-muted)" }}>
                      {image.caption}
                    </figcaption>
                  ) : null}
                  {editing ? (
                    <>
                      <RemoveChip label={tt("移除")} onClick={() => patch({ images: images.filter((_, at) => at !== index) })} />
                      <div className="px-3 py-2">
                        <EditableText
                          value={image.caption}
                          editing
                          onChange={(caption) => patch({ images: images.map((item, at) => (at === index ? { ...item, caption } : item)) })}
                          maxLength={200}
                          label={tt("图片说明")}
                          className="text-[12px]"
                          style={{ color: "var(--bp-muted)" }}
                        />
                      </div>
                    </>
                  ) : null}
                </figure>
              ))}
            </div>
          ) : editing ? (
            <div className="mt-4">
              <EmptyLine text={tt("还没有图片。拖一张图进来或从本地选择。")} />
            </div>
          ) : null}
          {editing && images.length < 24 ? (
            <div className="mt-3">
              <BayCoverDrop url="" onUrl={(url) => patch({ images: [...images, { url, caption: "" }] })} />
            </div>
          ) : null}
        </div>
      );
    }

    case "stats": {
      const items = block.items ?? [];
      return (
        <div>
          <dl className={compact ? "grid grid-cols-2 gap-3" : "grid grid-cols-2 gap-3 sm:grid-cols-4"} data-bay-page-stats>
            {items.map((item, index) => (
              <div key={index} className="relative rounded-xl px-4 py-4" style={{ background: "var(--bp-surface)" }}>
                <dd>
                  <EditableText
                    as="div"
                    value={item.value}
                    editing={editing}
                    onChange={(value) => patch({ items: items.map((row, at) => (at === index ? { ...row, value } : row)) })}
                    maxLength={24}
                    label={tt("数字")}
                    className="text-[22px] font-semibold leading-none tracking-tight"
                    style={{ color: "var(--bp-accent)" }}
                  />
                </dd>
                <dt className="mt-2">
                  <EditableText
                    as="div"
                    value={item.label}
                    editing={editing}
                    onChange={(label) => patch({ items: items.map((row, at) => (at === index ? { ...row, label } : row)) })}
                    maxLength={60}
                    label={tt("说明")}
                    className="text-[13px]"
                    style={{ color: "var(--bp-muted)" }}
                  />
                </dt>
                {editing ? <RemoveChip label={tt("移除")} onClick={() => patch({ items: items.filter((_, at) => at !== index) })} /> : null}
              </div>
            ))}
            {editing && items.length < 8 ? (
              <button
                type="button"
                onClick={() => patch({ items: [...items, { value: "0", label: tt("说明") }] })}
                className={`rounded-xl border border-dashed px-4 py-4 text-[13px] font-medium ${MOTION} hover:opacity-70`}
                style={{ borderColor: "var(--bp-border)", color: "var(--bp-muted)" }}
              >
                {tt("加一个数字")}
              </button>
            ) : null}
          </dl>
        </div>
      );
    }

    case "services":
      return (
        <div>
          <BlockTitle block={block} editing={editing} onBlock={onBlock} fallback={tt("我的发布")} />
          <div className="mt-4">
            {services.length ? (
              <LightCard>
                <div className={compact ? "grid gap-3" : "grid gap-3 sm:grid-cols-2"} data-bay-profile-services>
                  {services.map((service) => (
                    <ServiceCard key={service.id} item={asFeedItem(service, profile)} variant="card" onOpen={() => openBay({ kind: "service", id: service.id })} />
                  ))}
                </div>
              </LightCard>
            ) : (
              <EmptyLine text={tt("还没有发布任何东西。")} />
            )}
          </div>
        </div>
      );

    case "showcase": {
      const { portfolio, verified } = splitShowcase(showcase);
      const items = [...portfolio, ...verified];
      const { onShowcaseImport, onShowcaseRemove, showcaseBusy } = props;
      return (
        <div>
          <BlockTitle block={block} editing={editing} onBlock={onBlock} fallback={tt("作品集")} />
          <div className="mt-4">
            {items.length ? (
              <div className={compact ? "grid gap-3" : "grid gap-3 sm:grid-cols-2"}>
                {items.map((item) => {
                  const cover = safeHttpUrl(item.cover_url);
                  return (
                    <article key={item.id} data-bay-showcase={item.id} className="relative overflow-hidden rounded-xl" style={{ background: "var(--bp-surface)" }}>
                      {cover ? (
                        <img src={cover} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                      ) : (
                        <div className="aspect-[4/3] w-full" style={{ background: "var(--bp-accent-soft)" }} />
                      )}
                      <div className="px-4 py-3">
                        <p className="break-words text-[14px] font-semibold">{item.title}</p>
                        {item.summary ? (
                          <p className="mt-1 line-clamp-2 break-words text-[12px]" style={{ color: "var(--bp-muted)" }}>
                            {item.summary}
                          </p>
                        ) : null}
                      </div>
                      {editing ? <RemoveChip label={tt("移除")} onClick={() => onShowcaseRemove?.(item.id)} /> : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyLine text={tt("还没有作品。从「我的库」挑进来。")} />
            )}
            {editing ? (
              <button
                type="button"
                data-bay-import-work
                disabled={showcaseBusy}
                onClick={() => onShowcaseImport?.()}
                className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-4 text-[13px] font-medium ${MOTION} hover:opacity-80 disabled:opacity-40`}
                style={{ borderColor: "var(--bp-border)", color: "var(--bp-muted)" }}
              >
                {showcaseBusy ? tt("正在导入…") : tt("从我的库导入")}
              </button>
            ) : null}
          </div>
        </div>
      );
    }

    case "reviews":
      return (
        <div>
          <BlockTitle block={block} editing={editing} onBlock={onBlock} fallback={tt("买家评价")} />
          <div className="mt-4">
            <LightCard>
              {profile.handle ? (
                <div className="mb-3">
                  <ReputationGrid handle={profile.handle} />
                </div>
              ) : null}
              <ReviewList reviews={reviews} empty={tt("暂无评价")} />
            </LightCard>
          </div>
        </div>
      );

    case "contact":
      return (
        <div className={compact ? "overflow-hidden rounded-xl px-5 py-8 text-center" : "overflow-hidden rounded-xl px-5 py-8 text-center sm:px-8 sm:py-10"} style={{ background: "var(--bp-accent)", color: "var(--bp-accent-ink)" }}>
          <EditableText
            as="h2"
            value={block.title ?? ""}
            editing={editing}
            onChange={(title) => patch({ title })}
            maxLength={200}
            label={tt("版块标题")}
            className={compact ? "text-[20px] font-semibold leading-tight tracking-tight" : "text-[20px] font-semibold leading-tight tracking-tight sm:text-[24px]"}
          />
          <div className="mx-auto mt-3 max-w-xl">
            <EditableText
              value={block.body ?? ""}
              editing={editing}
              onChange={(body) => patch({ body })}
              maxLength={600}
              multiline
              label={tt("正文")}
              className="text-[15px] leading-relaxed opacity-90"
            />
          </div>
          <div className="mt-6 flex justify-center">
            {editing ? (
              <span className="inline-flex rounded-lg bg-white px-4 py-2 text-[14px] font-medium text-stone-900">
                <EditableText
                  as="span"
                  value={block.cta_label ?? ""}
                  editing
                  onChange={(cta_label) => patch({ cta_label })}
                  maxLength={40}
                  label={tt("按钮文字")}
                  className="w-28 text-center text-[15px] font-semibold"
                />
              </span>
            ) : (
              <button
                type="button"
                onClick={onTalk}
                disabled={!onTalk}
                data-bay-page-cta
                className={`rounded-lg bg-white px-4 py-2 text-[14px] font-medium text-stone-900 ${MOTION} hover:opacity-90 disabled:cursor-default`}
              >
                {block.cta_label || tt("先聊聊")}
              </button>
            )}
          </div>
        </div>
      );

    case "quote":
      return (
        <figure className={compact ? "border-l-4 py-2 pl-5" : "border-l-4 py-2 pl-5 sm:pl-8"} style={{ borderColor: "var(--bp-accent)" }}>
          <blockquote>
            <EditableText
              value={block.body ?? ""}
              editing={editing}
              onChange={(body) => patch({ body })}
              maxLength={600}
              multiline
              label={tt("引言")}
              className={compact ? "text-[24px] font-semibold leading-snug tracking-tight" : "text-[24px] font-semibold leading-snug tracking-tight sm:text-[32px]"}
            />
          </blockquote>
          {block.by || editing ? (
            <figcaption className="mt-3">
              <EditableText
                as="span"
                value={block.by ?? ""}
                editing={editing}
                onChange={(by) => patch({ by })}
                maxLength={120}
                label={tt("这句话是谁说的")}
                className="text-[14px]"
                style={{ color: "var(--bp-muted)" }}
              />
            </figcaption>
          ) : null}
        </figure>
      );

    case "links": {
      const links = block.links ?? [];
      return (
        <div>
          <BlockTitle block={block} editing={editing} onBlock={onBlock} fallback="" />
          <ul className="mt-4 flex flex-wrap gap-2.5">
            {links.map((link, index) => (
              <li key={`${link.url}-${index}`} className="flex items-center gap-1">
                {editing ? (
                  <span className="inline-flex items-center gap-2 rounded-full border px-4 py-2.5" style={{ borderColor: "var(--bp-border)" }}>
                    <EditableText
                      as="span"
                      value={link.label}
                      editing
                      onChange={(label) => patch({ links: links.map((row, at) => (at === index ? { ...row, label } : row)) })}
                      maxLength={80}
                      label={tt("链接文字")}
                      className="w-32 text-[14px] font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => patch({ links: links.filter((_, at) => at !== index) })}
                      className={`rounded-full px-2 py-1.5 text-[12px] ${MOTION} hover:opacity-60`}
                      style={{ color: "var(--bp-muted)" }}
                    >
                      {tt("移除")}
                    </button>
                  </span>
                ) : (
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow ugc"
                    className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-[14px] font-medium ${MOTION} hover:opacity-70`}
                    style={{ borderColor: "var(--bp-border)" }}
                  >
                    {link.label || link.url.replace(/^https:\/\//, "")}
                    <span aria-hidden>↗</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
          {editing && links.length < 24 ? <ImageUrlAdder label={tt("链接地址")} onAdd={(url) => patch({ links: [...links, { url, label: url.replace(/^https:\/\//, "").slice(0, 40) }] })} /> : null}
        </div>
      );
    }

    default:
      return null;
  }
}

function OfficialBadge() {
  const tt = useUI();
  return (
    <span
      data-bay-official
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: "var(--bp-accent)", color: "var(--bp-accent-ink)" }}
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3.5 8.5l3 3 6-7" />
      </svg>
      {tt("官方")}
    </span>
  );
}

export function ProfilePage(props: ProfilePageProps) {
  const tt = useUI();
  const { page, doc, editing = false, compact = false, renderBlockChrome, actions, onBrowseMaterials, identity, onIdentity, unpublished } = props;
  const editingIdentity = props.editingIdentity ?? editing;
  const profile = page.profile as BayProfilePage["profile"] & { official?: boolean };
  const handle = identity?.handle ?? profile.handle ?? "";
  const displayName = identity?.display_name ?? profile.display_name ?? "";
  const avatarUrl = identity ? identity.avatar_url : profile.avatar_url || "";
  const skills = identity?.skills ?? profile.skills ?? [];
  const languages = identity?.languages ?? profile.languages ?? [];
  const name = profileDisplayName({ ...profile, display_name: displayName, handle });
  const theme = doc.theme;
  const coverImage = theme.cover_style === "image" ? safePageUrl(theme.cover_url) : "";
  const showCover = theme.cover_style !== "none";
  const categories = (profile.categories || []).slice(0, 10);
  const showTags = editingIdentity || categories.length > 0 || skills.length > 0 || languages.length > 0;

  return (
    <article
      data-bay-pane="profile"
      data-bay-page-tone={theme.tone}
      data-bay-page-editing={editing ? "true" : undefined}
      data-bay-page-compact={compact ? "true" : undefined}
      className="min-h-full"
      style={{ ...(pageThemeVars(theme) as CSSProperties), background: "var(--bp-bg)", color: "var(--bp-fg)", fontFamily: "var(--bp-font)" }}
    >
      {showCover ? (
        <div
          data-bay-page-cover={coverImage ? "image" : "gradient"}
          className={compact ? "h-32 w-full" : "h-36 w-full sm:h-48"}
          style={
            coverImage
              ? { backgroundImage: `url("${coverImage.replace(/["\\\n]/g, "")}")`, backgroundSize: "cover", backgroundPosition: "center" }
              : { backgroundImage: coverGradient(theme) }
          }
        />
      ) : null}

      <div className={compact ? "mx-auto w-full px-5 pb-12" : "mx-auto w-full max-w-5xl px-5 pb-16 sm:px-8"}>
        {unpublished ? (
          <p data-bay-page-unpublished className="pt-5 text-[13px] leading-5" style={{ color: "var(--bp-muted)" }}>
            {tt("这张主页现在只有你自己看得到。公开之后别人才能访问，发布东西时也会自动公开。")}
          </p>
        ) : null}
        <header className={`relative flex flex-wrap items-end justify-between gap-4 ${showCover ? compact ? "-mt-8" : "-mt-8 sm:-mt-10" : "pt-8"}`} data-bay-page-identity>
          <div className="flex min-w-0 items-end gap-4">
            <span className="shrink-0 rounded-full p-1 shadow-md" style={{ background: "var(--bp-bg)" }}>
              {editingIdentity ? (
                <BayCoverDrop url={avatarUrl} onUrl={(url) => onIdentity?.({ avatar_url: url })} variant="avatar" />
              ) : (
                <Avatar url={avatarUrl} name={name} size="lg" />
              )}
            </span>
            <div className="min-w-0 pb-1">
              <p className="flex flex-wrap items-center gap-2">
                {editingIdentity ? (
                  <span data-bay-field="display_name" className="min-w-0">
                    <EditableText
                      as="span"
                      value={displayName}
                      editing
                      onChange={(value) => onIdentity?.({ display_name: value })}
                      maxLength={80}
                      label={tt("显示名")}
                      className="break-words text-[22px] font-bold leading-tight tracking-tight sm:text-[26px]"
                    />
                  </span>
                ) : (
                  <span data-bay-profile-name className="break-words text-[22px] font-bold leading-tight tracking-tight sm:text-[26px]">
                    {name}
                  </span>
                )}
                {profile.official ? <OfficialBadge /> : null}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]" style={{ color: "var(--bp-muted)" }}>
                {editingIdentity ? (
                  <span className="inline-flex min-w-0 items-baseline gap-0.5" data-bay-field="handle">
                    <span aria-hidden>@</span>
                    <EditableText
                      as="span"
                      value={handle}
                      editing
                      onChange={(value) => onIdentity?.({ handle: value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })}
                      maxLength={32}
                      label={tt("主页地址")}
                      placeholder=""
                      className="min-w-[8rem] text-[13px]"
                    />
                  </span>
                ) : (
                  <span>@{handle}</span>
                )}
                {profile.official || editing ? null : (
                  <>
                    <span>{ratingShort(tt, profile.rating_avg, profile.rating_count)}</span>
                    <span>{responseTimeText(tt, profile.response_minutes)}</span>
                  </>
                )}
              </p>
            </div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2 pb-1">{actions}</div> : null}
        </header>

        {showTags ? (
          <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[12px]">
            <PracticeLine source={profile} />
            {categories.map((item, index) => (
              <span key={`c-${item}-${index}`} className="rounded-full px-3 py-1 font-medium" style={{ background: "var(--bp-accent-soft)" }}>
                {item}
              </span>
            ))}
            <TagPills
              items={skills}
              editing={editingIdentity}
              field="skills"
              addLabel={tt("技能")}
              tone="accent"
              onChange={(next) => onIdentity?.({ skills: next })}
            />
            <TagPills
              items={languages}
              editing={editingIdentity}
              field="languages"
              addLabel={tt("语言")}
              tone="outline"
              onChange={(next) => onIdentity?.({ languages: next })}
            />
          </div>
        ) : null}

        {onBrowseMaterials ? (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl px-4 py-4" style={{ background: "var(--bp-surface)" }} data-bay-page-materials>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold tracking-tight">{tt("官方现成文件")}</p>
              <p className="mt-1 text-[13px]" style={{ color: "var(--bp-muted)" }}>
                {tt("图片、模板、视频、音乐、3D……由 OceanLeo 官方发布，拿去直接用。")}
              </p>
            </div>
            <AccentButton label={tt("逛官方现成文件")} onClick={onBrowseMaterials} />
          </div>
        ) : null}

        <div className={compact ? "mt-8 space-y-10" : "mt-8 space-y-10 sm:mt-10 sm:space-y-12"} data-bay-page-blocks>
          {doc.blocks.map((block, index) => {
            if (!editing) {
              if (block.type === "services" && !page.services.length) return null;
              if (block.type === "showcase" && !page.showcase.length) return null;
              if (block.type === "reviews" && !page.reviews.length) return null;
              if (block.type === "gallery" && !block.images?.length) return null;
              if (block.type === "links" && !block.links?.length) return null;
            }
            const body = (
              <section key={block.id} data-bay-page-block={block.type}>
                <BlockBody block={block} props={props} />
              </section>
            );
            return renderBlockChrome ? <div key={block.id}>{renderBlockChrome(block, index, body)}</div> : body;
          })}
        </div>
      </div>
    </article>
  );
}

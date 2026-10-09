"use client";

// LeoBay 个人主页：封面 + 身份 + 一叠「版块」。版面来自一份 JSON（`page_doc`），颜色与字体由主题决定。
// 同一个组件既是别人看到的主页，也是本人编辑时的画布（`editing`）：编辑时文字原地可改，每个版块多出一条操作条。
// 自动列出的三种版块（我的发布 / 作品集 / 评价）放在白底卡里，所以深色主题下也看得清。

import type { CSSProperties, ReactNode } from "react";

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
import { openBay } from "../shell/bay-state";
import { ratingShort, responseTimeText, safeHttpUrl } from "../supply/format";
import { Avatar, PracticeLine, ReputationGrid, ReviewList } from "../supply/parts";
import { ServiceCard } from "../supply/ServiceCard";
import { EditableText } from "./EditableText";

const MOTION = "transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]";

export interface ProfilePageProps {
  page: BayProfilePage;
  doc: BayPageDoc;
  /** 本人在编辑：文字可改，版块带操作条。 */
  editing?: boolean;
  onBlock?: (id: string, patch: Partial<BayPageBlock>) => void;
  /** 编辑时包在每个版块外面的操作条（上移 / 下移 / 删除 / 在下面加）。 */
  renderBlockChrome?: (block: BayPageBlock, index: number, children: ReactNode) => ReactNode;
  /** 身份区右侧的操作（先聊聊 / 收藏 / 编辑主页…）。 */
  actions?: ReactNode;
  /** 「先聊聊」按钮按下：版块里的按钮与身份区的按钮走同一个动作。本人看自己的主页时不传。 */
  onTalk?: () => void;
  /** 官方账号主页上的「逛官方素材」。 */
  onBrowseMaterials?: () => void;
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

/** 白底卡：里面放共用的服务卡、评价列表（它们只有浅色一套）。 */
function LightCard({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-stone-200 bg-white p-3 text-stone-900 sm:p-4">{children}</div>;
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
  const { page, editing = false, onBlock, onTalk } = props;
  const { profile, services, showcase, reviews } = page;
  const patch = (next: Partial<BayPageBlock>) => onBlock?.(block.id, next);

  switch (block.type) {
    case "hero":
      return (
        <div className="py-4 sm:py-8">
          <EditableText
            as="h2"
            value={block.title ?? ""}
            editing={editing}
            onChange={(title) => patch({ title })}
            maxLength={200}
            label={tt("大标题")}
            className="text-[22px] font-semibold leading-tight tracking-tight sm:text-[28px]"
          />
          <div className="mt-4 max-w-2xl">
            <EditableText
              value={block.subtitle ?? ""}
              editing={editing}
              onChange={(subtitle) => patch({ subtitle })}
              maxLength={400}
              multiline
              label={tt("副标题")}
              className="text-[17px] leading-relaxed sm:text-[19px]"
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
            <div className="mt-4 columns-2 gap-3 sm:columns-3" data-bay-page-gallery>
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
              <EmptyLine text={tt("还没有图片。在下面粘贴图片地址（https:// 开头）。")} />
            </div>
          ) : null}
          {editing && images.length < 24 ? <ImageUrlAdder label={tt("图片地址")} onAdd={(url) => patch({ images: [...images, { url, caption: "" }] })} /> : null}
        </div>
      );
    }

    case "stats": {
      const items = block.items ?? [];
      return (
        <div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-bay-page-stats>
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
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-bay-profile-services>
                  {services.map((service) => (
                    <ServiceCard key={service.id} item={asFeedItem(service, profile)} variant="card" onOpen={() => openBay({ kind: "service", id: service.id })} />
                  ))}
                </div>
              </LightCard>
            ) : (
              <EmptyLine text={tt("还没有上架的商品或服务。")} />
            )}
          </div>
        </div>
      );

    case "showcase": {
      const { portfolio, verified } = splitShowcase(showcase);
      const items = [...portfolio, ...verified];
      return (
        <div>
          <BlockTitle block={block} editing={editing} onBlock={onBlock} fallback={tt("作品集")} />
          <div className="mt-4">
            {items.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => {
                  const cover = safeHttpUrl(item.cover_url);
                  return (
                    <article key={item.id} data-bay-showcase className="overflow-hidden rounded-xl" style={{ background: "var(--bp-surface)" }}>
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
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyLine text={tt("还没有作品。在设置的 LeoBay 里从「我的库」挑作品放进来。")} />
            )}
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
        <div className="overflow-hidden rounded-xl px-5 py-8 text-center sm:px-8 sm:py-10" style={{ background: "var(--bp-accent)", color: "var(--bp-accent-ink)" }}>
          <EditableText
            as="h2"
            value={block.title ?? ""}
            editing={editing}
            onChange={(title) => patch({ title })}
            maxLength={200}
            label={tt("版块标题")}
            className="text-[17px] font-semibold leading-tight tracking-tight sm:text-[20px]"
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
        <figure className="border-l-4 py-2 pl-5 sm:pl-8" style={{ borderColor: "var(--bp-accent)" }}>
          <blockquote>
            <EditableText
              value={block.body ?? ""}
              editing={editing}
              onChange={(body) => patch({ body })}
              maxLength={600}
              multiline
              label={tt("引言")}
              className="text-[24px] font-semibold leading-snug tracking-tight sm:text-[32px]"
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
  const { page, doc, editing = false, renderBlockChrome, actions, onBrowseMaterials } = props;
  const profile = page.profile as BayProfilePage["profile"] & { official?: boolean };
  const name = profileDisplayName(profile);
  const theme = doc.theme;
  const coverImage = theme.cover_style === "image" ? safePageUrl(theme.cover_url) : "";
  const showCover = theme.cover_style !== "none";
  const tags = [...(profile.categories || []), ...(profile.skills || [])].slice(0, 10);

  return (
    <article
      data-bay-pane="profile"
      data-bay-page-tone={theme.tone}
      data-bay-page-editing={editing ? "true" : undefined}
      className="min-h-full"
      style={{ ...(pageThemeVars(theme) as CSSProperties), background: "var(--bp-bg)", color: "var(--bp-fg)", fontFamily: "var(--bp-font)" }}
    >
      {showCover ? (
        <div
          data-bay-page-cover={coverImage ? "image" : "gradient"}
          className="h-40 w-full sm:h-56"
          style={
            coverImage
              ? { backgroundImage: `url("${coverImage.replace(/["\\\n]/g, "")}")`, backgroundSize: "cover", backgroundPosition: "center" }
              : { backgroundImage: coverGradient(theme) }
          }
        />
      ) : null}

      <div className="mx-auto w-full max-w-5xl px-5 pb-16 sm:px-8">
        <header className={`flex flex-wrap items-end justify-between gap-4 ${showCover ? "-mt-10 sm:-mt-12" : "pt-8"}`} data-bay-page-identity>
          <div className="flex min-w-0 items-end gap-4">
            <span className="shrink-0 rounded-full p-1 shadow-md" style={{ background: "var(--bp-bg)" }}>
              <Avatar url={profile.avatar_url} name={name} size="lg" />
            </span>
            <div className="min-w-0 pb-1">
              <p className="flex flex-wrap items-center gap-2">
                <span data-bay-profile-name className="break-words text-[22px] font-bold leading-tight tracking-tight sm:text-[26px]">
                  {name}
                </span>
                {profile.official ? <OfficialBadge /> : null}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]" style={{ color: "var(--bp-muted)" }}>
                <span>@{profile.handle}</span>
                {profile.official ? null : (
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

        {tags.length || (profile.languages || []).length ? (
          <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[12px]">
            <PracticeLine source={profile} />
            {tags.map((item, index) => (
              <span key={`${item}-${index}`} className="rounded-full px-3 py-1 font-medium" style={{ background: "var(--bp-accent-soft)" }}>
                {item}
              </span>
            ))}
            {(profile.languages || []).map((item) => (
              <span key={`l-${item}`} className="rounded-full border px-3 py-1" style={{ borderColor: "var(--bp-border)", color: "var(--bp-muted)" }}>
                {item}
              </span>
            ))}
          </div>
        ) : null}

        {onBrowseMaterials ? (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl px-4 py-4" style={{ background: "var(--bp-surface)" }} data-bay-page-materials>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold tracking-tight">{tt("官方素材")}</p>
              <p className="mt-1 text-[13px]" style={{ color: "var(--bp-muted)" }}>
                {tt("图片、模板、视频、音乐、3D……全部免费，拿去直接用。")}
              </p>
            </div>
            <AccentButton label={tt("逛官方素材")} onClick={onBrowseMaterials} />
          </div>
        ) : null}

        <div className="mt-8 space-y-12 sm:mt-10 sm:space-y-16" data-bay-page-blocks>
          {doc.blocks.map((block, index) => {
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

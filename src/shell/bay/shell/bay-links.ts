// Bay 深链与跨站地址（oceanleo-bay 契约 §5）。纯函数：不碰 window，不 import 鉴权，测试直接加载。
//
// `?bay=<kind>[:<参数>]`：feed、demand:<id>、service:<id>、help:<id>、consult:<id>、profile:<handle>、
// order:<id>、conversation:<threadId>、post-need[:<category>]、call-human[:<category>]、propose:<demandId>、
// checkout:<serviceId>[:<tier>]、service-editor[:<id>]、mine:<tab>、settings[:<pane>]。认不出的值一律当没有。
import type { UITranslate } from "../../../i18n/ui/useUI";
import type { BayMineTab, BayTarget } from "./bay-state";

export const BAY_PARAM = "bay";
export const BAY_MINE_TABS: readonly BayMineTab[] = ["needs", "proposals", "services", "orders", "help"];
export const BAY_SETTINGS_PANES: readonly ("profile" | "vetting" | "money")[] = ["profile", "vetting", "money"];
export const BAY_FEED_KINDS: readonly ("all" | "demand" | "service" | "help" | "consult")[] = [
  "all",
  "demand",
  "service",
  "help",
  "consult",
];

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const HANDLE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;
const SLUG = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const TIER = /^[a-z0-9][a-z0-9_-]{0,23}$/;
const SITE_KEY = /^[a-z0-9][a-z0-9-]{1,23}$/;
const MAX_PARAM = 200;

/** 站 key 与子域标签不同的三处（门户 `lib/sites.tsx` 的 `subsite` 字段）。 */
const SUBSITE_LABEL: Readonly<Record<string, string>> = {
  ecommerce: "e-commerce",
  ppt: "slide",
  threed: "3d",
};

/**
 * 站 key → 产品名（门户 `lib/sites.tsx` 的 `name`），产品名不翻译。覆盖 Bay 的全部站：35 个子站 + 门户。
 * 只有 aitools 在门户里叫「AI 工具导航」，不是品牌名，界面里经 `tt` 显示。
 */
const SITE_NAMES: Readonly<Record<string, string>> = {
  agent: "LeoAgent",
  website: "Website",
  prompt: "LeoPrompt",
  ecommerce: "LeoStudio",
  ppt: "LeoSlides",
  excel: "LeoSheet",
  word: "LeoDoc",
  converter: "LeoConvert",
  aihuman: "LeoHuman",
  image: "LeoImage",
  video: "LeoVideo",
  resume: "LeoResume",
  bizdev: "LeoBizDev",
  logo: "LeoLogo",
  interior: "LeoInterior",
  chat: "LeoChat",
  threed: "Leo3D",
  music: "LeoMusic",
  meeting: "LeoMeeting",
  paper: "LeoPaper",
  notebook: "LeoNote",
  law: "LeoLaw",
  study: "LeoStudy",
  edu: "LeoEdu",
  novel: "LeoNovel",
  script: "LeoScript",
  design: "LeoDesign",
  make: "LeoMake",
  search: "LeoSearch",
  finance: "LeoFinance",
  med: "LeoMed",
  travel: "LeoTravel",
  game: "LeoPlay",
  aitools: "AI 工具导航",
  asset: "LeoAsset",
  oceanleo: "OceanLeo",
};

/** 站 key → 产品名（`ppt` → LeoSlides）；未知 key 返回 null。传了 `tt` 时 aitools 按界面语言显示。 */
export function baySiteName(siteKey: string | null | undefined, tt?: UITranslate): string | null {
  const key = typeof siteKey === "string" ? siteKey.trim().toLowerCase() : "";
  if (!key || !Object.prototype.hasOwnProperty.call(SITE_NAMES, key)) return null;
  if (key === "aitools" && tt) return tt("AI 工具导航");
  return SITE_NAMES[key];
}

export function isBayCategorySlug(value: unknown): value is string {
  return typeof value === "string" && SLUG.test(value);
}

export function isBaySiteKey(value: unknown): value is string {
  return typeof value === "string" && SITE_KEY.test(value);
}

/** `?bay=` 的值 → 目标；非法返回 null。 */
export function parseBayParam(raw: string | null | undefined): BayTarget | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text || text.length > MAX_PARAM) return null;
  const at = text.indexOf(":");
  const kind = at < 0 ? text : text.slice(0, at);
  const rest = at < 0 ? null : text.slice(at + 1);
  switch (kind) {
    case "feed":
      return rest === null ? { kind: "feed" } : null;
    case "demand":
    case "service":
    case "help":
    case "consult":
    case "order":
      return rest !== null && ID.test(rest) ? { kind, id: rest } : null;
    case "profile":
      return rest !== null && HANDLE.test(rest) ? { kind: "profile", handle: rest } : null;
    case "conversation":
      return rest !== null && ID.test(rest) ? { kind: "conversation", threadId: rest } : null;
    case "post-need":
    case "call-human":
      if (rest === null) return { kind };
      return SLUG.test(rest) ? { kind, category: rest } : null;
    case "propose":
      return rest !== null && ID.test(rest) ? { kind: "propose", demandId: rest } : null;
    case "checkout": {
      if (rest === null) return null;
      const parts = rest.split(":");
      if (parts.length > 2 || !ID.test(parts[0])) return null;
      if (parts.length === 1) return { kind: "checkout", serviceId: parts[0] };
      return TIER.test(parts[1]) ? { kind: "checkout", serviceId: parts[0], tier: parts[1] } : null;
    }
    case "service-editor":
      if (rest === null) return { kind: "service-editor" };
      return ID.test(rest) ? { kind: "service-editor", serviceId: rest } : null;
    case "mine": {
      const tab = BAY_MINE_TABS.find((value) => value === rest);
      return tab ? { kind: "mine", tab } : null;
    }
    case "settings": {
      if (rest === null) return { kind: "settings" };
      const pane = BAY_SETTINGS_PANES.find((value) => value === rest);
      return pane ? { kind: "settings", pane } : null;
    }
    default:
      return null;
  }
}

/** 目标 → `?bay=` 的值（`parseBayParam` 的逆）。 */
export function formatBayParam(target: BayTarget): string {
  switch (target.kind) {
    case "feed":
      return "feed";
    case "demand":
    case "service":
    case "help":
    case "consult":
    case "order":
      return `${target.kind}:${target.id}`;
    case "profile":
      return `profile:${target.handle}`;
    case "conversation":
      return `conversation:${target.threadId}`;
    case "post-need":
    case "call-human":
      return target.category ? `${target.kind}:${target.category}` : target.kind;
    case "propose":
      return `propose:${target.demandId}`;
    case "checkout":
      return target.tier ? `checkout:${target.serviceId}:${target.tier}` : `checkout:${target.serviceId}`;
    case "service-editor":
      return target.serviceId ? `service-editor:${target.serviceId}` : "service-editor";
    case "mine":
      return `mine:${target.tab}`;
    case "settings":
      return target.pane ? `settings:${target.pane}` : "settings";
  }
}

/** 查询串里的 `?bay=` → 目标；没有或非法 → null。 */
export function parseBayDeepLink(search: string | null | undefined): BayTarget | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search || "");
  } catch {
    return null;
  }
  return parseBayParam(params.get(BAY_PARAM));
}

function encodeParam(target: BayTarget): string {
  return encodeURIComponent(formatBayParam(target)).replace(/%3A/gi, ":");
}

/** 把目标写进（拷贝出来的）查询串；`null` 或信息流首页 → 去掉 `bay`。其余参数原样保留。 */
export function buildBaySearch(currentSearch: string | null | undefined, target: BayTarget | null): string {
  const params = new URLSearchParams(currentSearch || "");
  params.delete(BAY_PARAM);
  const rest = params.toString();
  const tail = target && target.kind !== "feed" ? `${BAY_PARAM}=${encodeParam(target)}` : "";
  const text = [rest, tail].filter(Boolean).join("&");
  return text ? `?${text}` : "";
}

/** 当前路径是不是某个站的 `/bay` 页（允许语种前缀与结尾斜杠）。 */
export function isBayPath(pathname: string | null | undefined): boolean {
  return /(^|\/)bay\/?$/.test(pathname || "");
}

/** 站 key → 子域标签；不合法的 key 返回 null。门户（oceanleo）也返回 null。 */
export function baySubsiteLabel(siteKey: string | null | undefined): string | null {
  const key = (siteKey || "").trim().toLowerCase();
  if (!key || key === "oceanleo" || !SITE_KEY.test(key)) return null;
  return SUBSITE_LABEL[key] ?? key;
}

function stripOriginSlash(origin: string): string {
  return origin.replace(/\/+$/, "");
}

/**
 * 某站 `/bay?bay=…` 的绝对地址。`subsiteOrigin` 给当前家族里那个子站的 origin（家族里没有就是 undefined），
 * 拿不到子站时落到同家族门户的 `/bay`，不跨家族拼地址。
 *
 * `stayOnOrigin`：LeoDev 槽把跨站「去某站处理」钉在当前页 origin，不再拼正式子站。
 * 只由 `bayHrefOnSite` 在确认宿主是 `p-<32hex>.dev.oceanleo.com` 之后传入。
 */
export function bayHrefWith(
  siteKey: string,
  target: BayTarget,
  origins: {
    portalOrigin: string;
    subsiteOrigin: (label: string) => string | undefined;
    stayOnOrigin?: string | null;
  },
): string {
  const stay = typeof origins.stayOnOrigin === "string" ? stripOriginSlash(origins.stayOnOrigin.trim()) : "";
  let origin = origins.portalOrigin;
  if (stay) {
    origin = stay;
  } else {
    const label = baySubsiteLabel(siteKey);
    if (label) {
      try {
        origin = origins.subsiteOrigin(label) || origins.portalOrigin;
      } catch {
        origin = origins.portalOrigin;
      }
    }
  }
  return `${stripOriginSlash(origin)}/bay${buildBaySearch("", target.kind === "feed" ? null : target) || `?${BAY_PARAM}=feed`}`;
}

export function sameBayTarget(a: BayTarget, b: BayTarget): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "feed" && b.kind === "feed") {
    const fa = a.filter ?? {};
    const fb = b.filter ?? {};
    return (fa.kind ?? "all") === (fb.kind ?? "all") && (fa.category ?? "") === (fb.category ?? "") && (fa.q ?? "") === (fb.q ?? "");
  }
  return formatBayParam(a) === formatBayParam(b);
}

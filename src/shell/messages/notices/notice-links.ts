// 平台通知（user_notifications）里那条链接，点开后落在哪里。纯函数：不碰 window、不 import 鉴权，测试直接加载。
//
// 原则（操作员：境内外 LeoChat 完全一样）：分类只看链接本身，不看域名家族、不看 LeoBay 在不在本站；
// 「本站不让做」由执行层（open-notice.ts）决定，这里只回答「这条链接指向什么」。
//
// 落点：
//   - conversation  LeoChat 会话：`/leochat?im=<会话>`、`?c=<会话>`、`/bay?bay=conversation:<交易会话>`（= `talent:<id>`）
//   - cases         内容处置：通知 kind 为 moderation，或链接是 `/account/content-cases`、`/settings/content-cases`、`?im=cases[:<id>]`
//   - view          LeoChat 自己的栏目：`/leochat`、`?im=inbox|people|notices`
//   - bay           LeoBay 里的某一处：`/bay?bay=order:<id>` 等
//   - internal      本站其余页面（`/history?task=…`、`/projects/…`）：站内跳转
//   - external      别的站：新窗口打开
//   - none          没有链接，或链接不是 http(s) / 站内路径（fail closed）
import { familyForHost } from "../../../contracts/domain-family";
import { isBayPath, parseBayParam, BAY_PARAM } from "../../bay/shell/bay-links";
import type { BayTarget } from "../../bay/shell/bay-state";
import { parseCallDeepLink } from "../call/incoming/deep-link";
import { isCaseId, parseImDeepLink } from "../host-state";

export type NoticeTarget =
  | { kind: "none" }
  | { kind: "conversation"; conversationId: string; seq?: number }
  | { kind: "cases"; caseId?: string }
  | { kind: "view"; view: "inbox" | "people" | "notices" }
  | { kind: "bay"; target: BayTarget }
  | { kind: "internal"; href: string }
  | { kind: "external"; href: string };

export interface NoticeLinkInput {
  /** 通知的 kind（`moderation`、`talent.order.new`……）。 */
  kind?: string | null;
  link?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface NoticeLinkContext {
  /** 当前页面的 host（含端口，即 `location.host`）。给了才会把绝对地址里的同源链接当站内。 */
  pageHost?: string | null;
}

const MAX_LINK = 2048;
const CASES_PATH = /^\/(?:account|settings)\/content-cases(?:\/([^/]+))?\/?$/;
const LEOCHAT_PATH = /(^|\/)leochat\/?$/;
/** 服务端 `notify(kind="moderation")`；以后若分出子类（`moderation.counter`）也算。 */
const MODERATION_KIND = /^moderation(\.|$)/i;

export function isModerationKind(kind: unknown): boolean {
  return typeof kind === "string" && MODERATION_KIND.test(kind.trim());
}

interface ParsedLink {
  /** 相对路径，或与当前页面同一个 host。 */
  sameOrigin: boolean;
  /** 同一个域名家族（oceanleo.com / .cn / oceanbizs.com）的任何主机，含另一个家族的门户。 */
  ours: boolean;
  path: string;
  params: URLSearchParams;
  search: string;
  /** `路径 + 查询串 + #锚点`，站内跳转用。 */
  href: string;
  /** 规整后的完整地址；只有绝对地址（别的主机）才用它新窗口打开。 */
  absolute: string;
}

function parseLink(raw: unknown, ctx: NoticeLinkContext): ParsedLink | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text || text.length > MAX_LINK) return null;
  let url: URL;
  let relative = false;
  try {
    if (text.startsWith("/") && !text.startsWith("//")) {
      relative = true;
      url = new URL(text, "https://notice.invalid");
    } else if (/^https?:\/\//i.test(text)) {
      url = new URL(text);
      // 带账号密码的地址是钓鱼写法；协议相对（//host）与 javascript:/data: 等一概不认。
      if (url.username || url.password) return null;
    } else {
      return null;
    }
  } catch {
    return null;
  }
  const pageHost = (ctx.pageHost || "").trim().toLowerCase();
  const sameOrigin = relative || (pageHost !== "" && url.host.toLowerCase() === pageHost);
  const ours = sameOrigin || familyForHost(url.hostname) !== undefined;
  return {
    sameOrigin,
    ours,
    path: url.pathname,
    params: url.searchParams,
    search: url.search,
    href: `${url.pathname}${url.search}${url.hash}`,
    absolute: url.href,
  };
}

function caseIdFromMeta(meta: NoticeLinkInput["meta"]): string | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const raw = meta.case_id ?? meta.caseId;
  return isCaseId(raw) ? raw : undefined;
}

/** 本站（任一家族）链接里指向 LeoChat / 内容处置 / LeoBay 的那几种；认不出返回 null。 */
function classifyOurs(link: ParsedLink): NoticeTarget | null {
  // 内容处置的旧地址：账户页、设置页。案件 id 可跟在路径后，也可在 ?case=。
  const cases = CASES_PATH.exec(link.path);
  if (cases) {
    const fromPath = cases[1] ? decodeSegment(cases[1]) : undefined;
    const fromQuery = link.params.get("case") ?? undefined;
    const caseId = [fromPath, fromQuery].find((value) => isCaseId(value));
    return caseId ? { kind: "cases", caseId } : { kind: "cases" };
  }

  // `?im=…`：任何路径上都算（LeoChat 小窗本来就能在任何页面上被深链打开）。邀请码要走宿主的深链流程，交给整页跳转。
  const im = parseImDeepLink(link.search);
  if (im.kind === "open") {
    if (im.inviteCode) return null;
    const { target } = im;
    if (target.conversationId) {
      return typeof target.seq === "number"
        ? { kind: "conversation", conversationId: target.conversationId, seq: target.seq }
        : { kind: "conversation", conversationId: target.conversationId };
    }
    if (target.view === "cases") {
      return target.caseId ? { kind: "cases", caseId: target.caseId } : { kind: "cases" };
    }
    if (target.view === "notices" || target.view === "people" || target.view === "inbox") {
      return { kind: "view", view: target.view };
    }
  }

  if (LEOCHAT_PATH.test(link.path)) {
    // 通话推送 `?c=<会话>&call=<通话>`：带通话的要让整页去核实来电，不在这里拆。
    const call = parseCallDeepLink(link.search);
    if (call) return call.callId ? null : { kind: "conversation", conversationId: call.conversationId };
    return { kind: "view", view: "inbox" };
  }

  const bay = parseBayParam(link.params.get(BAY_PARAM));
  if (bay) {
    if (bay.kind === "conversation") return { kind: "conversation", conversationId: `talent:${bay.threadId}` };
    return { kind: "bay", target: bay };
  }
  // 光一个 `/bay`（没有任何参数）= LeoBay 首页。带了认不出的参数就交给页面自己读。
  if (isBayPath(link.path) && link.search === "") return { kind: "bay", target: { kind: "feed" } };
  return null;
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** 一条通知点开后该去哪。 */
export function classifyNoticeLink(input: NoticeLinkInput, ctx: NoticeLinkContext = {}): NoticeTarget {
  const link = parseLink(input.link, ctx);
  const local = link && link.ours ? classifyOurs(link) : null;

  // 内容处置通知：不管链接写的是什么旧地址，都落在 LeoChat 的内容处置视图；案件 id 以链接里的为先，其次 meta。
  if (isModerationKind(input.kind)) {
    const caseId = (local?.kind === "cases" ? local.caseId : undefined) ?? caseIdFromMeta(input.meta);
    return caseId ? { kind: "cases", caseId } : { kind: "cases" };
  }

  if (!link) return { kind: "none" };
  if (local) return local;
  // 走到 external 的一定是 http(s) 绝对地址（相对路径都是 sameOrigin）。
  return link.sameOrigin ? { kind: "internal", href: link.href } : { kind: "external", href: link.absolute };
}

/**
 * 点这条通知除了标已读还会去某处（决定行尾要不要画箭头）。
 * LeoBay 的落点在本站没有 LeoBay（境内）时不跳，所以也不画箭头——`bayAvailable` 由调用方带进来。
 */
export function noticeIsActionable(target: NoticeTarget, bayAvailable: boolean): boolean {
  if (target.kind === "none") return false;
  if (target.kind === "bay") return bayAvailable;
  return true;
}

// OceanLeo 域名家族 —— 一套代码同时服务 oceanleo.com 与 oceanleo.cn 的唯一事实源。
//
// ---------------------------------------------------------------------------
// 为什么是「家族」而不是「一个可变的域名常量」
// ---------------------------------------------------------------------------
// 本文件取代了此前散在包里的写死判定 `host === "oceanleo.com" ||
// host.endsWith(".oceanleo.com")`。把那个字面量改成一个可配置变量是**错的**：
// 变量意味着「同一次判定可能给出任一答案」，于是「.com 的会话能不能落到 .cn」
// 这个问题就没有静态答案了。这里改成一张写死的表：
//
//   * 每个家族有且只有一个可注册域（eTLD+1），它是该家族共享会话的信任边界；
//   * 判定入口 familyForHost() 把 host 映射到**至多一个**家族，映射不上就是
//     undefined（host-only / 不可信），没有任何回落分支；
//   * 家族之间没有任何一条读写通路 —— 所有取值都是「先定家族，再在**那一行**里取」。
//
// 因此「在 .com 登录的身份在 .cn 上生效」这件事在实现层面无法表达，
// 而不是靠某处判断挡住。tests/auth-session-model.test.mjs 锁死这条性质。
//
// ---------------------------------------------------------------------------
// 用户内容域为什么单列
// ---------------------------------------------------------------------------
// oceanleo.app（海外）与 leoapp.cn（境内）托管用户生成的站点/游戏/预览，
// 上面跑的是不可信代码。它们是**独立的可注册域**，所以 familyForHost() 天然
// 就返回 undefined；但这里仍然把它们显式列出来，让授信面能再挡一道：
// 一道是「不属于任何家族」，一道是「明确属于用户内容域」。删掉任何一道都不行 ——
// 会话 cookie 不是 HttpOnly（见 lib/auth/config.ts 顶部 SESSION MODEL），
// 把用户内容域纳入共享域等于把全家桶身份直接交给不可信页面。
//
// 本模块零运行时依赖：iframe 渲染面与安全判定面都要能引它。

export type DomainFamily = "com" | "cn";

export interface DomainFamilyProfile {
  family: DomainFamily;
  /** 共享会话的唯一可注册域（eTLD+1）。信任边界，不是可调参数。 */
  registrableDomain: string;
  /** 跨子站 cookie 的 Domain 属性值（带前导点）。 */
  cookieDomain: string;
  /** 门户 origin。 */
  portalOrigin: string;
  /** API 网关 origin。 */
  gatewayOrigin: string;
  /** 素材直链 origin。 */
  assetOrigin: string;
  /** 本家族的用户生成内容域。永远不属于本家族，永远不可信。 */
  untrustedContentDomain: string;
  /**
   * 本家族**确实存在**的子站（子域标签 / 站 key）。
   *
   * `"all"` = 该家族是产品全集（海外版就是全集，所以它的解析结果与本轮改动前
   * 逐字相同）。数组 = 显式清单，**不在清单里就是不存在**。
   *
   * 这是 fail closed 的那一侧：不在清单里的子站既拿不到链接，也拿不到内嵌编辑器
   * 白名单。某个子站境内上线，必须**显式**把它的标签加进这里才会出现 —— 不会
   * 因为「忘了配」而自动指回海外站，把境内用户送出境。
   */
  availableSubsites: "all" | readonly string[];
}

/**
 * 家族表。**写死是刻意的**：新增一个家族要改这里、要过 UC-7 用例、要过
 * scripts/oceanleo-security-gate.sh，不能靠一条环境变量长出来。
 */
const FAMILIES: Readonly<Record<DomainFamily, DomainFamilyProfile>> = {
  com: {
    family: "com",
    registrableDomain: "oceanleo.com",
    cookieDomain: ".oceanleo.com",
    portalOrigin: "https://oceanleo.com",
    gatewayOrigin: "https://api.oceanleo.com",
    assetOrigin: "https://asset.oceanleo.com",
    untrustedContentDomain: "oceanleo.app",
    // 海外版是产品全集：35 个子站都在，链接与内嵌白名单与改动前逐字相同。
    availableSubsites: "all",
  },
  cn: {
    family: "cn",
    registrableDomain: "oceanleo.cn",
    cookieDomain: ".oceanleo.cn",
    portalOrigin: "https://oceanleo.cn",
    gatewayOrigin: "https://api.oceanleo.cn",
    assetOrigin: "https://asset.oceanleo.cn",
    untrustedContentDomain: "leoapp.cn",
    // 境内子站清单。**这张表的每一行都必须对应广州机上一个真在跑的容器**：
    // 它同时驱动子站链接和内嵌编辑器白名单，填一个没部署的站等于给用户一个
    // 打不开的链接，并给一个不存在的主机发第一方信任。
    //
    // 唯一事实源是 oceandino 的 `scripts/oceanleo-cn-sites.tsv`（cn_status=live
    // 的行），由 `scripts/tests/test_oceanleo_cn_registry.py` 逐字比对本数组 ——
    // 手改这里而不改清册，或反过来，门禁都会红。新站上线的顺序永远是
    // 「先部署 → 实测 200 → 再改清册 → 再改这里」，不能反过来。
    availableSubsites: [
      "3d",
      "agent",
      "aihuman",
      "aitools",
      "asset",
      "bizdev",
      "chat",
      "converter",
      "design",
      "e-commerce",
      "edu",
      "excel",
      "finance",
      "game",
      "image",
      "interior",
      "law",
      "logo",
      "make",
      "med",
      "meeting",
      "music",
      "notebook",
      "novel",
      "paper",
      "prompt",
      "resume",
      "script",
      "search",
      "slide",
      "study",
      "travel",
      "video",
      "website",
      "word",
    ],
  },
};

export const DOMAIN_FAMILIES = Object.keys(FAMILIES) as readonly DomainFamily[];

/**
 * 每个家族的可注册域。给**必须内联进 HTML 的脚本**用（`<ThemeScript>` 在首帧
 * 同步执行，引不了运行时模块），其余地方一律走 `familyForHost()`，
 * 不要拿这张表在别处再手写一遍后缀判定。
 */
export const REGISTRABLE_DOMAINS: readonly string[] = Object.freeze(
  (Object.keys(FAMILIES) as DomainFamily[]).map(
    (family) => FAMILIES[family].registrableDomain,
  ),
);

/**
 * 缺省家族。海外版是既有行为，境内版是新增行为，所以缺省必须是 `com`：
 * 认不出来的 host（localhost、*.vercel.app、预览域）解析结果与本轮改动前逐字相同。
 */
export const DEFAULT_DOMAIN_FAMILY: DomainFamily = "com";

/**
 * 所有家族的可注册域。给「要对**每个**家族都成立」的判定用 —— 典型是不可信集合：
 * 预览/沙箱子域这类标记要在两族同时生效，`.com` 页面也得挡住 `.cn` 的预览主机。
 * 想要「当前家族的那一个」时用 `currentDomainProfile().registrableDomain`，
 * 别拿这张表在别处手写后缀判定。
 */
export function registrableDomainsOfAllFamilies(): readonly string[] {
  return REGISTRABLE_DOMAINS;
}

/**
 * 用户生成内容的独立可注册域，**两个家族的都在这里**。
 * 与家族无关：`.com` 页面要挡 `leoapp.cn`，`.cn` 页面要挡 `oceanleo.app`，
 * 任何一侧漏掉都是把不可信页面当第一方。
 */
export const UNTRUSTED_CONTENT_DOMAINS: readonly string[] = Object.freeze([
  FAMILIES.com.untrustedContentDomain,
  FAMILIES.cn.untrustedContentDomain,
]);

/** `Host:` 头 / `location.host` → 可比较的裸主机名。端口、大小写、末尾点都去掉。 */
export function normalizeHost(host: string | null | undefined): string {
  return String(host || "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .split("/")[0]
    .split(":")[0]
    .replace(/\.$/, "");
}

/**
 * host 是否落在某个可注册域下。
 *
 * 判定是「等于该域，或以 `.该域` 结尾」。**不能用裸 endsWith(domain)** ——
 * 那会把 `notoceanleo.com`、`evil-oceanleo.cn` 这类不同可注册域算成自己人；
 * 也不能用 includes —— 那会把 `oceanleo.cn.evil.com` 算进来。
 */
function isUnderRegistrableDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * host 属于哪个家族。认不出来给 `undefined`（= host-only / 不可信），
 * 这是 fail closed 的那一侧，调用方不得自己补一个「那就当 .com 吧」的回落。
 *
 * 用户内容域（oceanleo.app / leoapp.cn）是独立可注册域，这里天然给 undefined。
 */
export function familyForHost(
  host: string | null | undefined,
): DomainFamily | undefined {
  const h = normalizeHost(host);
  if (!h) return undefined;
  for (const family of DOMAIN_FAMILIES) {
    if (isUnderRegistrableDomain(h, FAMILIES[family].registrableDomain)) {
      return family;
    }
  }
  return undefined;
}

/** 家族档案。`undefined` 给缺省家族（`com`），供「必须给出一个值」的取值点用。 */
export function domainFamilyProfile(
  family: DomainFamily | undefined,
): DomainFamilyProfile {
  return FAMILIES[family ?? DEFAULT_DOMAIN_FAMILY];
}

/** host 所属家族的档案；认不出来的 host 给缺省家族。 */
export function domainProfileForHost(
  host: string | null | undefined,
): DomainFamilyProfile {
  return domainFamilyProfile(familyForHost(host));
}

/**
 * 跨子站 cookie 的 Domain 属性值；host 不属于任何家族时 `undefined`（host-only）。
 *
 * 给**非会话** cookie 用（主题、语言）：它们要跟着家族走同一条边界，但没有
 * 会话 cookie 那层 env 覆盖。会话 cookie 走 lib/auth/config.ts 的
 * `cookieDomainFor()`，那里多一道 env 同族校验 —— 别把两者混用。
 */
export function sharedCookieDomainFor(
  host: string | null | undefined,
): string | undefined {
  const family = familyForHost(host);
  return family ? FAMILIES[family].cookieDomain : undefined;
}

/** host 是否是用户生成内容域（任一家族的）。fail closed：解析不了也算是。 */
export function isUntrustedContentDomainHost(
  host: string | null | undefined,
): boolean {
  const h = normalizeHost(host);
  if (!h) return true;
  return UNTRUSTED_CONTENT_DOMAINS.some((domain) =>
    isUnderRegistrableDomain(h, domain),
  );
}

/**
 * `host` 是否是 `family` 的第一方主机。
 *
 * 两个条件同时成立才算：属于该家族、且不是任何家族的用户内容域。
 * 家族不匹配一律 false —— **`.com` 页面不信 `.cn` 主机，`.cn` 页面不信 `.com` 主机**。
 * 这不是洁癖：境内页面去嵌一个 `.com` 主机就是把境内用户的请求送出境。
 */
export function isFirstPartyHostOf(
  host: string | null | undefined,
  family: DomainFamily | undefined,
): boolean {
  const h = normalizeHost(host);
  if (!h) return false;
  if (isUntrustedContentDomainHost(h)) return false;
  return familyForHost(h) === (family ?? DEFAULT_DOMAIN_FAMILY);
}

// ---------------------------------------------------------------------------
// 当前家族
// ---------------------------------------------------------------------------
// 取值顺序刻意是「env 优先、再看浏览器 host」：
//   * env 让 SSR 与客户端在同一次渲染里得到同一个答案（境内部署自己会设它）；
//   * 浏览器 host 是没设 env 时的兜底，也是「代码被部署到意料之外的域名上」时
//     唯一还能自证的信号；
//   * 两者都给不出答案时用缺省家族 `com` = 今天的行为。
// env 只接受表里已有的家族名，写错就当没写（fail closed 到缺省），
// 不接受任意域名字符串 —— 家族是表里的一行，不是一个可拼出来的字符串。

const FAMILY_ENV = (process.env.NEXT_PUBLIC_OCEANLEO_DOMAIN_FAMILY || "")
  .trim()
  .toLowerCase();

export const CONFIGURED_DOMAIN_FAMILY: DomainFamily | undefined =
  (DOMAIN_FAMILIES as readonly string[]).includes(FAMILY_ENV)
    ? (FAMILY_ENV as DomainFamily)
    : undefined;

/** 当前页面所属家族。认不出来时是缺省家族（`com`）。 */
export function currentDomainFamily(): DomainFamily {
  if (CONFIGURED_DOMAIN_FAMILY) return CONFIGURED_DOMAIN_FAMILY;
  if (typeof window !== "undefined" && window.location) {
    const fromHost = familyForHost(window.location.host);
    if (fromHost) return fromHost;
  }
  return DEFAULT_DOMAIN_FAMILY;
}

/** 当前家族的档案。运行时 URL（网关、素材、门户链接）从这里取。 */
export function currentDomainProfile(): DomainFamilyProfile {
  return domainFamilyProfile(currentDomainFamily());
}

/**
 * `family` 里是否**确实存在** `subsite` 这个子站。
 *
 * 缺省是「不存在」：清单里没有就是没有。调用方不得在拿到 false 之后回落到别的
 * 家族的同名子站 —— 那正是「境内点一下就被送出境」的那条路。
 */
export function familyHasSubsite(
  family: DomainFamily | undefined,
  subsite: string,
): boolean {
  const { availableSubsites } = domainFamilyProfile(family);
  if (availableSubsites === "all") return true;
  return availableSubsites.includes(subsite);
}

/** 当前家族里是否存在该子站。 */
export function currentFamilyHasSubsite(subsite: string): boolean {
  return familyHasSubsite(currentDomainFamily(), subsite);
}

/**
 * 当前家族里该子站的 origin；该家族没有这个子站时 `undefined`。
 * 拿到 `undefined` 的正确处理是「不给链接」，不是「换个家族再拼一个」。
 */
export function currentFamilySubsiteOrigin(
  subsite: string,
): string | undefined {
  if (!currentFamilyHasSubsite(subsite)) return undefined;
  return `https://${subsite}.${currentDomainProfile().registrableDomain}`;
}

/** 当前家族下的第一方判定。授信面用这一个，不要各自再写 host 判断。 */
export function isCurrentFamilyFirstPartyHost(
  host: string | null | undefined,
): boolean {
  return isFirstPartyHostOf(host, currentDomainFamily());
}

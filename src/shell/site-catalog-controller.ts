import type { OceanLeoWorkspaceRouteContract } from "../contracts/site-manifest";
import { GATEWAY_BASE } from "../lib/auth/config";
import {
  appTemplates,
  representativeFill,
  representativePrompt,
  type GoalApp,
  type TemplateMaterial,
} from "./app-catalog";
import { libraryKindForArtifactType, type LibraryKind } from "./library-data";
import {
  CATALOG_APP_QUERY_KEY,
  LIBRARY_ITEM_QUERY_KEY,
  LIBRARY_MODE_PREVIEW_VALUE,
  LIBRARY_MODE_QUERY_KEY,
  LIBRARY_TAB_QUERY_KEY,
  catalogQueryAppId,
  historySessionHref,
  historySessionIdFromPath,
  isLibraryDeepLinkSearch,
  legacyWorkspaceAppId,
  workspaceAppHref,
  workspaceAppIdFromPath,
} from "./workspace-route";
import {
  normalizeWorkspaceAction,
  type WorkspaceActionV1,
} from "./workspace-actions";

const DEFAULT_ROUTE: OceanLeoWorkspaceRouteContract = {
  canonicalBasePath: "/workspace",
  historyBasePath: "/history",
  legacyQueryKeys: ["fn", "mode"],
};

export interface SiteCatalogRouteInput {
  pathname: string;
  search?: string;
  controlledValue?: string;
  embed?: boolean;
  solo?: boolean;
  historyAppId?: string;
  aliases?: Readonly<Record<string, string>>;
  knownAppIds: ReadonlySet<string>;
  route?: OceanLeoWorkspaceRouteContract;
}

export interface SiteCatalogRouteState {
  pathAppId: string;
  historySessionId: string;
  /** `?app=<appId>`：库深链的 app 锚点（合同 §3.1）。 */
  queryAppId: string;
  legacyAppId: string;
  requestedAppId: string;
  activeAppId: string;
  invalidAppId: string;
}

function activeRoute(
  route?: OceanLeoWorkspaceRouteContract,
): OceanLeoWorkspaceRouteContract {
  return route || DEFAULT_ROUTE;
}

export function resolveSiteCatalogRoute(
  input: SiteCatalogRouteInput,
): SiteCatalogRouteState {
  const route = activeRoute(input.route);
  const pathAppId = workspaceAppIdFromPath(input.pathname, route);
  const historySessionId = historySessionIdFromPath(input.pathname, route);
  // 库深链（`/workspace?tab=library&item=…&mode=preview&app=<id>`）把 app 放在 `?app=`，
  // 路径段是空的。不读它就只剩 `mode=preview` 能被当成 app id——那正是 V5 判定书 §2 那条
  // 「这个 App 不存在或已下线 / preview」的来源。优先级排在路径段之后、legacy 之前。
  const queryAppId = pathAppId ? "" : catalogQueryAppId(input.search || "");
  const legacyAppId = pathAppId
    ? ""
    : legacyWorkspaceAppId(input.search || "", route);
  const raw = String(
    input.historyAppId ||
      pathAppId ||
      queryAppId ||
      legacyAppId ||
      ((input.embed || input.solo) ? input.controlledValue : "") ||
      "",
  ).trim();
  const requestedAppId =
    input.historyAppId === "home-agent"
      ? "agent"
      : (!input.historyAppId && input.aliases?.[raw]) || raw;
  const invalidAppId =
    requestedAppId && !input.knownAppIds.has(requestedAppId)
      ? requestedAppId
      : "";
  return {
    pathAppId,
    historySessionId,
    queryAppId,
    legacyAppId,
    requestedAppId,
    activeAppId: invalidAppId ? "" : requestedAppId,
    invalidAppId,
  };
}

export function canonicalCatalogAppHref(
  appId: string,
  search = "",
  preserveQuery = false,
  route?: OceanLeoWorkspaceRouteContract,
): string {
  const contract = activeRoute(route);
  const base = workspaceAppHref(appId, contract);
  if (!preserveQuery) return base;
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  // 库深链的 `mode=preview` **必须活过规范化**：它是「只读预览」这个意图本身，被当成
  // legacy 键删掉的话，重定向到 `/workspace/<id>` 之后预览页会退化成普通库视图。
  const keepPreviewMode =
    isLibraryDeepLinkSearch(params) &&
    params.get(LIBRARY_MODE_QUERY_KEY) === LIBRARY_MODE_PREVIEW_VALUE;
  for (const key of contract.legacyQueryKeys) {
    if (keepPreviewMode && key === LIBRARY_MODE_QUERY_KEY) continue;
    params.delete(key);
  }
  // app 已经进了路径段，query 里那份是同义重复，留着只会让两处真相有机会漂移。
  if (params.get(CATALOG_APP_QUERY_KEY) === appId) {
    params.delete(CATALOG_APP_QUERY_KEY);
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function catalogCanonicalRedirect(
  state: SiteCatalogRouteState,
  pathname: string,
  search = "",
  embed = false,
  route?: OceanLeoWorkspaceRouteContract,
): string | null {
  const contract = activeRoute(route);
  const workspaceIndex =
    pathname.replace(/\/+$/, "") ===
    contract.canonicalBasePath.replace(/\/+$/, "");
  if (
    embed ||
    state.historySessionId ||
    (state.pathAppId && state.pathAppId === state.activeAppId) ||
    !state.activeAppId ||
    (!state.pathAppId && !workspaceIndex)
  ) {
    return null;
  }
  return canonicalCatalogAppHref(
    state.activeAppId,
    search,
    true,
    contract,
  );
}

export type SiteCatalogNavigation =
  | { kind: "host"; appId: string }
  | { kind: "route"; appId: string; href: string };

export function catalogNavigationForChange(
  appId: string,
  options: {
    embed?: boolean;
    historySessionId?: string;
    route?: OceanLeoWorkspaceRouteContract;
  } = {},
): SiteCatalogNavigation {
  if (options.embed) return { kind: "host", appId };
  if (options.historySessionId && !appId) {
    return {
      kind: "route",
      appId,
      href: historySessionHref("", activeRoute(options.route)),
    };
  }
  return {
    kind: "route",
    appId,
    href: workspaceAppHref(appId, activeRoute(options.route)),
  };
}

// ── 操作台填充总线：显式就绪信号 + 一次性待填 ────────────────────────────────
// 深链 `?fill=preset` 直落一个 app 时，one-shot 填充很可能跑在左栏填充器注册【之前】
// （`GuideProvider` 是填充器的父节点，父 effect 后于子 effect）。这里不赌时序：
// 填充器注册是**显式就绪事件**，注册前到达的 one-shot 排队、注册当下立即执行；切 app
// （scope 变化）时排队请求与上一个 app 的填充器一起被丢弃，绝不串到下一个 app。
// 状态机放在这个 framework-free 模块里，`guide-context.tsx` 只做 React 绑定并转出
// 同名类型——这样时序行为可以被 node --test 直接覆盖。

/** 左栏填充器：把模板内容灌进当前功能的左栏输入框与备注板块。 */
export type OpsFiller = (
  text: string,
  opts?: {
    imageUrl?: string;
    /** 升级版 prompt（宗旨 v15）：一并 patch 进左栏操作台的其它参数（ratio/style/…）。 */
    set?: Record<string, unknown>;
    /** 保存模板时独立持久化的操作员备注。 */
    remark?: string;
    data?: unknown;
  },
) => void;

/** 一次性填充请求；`scope` = 发起时的 app id，scope 不匹配即丢弃。 */
export interface OneShotFillRequest {
  scope: string;
  text: string;
  opts?: Parameters<OpsFiller>[1];
}

export interface OpsFillBus {
  /** 当前 app scope；切 app 时由 Provider 在 render 阶段推进。 */
  scope(): string;
  setScope(next: string): void;
  /** 注册 / 注销左栏填充器；注册即就绪，并立刻冲刷同 scope 的待填。 */
  register(filler: OpsFiller | null): void;
  ready(): boolean;
  /** 显式就绪订阅（useSyncExternalStore 用）。 */
  subscribe(listener: () => void): () => void;
  /** 排入一次性填充；返回 true 表示已当场填入，false 表示排队或被丢弃。 */
  request(request: OneShotFillRequest): boolean;
  /** 普通（用户点击）填充：只在当前 scope 的填充器上生效。 */
  fill(text: string, opts?: Parameters<OpsFiller>[1]): boolean;
}

export function createOpsFillBus(): OpsFillBus {
  let scope = "";
  let filler: OpsFiller | null = null;
  let fillerScope = "";
  let pending: OneShotFillRequest | null = null;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  const readyNow = () => Boolean(filler) && fillerScope === scope;

  return {
    scope: () => scope,
    setScope(next) {
      const value = String(next ?? "");
      if (value === scope) return;
      scope = value;
      filler = null;
      fillerScope = "";
      pending = null;
      notify();
    },
    register(next) {
      if (!next) {
        if (!filler) return;
        filler = null;
        fillerScope = "";
        notify();
        return;
      }
      filler = next;
      fillerScope = scope;
      const queued = pending;
      if (queued && queued.scope === scope) {
        pending = null;
        next(queued.text, queued.opts);
      }
      notify();
    },
    ready: readyNow,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    request(request) {
      const text = String(request?.text ?? "");
      if (!text.trim()) return false;
      if (String(request?.scope ?? "") !== scope) return false;
      if (readyNow() && filler) {
        pending = null;
        filler(text, request.opts);
        return true;
      }
      pending = { scope, text, opts: request.opts };
      return false;
    },
    fill(text, opts) {
      if (!readyNow() || !filler) return false;
      filler(text, opts);
      return true;
    },
  };
}

// ── 深链意图：`?fill=preset` 与 `?open=advanced` ──────────────────────────────
// 两者都是【一次性入口意图】，不是 app 身份：它们不参与 canonical redirect 的目标
// 计算，`canonicalCatalogAppHref(..., preserveQuery)` 只删 legacy 的 fn/mode，所以
// 规范化到 `/workspace/<id>` 之后这两个参数原样留在地址栏，由消费端读一次再消费掉。

export const CATALOG_FILL_QUERY_KEY = "fill";
export const CATALOG_OPEN_QUERY_KEY = "open";
/** `?template=<templateId>`：`?open=template` 指名的那一份模板素材。 */
export const CATALOG_TEMPLATE_QUERY_KEY = "template";
/** `?fill=preset`：把代表 prompt + `preset.set` 灌进操作台一次。 */
export const CATALOG_FILL_PRESET_VALUE = "preset";
/** `?open=advanced`：右栏直接进入该 app 默认产物类型的进阶编辑器。 */
export const CATALOG_OPEN_ADVANCED_VALUE = "advanced";
/** `?open=template`：右栏直接载入 `?template=` 指名的那一份模板素材。 */
export const CATALOG_OPEN_TEMPLATE_VALUE = "template";

export interface CatalogDeepLinkIntent {
  fillPreset: boolean;
  openAdvanced: boolean;
  /** 模板编辑深链指名的模板 id；空串 = 没有这个意图。 */
  openTemplateId: string;
}

export const EMPTY_CATALOG_DEEP_LINK_INTENT: CatalogDeepLinkIntent = {
  fillPreset: false,
  openAdvanced: false,
  openTemplateId: "",
};

function searchParamsOf(search: string | URLSearchParams): URLSearchParams {
  return search instanceof URLSearchParams
    ? new URLSearchParams(search)
    : new URLSearchParams(String(search || "").replace(/^\?/, ""));
}

/** 只认精确取值；未知取值一律当作没写，绝不猜测。 */
export function resolveCatalogDeepLinkIntent(
  search: string | URLSearchParams,
): CatalogDeepLinkIntent {
  const params = searchParamsOf(search);
  const open = (params.get(CATALOG_OPEN_QUERY_KEY) || "").trim();
  // `open=template` 缺 `template=` 就不是一个完整意图：宁可什么都不做，也不能退化
  // 成「打开默认产物类型的空编辑器」——那正是本轮要修掉的老行为。
  const templateId =
    open === CATALOG_OPEN_TEMPLATE_VALUE
      ? deepLinkSegment(params.get(CATALOG_TEMPLATE_QUERY_KEY))
      : "";
  return {
    fillPreset:
      (params.get(CATALOG_FILL_QUERY_KEY) || "").trim() ===
      CATALOG_FILL_PRESET_VALUE,
    openAdvanced: open === CATALOG_OPEN_ADVANCED_VALUE,
    openTemplateId: templateId,
  };
}

/** 意图消费后从地址栏抹掉，避免刷新 / 重挂载重复灌入。返回不含 `?` 的 query。 */
export function searchWithoutCatalogDeepLinkIntent(
  search: string | URLSearchParams,
): string {
  const params = searchParamsOf(search);
  params.delete(CATALOG_FILL_QUERY_KEY);
  params.delete(CATALOG_OPEN_QUERY_KEY);
  params.delete(CATALOG_TEMPLATE_QUERY_KEY);
  return params.toString();
}

/** 深链里可以出现的标识符：非空、无控制字符。其余交给 URL 编码。 */
function deepLinkSegment(value: unknown): string {
  if (typeof value !== "string") return "";
  const id = value.trim();
  // eslint-disable-next-line no-control-regex
  if (!id || /[\u0000-\u001f\u007f]/.test(id)) return "";
  return id;
}

function deepLinkAppSegment(appId: unknown): string {
  return deepLinkSegment(appId);
}

/** 合同 §3：「生成类似」——跳到 app 并预填代表 prompt + 整套预置参数。 */
export function workspaceAppFillHref(
  appId: string,
  route?: OceanLeoWorkspaceRouteContract,
): string {
  const contract = activeRoute(route);
  const id = deepLinkAppSegment(appId);
  if (!id) return contract.canonicalBasePath;
  return `${workspaceAppHref(id, contract)}?${CATALOG_FILL_QUERY_KEY}=${CATALOG_FILL_PRESET_VALUE}`;
}

/** 合同 §3：预填之外，右栏直接进入该 app 的进阶编辑器（旧按钮名已废除，见下方 §0.4）。 */
export function workspaceAppAdvancedHref(
  appId: string,
  route?: OceanLeoWorkspaceRouteContract,
): string {
  const contract = activeRoute(route);
  const id = deepLinkAppSegment(appId);
  if (!id) return contract.canonicalBasePath;
  return `${workspaceAppFillHref(id, contract)}&${CATALOG_OPEN_QUERY_KEY}=${CATALOG_OPEN_ADVANCED_VALUE}`;
}

/**
 * 合同 §3：**模板编辑深链**——跳到该 app，并让右栏载入**这一份具体的模板素材**。
 *
 * ⚠ 本轮（合同 §0.4，2026-07-27）大卡片上**已经没有**指向这条链的按钮了：探索面的那颗
 * 按钮改成「预览&编辑」，落点是 `workspaceTemplatePreviewHref()` 的**只读预览页**，
 * 用户在预览页里再点「编辑」才 fork 出独立副本进编辑器。本 helper 因此退居为库/预览页
 * 侧的编辑落点，仍被 `site-catalog-deeplink` 的派发链消费，不能删。
 *
 * 刻意**不带** `?fill=preset`：打开这份成品与「把代表 prompt 灌进操作台」是两件事，
 * 混在一条链接里会让用户进编辑器时输入框莫名其妙被填满。
 *
 * `templateId` 只要求在**同一个 app 内**唯一（`TemplateMaterial.id` 的契约），
 * 所以 appId 必须一起进 URL；缺 app 时退回目录，缺 template 时退回该 app 的
 * canonical 地址，绝不产出半截深链。
 */
export function workspaceTemplateEditHref(
  appId: string,
  templateId: string,
  route?: OceanLeoWorkspaceRouteContract,
): string {
  const contract = activeRoute(route);
  const id = deepLinkAppSegment(appId);
  if (!id) return contract.canonicalBasePath;
  const base = workspaceAppHref(id, contract);
  const template = deepLinkSegment(templateId);
  if (!template) return base;
  const query = new URLSearchParams({
    [CATALOG_OPEN_QUERY_KEY]: CATALOG_OPEN_TEMPLATE_VALUE,
    [CATALOG_TEMPLATE_QUERY_KEY]: template,
  });
  return `${base}?${query.toString()}`;
}

// ── 「预览&编辑」与「更多」两条落点（合同 §0.4 / §3.1，2026-07-27）─────────────
// 操作员原话（2026-07-27）：大卡片上那颗旧的模板编辑按钮（旧名已废弃，全站不再出现）
// 改名为「预览&编辑」，「点击后不跳到编辑页面，而是跳到库中的预览页面，防止用户在探索时
// 误入重型功能」；另加一颗「更多」，「点击后进入各个网站的探索页面」。两条 query 的形状由
// 合同 §3.1 锁死：W4 的库预览页与 W5 的探索页分别按这两个形状解析参数，
// **任何一方改形状必须先改合同**。

// 这五个 query 常量与 `CATALOG_APP_QUERY_KEY` 的**定义**在 `./workspace-route`：路由解析
// 必须认它们，而本模块已经 import 那个模块，反向 import 会成环。此处原样 re-export，
// `src/shell/index.ts`（W1）的导出面与消费端 import 路径都不变。
export {
  CATALOG_APP_QUERY_KEY,
  LIBRARY_ITEM_QUERY_KEY,
  LIBRARY_MODE_PREVIEW_VALUE,
  LIBRARY_MODE_QUERY_KEY,
  LIBRARY_TAB_QUERY_KEY,
  LIBRARY_TAB_VALUE,
  catalogQueryAppId,
  isLibraryDeepLinkSearch,
} from "./workspace-route";

/** 探索页默认路径。locale 前缀站请传自己的 `basePath`。 */
export const EXPLORE_BASE_PATH = "/explore";

// ── 「预览&编辑」深链缺 app 锚点时的可见降级（V5 残余 R-3）────────────────────
// `?app=` 看着像可选装饰，其实是**承重**的：库预览面板挂在 app 操作台的右栏里
// （`OperatorConsole` → `ResultCanvas` → `MyLibrary`）。没有 app 时 `OperatorConsole`
// 渲染的是**目录页**，右栏整块根本不挂载，`useLibraryEditIntent` 也就没有任何实例在听。
// 所以一条不带 `app=` 的 `mode=preview` 链接**结构上无处落地**：它看起来像预览链接，
// 点进去却静静地什么都不发生。
//
// 这正是本工程反复栽的那类缺陷（law 白屏被 Suspense 藏住、i18n 静默回退中文、
// 缺 siteId 却照样显示「本站素材」）。处理原则定为**两侧都不许静默**：
//   - 生产侧（本 helper）：**不产出**注定落不了地的链接，并告警；
//   - 消费侧（`useCatalogDeepLink`）：遇到这种链接不假装接上，明确告警。
// 「照样派发出去」被明确否决：总线上没有任何接收者，那会变成「看起来接上了、其实掉进
// 真空」——比现在更难查。

const warnedPreviewAnchors = new Set<string>();

/** 一条降级一行 console（沿用 `material-library-scope` 的做法：看得见，但不刷屏）。 */
export function warnPreviewDeepLinkWithoutApp(
  context: string,
  artifactId: string,
): void {
  const key = `${context}\u0000${artifactId}`;
  if (warnedPreviewAnchors.has(key)) return;
  warnedPreviewAnchors.add(key);
  if (typeof console === "undefined") return;
  console.warn(
    `[catalog-deeplink] 「预览&编辑」深链缺少 ?${CATALOG_APP_QUERY_KEY}= 锚点` +
      `（item=${artifactId}，来自 ${context}）：库预览面板只存在于 app 操作台的右栏里，` +
      "没有 app 时右栏不挂载，这条链接无处落地。" +
      "请改用 workspaceTemplatePreviewHref(appId, artifactId) 生成带锚点的链接。",
  );
}

/**
 * 官方模板素材的库预览落点栏位（接口 A）。
 *
 * 与 `LIBRARY_TAB_VALUE`（= `library`，`mine` 的别名）并存而不是取代它：本 helper 产出的
 * 是**官方模板素材**的链接，那些素材属于平台、永远不在「我的库」里，落 `mine` 必然是
 * 一个空面板；而用户自有 artifact 的预览链接仍旧写 `library`，语义与旧链接逐字一致。
 * 归属分流的解析侧在 `library-edit-intent.ts` 的 `libraryPreviewSurfaceForTab`。
 */
export const LIBRARY_TAB_MATERIALS_VALUE = "materials";

/**
 * 接口 A：「预览&编辑」落点 =
 * `/workspace?tab=materials&item=<artifactId>&mode=preview&app=<appId>`
 *
 * 入参是 **artifactId**（不是 `TemplateMaterial.id`）：库按 artifact 取数，而 template id
 * 只保证同 app 内唯一，拿它去库里定位会撞车。
 *
 * 两个入参**都是必需**的，缺哪个都不产出半截深链：
 *   - 缺 artifact → 退回该 app 的 canonical 地址（再缺 app 才退回目录）；
 *   - 缺 app     → 退回目录并告警（见上方注释：没有 app 锚点的预览链接落不了地）。
 */
export function workspaceTemplatePreviewHref(
  appId: string,
  artifactId: string,
  route?: OceanLeoWorkspaceRouteContract,
): string {
  const contract = activeRoute(route);
  const id = deepLinkAppSegment(appId);
  const artifact = deepLinkSegment(artifactId);
  if (!artifact) return id ? workspaceAppHref(id, contract) : contract.canonicalBasePath;
  if (!id) {
    warnPreviewDeepLinkWithoutApp("workspaceTemplatePreviewHref", artifact);
    return contract.canonicalBasePath;
  }
  const query = new URLSearchParams();
  query.set(LIBRARY_TAB_QUERY_KEY, LIBRARY_TAB_MATERIALS_VALUE);
  query.set(LIBRARY_ITEM_QUERY_KEY, artifact);
  query.set(LIBRARY_MODE_QUERY_KEY, LIBRARY_MODE_PREVIEW_VALUE);
  query.set(CATALOG_APP_QUERY_KEY, id);
  return `${contract.canonicalBasePath}?${query.toString()}`;
}

/**
 * 合同 §3.1：「更多」落点 = `/explore?app=<appId>`。
 *
 * 探索页据此把「此 app」那一段顶到首屏（合同 §0.6）。appId 为空时退回不带锚点的探索页，
 * 而不是产出 `?app=`：空参数会让 W5 那边多一条「有 app 参数但取不到 app」的分支。
 */
export function exploreAppHref(
  appId: string,
  options?: { basePath?: string },
): string {
  const base = (options?.basePath || EXPLORE_BASE_PATH).replace(/\/+$/, "") || EXPLORE_BASE_PATH;
  const id = deepLinkAppSegment(appId);
  return id ? `${base}?${CATALOG_APP_QUERY_KEY}=${encodeURIComponent(id)}` : base;
}

// ── 「下载」前端链（合同 §3；端点 = W7 的 template_materials_router）───────────
// 端点实况，逐条对着 `oceanleo/backend/app/routers/template_materials_router.py` 抄的
// （父任务 2026-07-26 裁决：W7 的契约不动，前端适配）：
//
//   * 路由前缀 `/v1/template-materials`（L36），**不是** `/v1/library/…`；
//   * 主键是 **`TemplateMaterial.id`**（路径参数 `{template_id}`）。W7 出于安全**明确
//     拒收** artifact id——「唯一能选中内容的入参是不透明的 template_id，这里不得长出
//     任何指名 artifact / revision / project 的参数」（该文件模块 docstring）；
//   * `GET /{template_id}/download` 挂 `Depends(current_user_id)`（L81），**强制登录**，
//     因为 0089 的配额需要一个计费主体。目录读仍匿名可用（`optional_user_id`，L59/L70）。
//
// 强制登录直接推翻了上一轮「`<a download>` 纯导航」的假设：导航发不出 `Authorization`
// 头，必然 401。所以**端点下载一律走 `downloadTemplateMaterial()`**（`template-download.ts`），
// 本 helper 只负责解析出那个 URL。
//
// website 站下载的是**源码包**（操作员定稿 §0.5）：前端不为此分叉，端点按该素材自己的
// download_kind 决定打包形态，这样 34 个站的「下载」永远是同一条调用。

/** W7 的模板素材端点前缀（gateway 相对路径）。下载在 `/{templateId}/download`。 */
export const TEMPLATE_DOWNLOAD_PATH = "/v1/template-materials";

function trustedDownloadUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

/**
 * 合同 §3：「下载」目标 URL 的解析。**不要把返回值直接塞进 `<a download>`。**
 *
 * 两种来源，能不能纯导航是分开的：
 *   * 素材自带稳定公开直链（`downloadUrl`，必须是 `https:`）→ 可以直连，不必过后端；
 *   * 否则是 W7 的端点 URL，**需要 Bearer 头**，纯导航必然 401。
 *
 * 判断用 `isDirectTemplateDownload()`；实际下载一律调 `downloadTemplateMaterial()`。
 * 无法定位素材时返回空串，由 W2 据此隐藏「下载」按钮。
 *
 * 入参给字符串时按 **templateId** 处理（不是 artifact id——W7 拒收 artifact id）。
 */
export function templateDownloadHref(
  template: TemplateMaterial | string | null | undefined,
): string {
  if (typeof template !== "string" && template) {
    const direct = trustedDownloadUrl(template.downloadUrl);
    if (direct) return direct;
  }
  const templateId = deepLinkSegment(
    typeof template === "string" ? template : template?.id,
  );
  if (!templateId) return "";
  return `${GATEWAY_BASE.replace(/\/+$/, "")}${TEMPLATE_DOWNLOAD_PATH}/${encodeURIComponent(
    templateId,
  )}/download`;
}

/**
 * 这份素材的下载是不是一条可以直接导航的公开直链。
 *
 * `false` = 必须走 `downloadTemplateMaterial()` 带凭据取。存在这个判定是因为两条路的
 * 失败方式完全不同：直链失败是 CDN 的事，端点失败要区分 401（未登录）与 429（配额）。
 */
export function isDirectTemplateDownload(
  template: TemplateMaterial | string | null | undefined,
): boolean {
  if (typeof template === "string" || !template) return false;
  return Boolean(trustedDownloadUrl(template.downloadUrl));
}

// ── 代表 prompt 与一次性预填载荷 ─────────────────────────────────────────────
// 合同 §0.9 的取值规则由 W3 的 `app-catalog.ts` 独家持有（`representativePrompt` /
// `representativeFill`）。本层只做 null → "" 的口径适配，绝不复制一份取值逻辑：
// 深链灌进操作台的内容必须与首页卡片「prompt」按钮灌的内容逐字一致。

export function catalogRepresentativePrompt(
  app: GoalApp | null | undefined,
): string {
  return app ? representativePrompt(app) ?? "" : "";
}

export interface CatalogPresetFill {
  prompt: string;
  set?: Record<string, unknown>;
}

export function catalogPresetFill(
  app: GoalApp | null | undefined,
): CatalogPresetFill | null {
  const fill = app ? representativeFill(app) : null;
  if (!fill) return null;
  return Object.keys(fill.set).length > 0
    ? { prompt: fill.prompt, set: fill.set }
    : { prompt: fill.prompt };
}

// ── `?open=advanced`：右栏进入该 app 默认产物类型的进阶编辑器 ─────────────────
// GoalApp 没有声明产物类型，所以按【显式 > app id 词元 > 站点默认】三级解析，解析不出
// 就退化为打开「我的库」并给可见提示——绝不静默无反应，也绝不猜一个错编辑器。

/**
 * 与 `MyLibrary.tsx` 的 `KIND_CATEGORY` 必须逐字一致（那里是我的库分类的产出端，
 * 这里是深链的消费端）。`tests/workspace-fill-deeplink.test.mjs` 直接比对两处源码。
 */
export const CATALOG_LIBRARY_KIND_CATEGORY: Record<LibraryKind, string> = {
  website: "网站",
  canvas: "画布",
  ppt: "PPT",
  sheet: "表格",
  document: "文档",
  image: "图片",
  video: "视频",
  video_canvas: "视频工作流",
  audio: "音频",
  xhs: "小红书",
  threed: "3D",
  file: "文件",
};

const LIBRARY_KIND_ALIASES: Record<string, LibraryKind> = {
  website: "website",
  web: "website",
  site: "website",
  canvas: "canvas",
  design: "canvas",
  workflow: "canvas",
  ppt: "ppt",
  deck: "ppt",
  slide: "ppt",
  slides: "ppt",
  presentation: "ppt",
  sheet: "sheet",
  grid: "sheet",
  excel: "sheet",
  table: "sheet",
  spreadsheet: "sheet",
  document: "document",
  doc: "document",
  docx: "document",
  richdoc: "document",
  word: "document",
  text: "document",
  image: "image",
  single_file_image: "image",
  photo: "image",
  picture: "image",
  poster: "image",
  video: "video",
  video_canvas: "video_canvas",
  audio: "audio",
  music: "audio",
  voice: "audio",
  sound: "audio",
  xhs: "xhs",
  threed: "threed",
  "3d": "threed",
  model: "threed",
  model_3d: "threed",
  file: "file",
};

const PRESET_KIND_KEYS = [
  "artifactType",
  "artifact_type",
  "productKind",
  "product_kind",
  "outputKind",
  "output_kind",
  "libraryKind",
  "library_kind",
  "kind",
] as const;

/** 站点默认产物类型；含糊的站（chat/search/agent…）刻意不给，走可见的退化提示。 */
const SITE_DEFAULT_KIND: Record<string, LibraryKind> = {
  website: "website",
  design: "canvas",
  image: "image",
  logo: "image",
  interior: "image",
  video: "video",
  music: "audio",
  threed: "threed",
  ppt: "ppt",
  excel: "sheet",
  word: "document",
  paper: "document",
  resume: "document",
  novel: "document",
  script: "document",
};

function libraryKindFromToken(value: unknown): LibraryKind | null {
  const token = String(value || "").trim().toLowerCase();
  return token ? LIBRARY_KIND_ALIASES[token] || null : null;
}

function libraryKindFromAppId(appId: string): LibraryKind | null {
  const tokens = String(appId || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const matched = new Set<LibraryKind>();
  for (const token of tokens) {
    const kind = LIBRARY_KIND_ALIASES[token];
    if (kind) matched.add(kind);
  }
  // 词元互相矛盾（如 `video-poster`）时不赌，交给站点默认。
  return matched.size === 1 ? [...matched][0] : null;
}

/** 该 app 的默认产物类型；无法确定返回 null。 */
export function catalogAppProductKind(
  app: GoalApp | null | undefined,
  siteKey = "",
): LibraryKind | null {
  const set = app?.preset?.set;
  if (set) {
    for (const key of PRESET_KIND_KEYS) {
      const kind = libraryKindFromToken(set[key]);
      if (kind) return kind;
    }
  }
  const fromId = libraryKindFromAppId(app?.id || "");
  if (fromId) return fromId;
  return SITE_DEFAULT_KIND[String(siteKey || "").trim().toLowerCase()] || null;
}

/** 一条深链要派给右栏的计划。`?open=advanced` 与 `?open=template` 共用这个形状。 */
export interface CatalogRightPanePlan {
  /** 已通过 `normalizeWorkspaceAction` 的 v1 envelope 载荷（字段长度必然合规）。 */
  action: WorkspaceActionV1;
  degraded: boolean;
  /** 退化时给用户的可见提示；正常路径为空串。 */
  notice: string;
}

export interface CatalogAdvancedOpenPlan extends CatalogRightPanePlan {
  /** 解析出的默认产物类型；null = 退化。 */
  kind: LibraryKind | null;
}

export interface CatalogTemplateOpenPlan extends CatalogRightPanePlan {
  /** 命中的那一份模板素材；null = 该 app 下没有这个 templateId。 */
  template: TemplateMaterial | null;
}

/**
 * `?open=advanced` → 右栏派发计划。有默认产物类型就把「我的库」收窄到该类型（选中
 * 即进进阶编辑器，`openAdvancedOnSelect` 默认 true）；没有就只打开「我的库」并提示。
 */
export function catalogAdvancedOpenPlan(
  app: GoalApp | null | undefined,
  siteKey = "",
): CatalogAdvancedOpenPlan {
  const kind = catalogAppProductKind(app, siteKey);
  const category = kind ? CATALOG_LIBRARY_KIND_CATEGORY[kind] : "";
  const action: WorkspaceActionV1 = normalizeWorkspaceAction({
    version: 1,
    tab: "mine",
    ...(category ? { category } : {}),
  }) || { version: 1, tab: "mine" };
  return {
    kind,
    action,
    degraded: !kind,
    notice: kind
      ? ""
      : "这个 App 还没有声明可直接编辑的产物类型，已为你打开「我的库」——选中任意作品即可进入编辑器。",
  };
}

/**
 * `?open=template&template=<id>` → 右栏派发计划（合同 §0.3 的模板编辑深链）。
 *
 * 与 `catalogAdvancedOpenPlan` 的区别就是本轮要补的那个洞：advanced 只知道「该 app 的
 * 默认产物类型」，所以 envelope 里没有 `itemId`，右栏只能打开「我的库」等用户自己挑；
 * 这里已经由大卡片指名了一份具体素材，envelope 带上它的 **artifact id** 与
 * `intent: "edit"`，消费端据此直接把这一份交给 typed 编辑器。
 *
 * `templateId` 只在 app 内唯一，所以解析必须在 `appTemplates(app)` 里做——它已经剔除
 * 了缺 id/artifactId 的脏条目（W3 契约）。命中不了就退化成 advanced 的老路径（打开
 * 「我的库」+ 可见提示），绝不白屏、不抛错、也不静默无反应。
 */
export function catalogTemplateOpenPlan(
  app: GoalApp | null | undefined,
  templateId: string,
  siteKey = "",
): CatalogTemplateOpenPlan {
  const wanted = deepLinkSegment(templateId);
  // `appTemplates` 的入参是必填 `GoalApp`（W3 契约），null app 会直接抛。本 helper 与
  // `catalogAdvancedOpenPlan` 一样要容忍「app 还没解析出来」，所以在这一侧短路。
  const template =
    (wanted && app
      ? appTemplates(app).find((item) => item.id === wanted)
      : null) || null;
  const degradeToAdvanced = (notice: string): CatalogTemplateOpenPlan => ({
    template: null,
    action: catalogAdvancedOpenPlan(app, siteKey).action,
    degraded: true,
    notice,
  });
  if (!template) {
    return degradeToAdvanced(
      "这份模板素材不存在或已下线，已为你打开「我的库」。",
    );
  }
  const kind = libraryKindForArtifactType(template.artifactType);
  const category = kind ? CATALOG_LIBRARY_KIND_CATEGORY[kind] : "";
  const action = normalizeWorkspaceAction({
    version: 1,
    tab: "mine",
    ...(category ? { category } : {}),
    itemId: template.artifactId,
    intent: "edit",
  });
  // `normalizeWorkspaceAction` 会把超长 itemId 截断到 300 字符。截断后的 id 指向的是
  // 「别的东西或什么都不是」，比打不开更糟，所以只接受原样存活下来的 artifact id。
  if (!action || action.itemId !== template.artifactId) {
    return degradeToAdvanced(
      "这份模板素材的标识不合法，已为你打开「我的库」。",
    );
  }
  return { template, action, degraded: false, notice: "" };
}

import {
  DEFAULT_LOCALE,
  normalizeLocale,
  type Locale,
} from "../../config";
import type {
  UIMessageLoader,
  UIMessageModule,
} from "./runtime";
import { CLOUD_BROWSER_MESSAGES } from "./cloud-browser-copy";

const BASE_MESSAGE_LOADERS = {
  de: () => import("./de"),
  en: () => import("./en"),
  es: () => import("./es"),
  "es-419": () => import("./es-419"),
  fr: () => import("./fr"),
  it: () => import("./it"),
  "pt-BR": () => import("./pt-BR"),
  "pt-PT": () => import("./pt-PT"),
  vi: () => import("./vi"),
  tr: () => import("./tr"),
  zh: async () => ({ default: {} }),
  "zh-TW": () => import("./zh-TW"),
  ja: () => import("./ja"),
  ko: () => import("./ko"),
  ar: () => import("./ar"),
  th: () => import("./th"),
  hi: () => import("./hi"),
} satisfies Record<Locale, () => Promise<UIMessageModule>>;

/**
 * Load only the dictionary selected for this request. The default Chinese UI
 * needs no payload because every call already supplies the Chinese source text
 * as its fallback key.
 */
export const loadUiMessages: UIMessageLoader = async (rawLocale) => {
  const locale = normalizeLocale(rawLocale);
  if (locale === DEFAULT_LOCALE) return {};

  // 这张清单必须与 ./index.ts 的 UI_MESSAGES 逐个分表对齐。两边漂过一次：账号安全
  // 与登录门那两张表只进了 index.ts（测试读的是它，所以全绿），运行时读的是这里，
  // 于是那两屏对 16 个语种全部回退成中文原文，谁也没发现。
  // 2026-09-01 又漂了一次：editor-panels / workbench-office 只进了总表。
  // 2026-09-06 X4：advanced-route 两边同时加。
  const [
    base,
    recent,
    progress,
    share,
    accountSecurity,
    authOauth,
    pluginChrome,
    workbenchOffice,
    editorPanels,
    advancedRoute,
  ] = await Promise.all([
    BASE_MESSAGE_LOADERS[locale](),
    import("./recent-model-and-task-copy"),
    import("./agent-progress-copy"),
    import("./share-copy"),
    import("./account-security-copy"),
    import("./auth-oauth-copy"),
    import("./plugin-chrome-copy"),
    import("./workbench-office-copy"),
    import("./editor-panels-copy"),
    import("./advanced-route-copy"),
  ]);
  return {
    ...base.default,
    ...recent.RECENT_MODEL_AND_TASK_MESSAGES[locale],
    ...progress.AGENT_PROGRESS_MESSAGES[locale],
    ...CLOUD_BROWSER_MESSAGES[locale],
    ...share.SHARE_COPY_MESSAGES[locale],
    ...accountSecurity.ACCOUNT_SECURITY_MESSAGES[locale],
    ...authOauth.AUTH_OAUTH_MESSAGES[locale],
    ...pluginChrome.PLUGIN_CHROME_MESSAGES[locale],
    ...workbenchOffice.WORKBENCH_OFFICE_MESSAGES[locale],
    ...editorPanels.EDITOR_PANELS_MESSAGES[locale],
    ...advancedRoute.ADVANCED_ROUTE_MESSAGES[locale],
  };
};

// 2026-10-06 oceanleo-bay 词典聚合器：各分表按语种合并成一张，index.ts / load.ts 只登记这一张。只由 W03 改。

import { LOCALES, type Locale } from "../../config";
import { BAY_SHELL_MESSAGES } from "./bay-shell-copy";
import { BAY_NEEDS_MESSAGES } from "./bay-needs-copy";
import { BAY_SUPPLY_MESSAGES } from "./bay-supply-copy";
import { BAY_DEAL_MESSAGES } from "./bay-deal-copy";
import { BAY_ORDERS_MESSAGES } from "./bay-orders-copy";
import { BAY_SELLER_MESSAGES } from "./bay-seller-copy";
import { BAY_MONEY_MESSAGES } from "./bay-money-copy";
import { BAY_PORTAL_MESSAGES } from "./bay-portal-copy";
import { LEOCHAT_PAGE_MESSAGES } from "./leochat-page-copy";
import { LEOBAY4_MESSAGES } from "./leobay4-copy";
import { BAY_ASSET_MESSAGES } from "./bay-asset-copy";
import { BAY_ASSET_INTO_MESSAGES } from "./bay-asset-into-copy";
import { BAY_APPS_SHELF_MESSAGES } from "./bay-apps-shelf-copy";
import { BAY_APPS_DETAIL_MESSAGES } from "./bay-apps-detail-copy";
import { BAY_APPS_EDITOR_MESSAGES } from "./bay-apps-editor-copy";
import { BAY_LESSONS_SHELF_MESSAGES } from "./bay-lessons-shelf-copy";
import { BAY_LESSONS_DETAIL_MESSAGES } from "./bay-lessons-detail-copy";
import { BAY_LESSONS_EDITOR_MESSAGES } from "./bay-lessons-editor-copy";
import { BAY_REVIEWS_MESSAGES } from "./bay-reviews-copy";
import { BAY_APP_FEEDBACK_MESSAGES } from "./bay-app-feedback-copy";
import { BAY_APP_LOGIN_MESSAGES } from "./bay-app-login-copy";
import { BAY_APP_PAID_MESSAGES } from "./bay-app-paid-copy";
import { BAY_DASHBOARD_MESSAGES } from "./bay-dashboard-copy";
import { BAY_APP_INSIGHTS_MESSAGES } from "./bay-app-insights-copy";
import { BAY_APP_RELEASES_MESSAGES } from "./bay-app-releases-copy";
import { BAY_APP_ENDPOINT_MESSAGES } from "./bay-app-endpoint-copy";
import { BAY_FORM_MESSAGES } from "./bay-form-copy";
import { BAY_POSTING_MESSAGES } from "./bay-posting-copy";
import { BAY_MINE_MESSAGES } from "./bay-mine-copy";

const PARTS = [
  BAY_SHELL_MESSAGES,
  BAY_NEEDS_MESSAGES,
  BAY_SUPPLY_MESSAGES,
  BAY_DEAL_MESSAGES,
  BAY_ORDERS_MESSAGES,
  BAY_SELLER_MESSAGES,
  BAY_MONEY_MESSAGES,
  BAY_PORTAL_MESSAGES,
  LEOCHAT_PAGE_MESSAGES,
  LEOBAY4_MESSAGES,
  BAY_ASSET_MESSAGES,
  BAY_ASSET_INTO_MESSAGES,
  BAY_APPS_SHELF_MESSAGES,
  BAY_APPS_DETAIL_MESSAGES,
  BAY_APPS_EDITOR_MESSAGES,
  BAY_LESSONS_SHELF_MESSAGES,
  BAY_LESSONS_DETAIL_MESSAGES,
  BAY_LESSONS_EDITOR_MESSAGES,
  BAY_REVIEWS_MESSAGES,
  BAY_APP_FEEDBACK_MESSAGES,
  BAY_APP_LOGIN_MESSAGES,
  BAY_APP_PAID_MESSAGES,
  BAY_DASHBOARD_MESSAGES,
  BAY_APP_INSIGHTS_MESSAGES,
  BAY_APP_RELEASES_MESSAGES,
  BAY_APP_ENDPOINT_MESSAGES,
  BAY_FORM_MESSAGES,
  BAY_POSTING_MESSAGES,
  BAY_MINE_MESSAGES,
];

export const BAY_MESSAGES: Record<Locale, Record<string, string>> =
  Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      Object.assign({}, ...PARTS.map((part) => part[locale] ?? {})),
    ]),
  ) as Record<Locale, Record<string, string>>;

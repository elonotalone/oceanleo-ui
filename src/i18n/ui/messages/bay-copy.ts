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

const PARTS = [
  BAY_SHELL_MESSAGES,
  BAY_NEEDS_MESSAGES,
  BAY_SUPPLY_MESSAGES,
  BAY_DEAL_MESSAGES,
  BAY_ORDERS_MESSAGES,
  BAY_SELLER_MESSAGES,
  BAY_MONEY_MESSAGES,
  BAY_PORTAL_MESSAGES,
];

export const BAY_MESSAGES: Record<Locale, Record<string, string>> =
  Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      Object.assign({}, ...PARTS.map((part) => part[locale] ?? {})),
    ]),
  ) as Record<Locale, Record<string, string>>;

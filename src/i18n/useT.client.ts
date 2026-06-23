// Client-side translation hooks. Re-export next-intl client API under unified
// names so each site imports t() from one place (single source of truth).
//   const t = useT();   t("common.login")
export { useTranslations as useT, useLocale, useMessages, useFormatter } from "next-intl";

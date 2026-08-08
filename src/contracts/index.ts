export {
  OCEANLEO_SITE_MANIFEST_SCHEMA,
  canonicalOceanLeoSiteKey,
  createOceanLeoAppContext,
  defineOceanLeoSiteManifest,
  resolveCatalogAlias,
  siteManifestMatches,
} from "./site-manifest";
// 域名家族（C5）。消费站要按当前家族拼自家链接、并判断某个子站在这个家族里
// **是否确实存在** —— 门户的 lib/sites.tsx 就靠这两个。判定本身留在包里，
// 消费站不得自己写第二份 host 判定或域名拼接。
export {
  CONFIGURED_DOMAIN_FAMILY,
  DEFAULT_DOMAIN_FAMILY,
  DOMAIN_FAMILIES,
  currentDomainFamily,
  currentDomainProfile,
  currentFamilyHasSubsite,
  currentFamilySubsiteOrigin,
  domainFamilyProfile,
  domainProfileForHost,
  familyForHost,
  familyHasSubsite,
  isCurrentFamilyFirstPartyHost,
  isFirstPartyHostOf,
  isUntrustedContentDomainHost,
  normalizeHost,
  registrableDomainsOfAllFamilies,
  sharedCookieDomainFor,
} from "./domain-family";
export type { DomainFamily, DomainFamilyProfile } from "./domain-family";
export type {
  OceanLeoAppContext,
  OceanLeoAuthContract,
  OceanLeoBrandContract,
  OceanLeoCatalogContract,
  OceanLeoCreditsContract,
  OceanLeoHostAdapterDeclaration,
  OceanLeoShellContract,
  OceanLeoSiteKey,
  OceanLeoSiteManifest,
  OceanLeoSiteManifestInput,
  OceanLeoWorkspaceRouteContract,
} from "./site-manifest";

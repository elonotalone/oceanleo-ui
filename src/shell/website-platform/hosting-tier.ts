export const HOSTING_TIERS = ["static", "request_billed", "server", "heavy", "own_accounts"] as const;
export type HostingTier = typeof HOSTING_TIERS[number];
export function isHostingTier(value: unknown): value is HostingTier {
  return HOSTING_TIERS.includes(value as HostingTier);
}

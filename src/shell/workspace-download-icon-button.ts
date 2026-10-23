/**
 * First-row icon launchers stay in the ghost family (transparent, linear icon).
 *
 * `IconButton` defaults `pill={true}`. `variant="secondary"` plus that pill is a
 * filled circle. Since D1 (2026-10-23) download / share / favorite live inside the
 * `···` menu; the `···` trigger itself keeps this ghost look.
 */
export const downloadIconButtonProps = {
  variant: "ghost",
} as const;

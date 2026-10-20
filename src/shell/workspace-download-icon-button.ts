/**
 * Workspace download launcher: same visual family as share/favorite.
 *
 * `IconButton` defaults `pill={true}`. `variant="secondary"` plus that pill is a
 * filled circle. Share/favorite omit `variant` and therefore render as ghost
 * (transparent, linear icon). Download must do the same.
 */
export const downloadIconButtonProps = {
  variant: "ghost",
} as const;

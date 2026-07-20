/**
 * Domain entrypoint discovery only. Consumers should import the concrete
 * `@oceanleo/ui/{artifact,library,workspace,session,workbench,browser}`
 * facade so capability boundaries remain visible in their dependency graph.
 */
export const OCEANLEO_DOMAIN_FACADES = [
  "artifact",
  "library",
  "workspace",
  "session",
  "workbench",
  "browser",
] as const;

export type OceanLeoDomainFacade =
  (typeof OCEANLEO_DOMAIN_FACADES)[number];

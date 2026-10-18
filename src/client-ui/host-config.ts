/** Typed writer / reader for the client host config slot. RN-safe (no window). */

export {
  CLIENT_HOST_CONFIG_GLOBAL_KEY,
  clientHostConfigGeneration,
  configureClientHost,
  createMemoryAuthStorage,
  getClientHostConfig,
  getHostNavItems,
  nativeShellFromHostConfig,
  onClientHostConfigChange,
  resetClientHostConfigForTests,
  type ClientHostAuthStorage,
  type ClientHostConfig,
  type ClientHostFamily,
  type ClientHostNavItem,
  type ClientHostNavSection,
  type ClientPlatform,
} from "../contracts/client-host-config";

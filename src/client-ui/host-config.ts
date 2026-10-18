/** Typed writer / reader for the client host config slot. RN-safe (no window). */

export {
  CLIENT_HOST_CONFIG_GLOBAL_KEY,
  CLIENT_WEB_BOOT_GLOBAL_KEY,
  clientHostConfigGeneration,
  configureClientHost,
  createMemoryAuthStorage,
  getClientHostConfig,
  getHostNavItems,
  HOST_LIBRARY_TIMEOUT_MS,
  hostAwareLibraryTimeoutMs,
  hostInjectedFetch,
  nativeShellFromHostConfig,
  onClientHostConfigChange,
  resetClientHostConfigForTests,
  WEB_LIBRARY_TIMEOUT_MS,
  type ClientHostAuthStorage,
  type ClientHostConfig,
  type ClientHostFamily,
  type ClientHostNavItem,
  type ClientHostNavSection,
  type ClientPlatform,
} from "../contracts/client-host-config";

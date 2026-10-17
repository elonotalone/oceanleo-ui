/** Typed writer / reader for the client host config slot. RN-safe (no window). */

export {
  CLIENT_HOST_CONFIG_GLOBAL_KEY,
  clientHostConfigGeneration,
  configureClientHost,
  createMemoryAuthStorage,
  getClientHostConfig,
  nativeShellFromHostConfig,
  onClientHostConfigChange,
  resetClientHostConfigForTests,
  type ClientHostAuthStorage,
  type ClientHostConfig,
  type ClientHostFamily,
  type ClientPlatform,
} from "../contracts/client-host-config";

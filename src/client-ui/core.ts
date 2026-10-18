/** RN-safe entry: ports, host context, navigation. Does not import the library surface. */

export {
  DEVELOPMENT_API_ENDPOINT,
  NOOP_SESSION,
  createMemoryPersist,
  type ClientEnvironment,
  type ClientHost,
  type ClientPlatform,
  type HostApiPort,
  type HostLinkComponent,
  type HostLinkProps,
  type HostNavigationPort,
  type HostPersistPort,
  type HostSessionPort,
} from "./host-ports";
export {
  CLIENT_HOST_CONFIG_GLOBAL_KEY,
  configureClientHost,
  createMemoryAuthStorage,
  getClientHostConfig,
  getHostNavItems,
  nativeShellFromHostConfig,
  onClientHostConfigChange,
  resetClientHostConfigForTests,
  type ClientHostAuthStorage,
  type ClientHostConfig,
  type ClientHostNavItem,
  type ClientHostNavSection,
} from "./host-config";
export {
  ClientHostContext,
  ClientHostProvider,
  useClientHost,
  useOptionalClientHost,
} from "./host-context";
export { HostLink } from "./host-link";
export { isActivePath, isModifiedClick, pathKey } from "./navigation";
export { MemoryHostProvider } from "./local/memory-host";

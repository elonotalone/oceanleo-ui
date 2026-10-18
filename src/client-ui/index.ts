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
export {
  hitsInPaths,
  inventoryHostCoupling,
  stripSourceComments,
  type HostCouplingFile,
  type HostCouplingHit,
  type HostCouplingKind,
} from "./scan-host-coupling";
export { SharedLibraryPage, type ArtifactLibraryProps } from "./surfaces/library-page";
export { MemoryHostProvider } from "./local/memory-host";
export { LocalLibraryHost } from "./local/library-host";

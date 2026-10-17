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
  ClientHostContext,
  ClientHostProvider,
  useClientHost,
  useOptionalClientHost,
} from "./host-context";
export { HostLink } from "./host-link";
export { isActivePath, isModifiedClick, pathKey } from "./navigation";
export { MemoryHostProvider } from "./local/memory-host";

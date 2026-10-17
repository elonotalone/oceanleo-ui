/**
 * Host injection ports for shared product UI.
 *
 * These are UI-facing contracts so web and local/RN hosts can feed navigation,
 * account, API endpoint, and persistence. They are not W01 StoragePort /
 * TransportPort / SessionPort and not a second business database.
 *
 * Core files in this directory must stay free of `next/*`, `window`,
 * `document`, and `localStorage` so React Native can import them.
 */

import type { ComponentType, MouseEvent, ReactNode } from "react";
import type { ClientPlatform } from "../contracts/client-host-config";

export type { ClientPlatform };

/** Injected by the host. Never derived from the page hostname. */
export interface ClientEnvironment {
  platform: ClientPlatform;
  apiEndpoint: string;
  capabilities: readonly string[];
}

export interface HostNavigationPort {
  pathname: string;
  search: string;
  push: (href: string) => void;
  replace: (href: string) => void;
}

export interface HostSessionPort {
  getUserEmail: () => Promise<string | null>;
  subscribe: (onChange: () => void) => () => void;
  signOut: () => Promise<void>;
}

export interface HostApiPort {
  endpoint: string;
}

export interface HostPersistPort {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
  subscribe: (key: string, onChange: () => void) => () => void;
}

export interface HostLinkProps {
  href: string;
  className?: string;
  children?: ReactNode;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  "aria-label"?: string;
  title?: string;
  [key: string]: unknown;
}

export type HostLinkComponent = ComponentType<HostLinkProps>;

export interface ClientHost {
  environment: ClientEnvironment;
  navigation: HostNavigationPort;
  session: HostSessionPort;
  api: HostApiPort;
  persist: HostPersistPort;
  Link: HostLinkComponent;
}

/** Local/desktop/RN hosts inject this. Web may leave it empty and keep existing clients. */
export const DEVELOPMENT_API_ENDPOINT = "https://api.dev.oceanleo.com";

export const NOOP_SESSION: HostSessionPort = {
  getUserEmail: async () => null,
  subscribe: () => () => {},
  signOut: async () => {},
};

export function createMemoryPersist(
  initial?: Iterable<readonly [string, string]>,
): HostPersistPort {
  const store = new Map<string, string>(initial);
  const listeners = new Map<string, Set<() => void>>();
  return {
    get(key) {
      return store.has(key) ? store.get(key)! : null;
    },
    set(key, value) {
      store.set(key, value);
      const group = listeners.get(key);
      if (!group) return;
      for (const listener of group) listener();
    },
    subscribe(key, onChange) {
      let group = listeners.get(key);
      if (!group) {
        group = new Set();
        listeners.set(key, group);
      }
      group.add(onChange);
      return () => {
        group?.delete(onChange);
      };
    },
  };
}

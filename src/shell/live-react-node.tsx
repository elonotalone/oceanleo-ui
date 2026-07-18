"use client";

import { useSyncExternalStore, type ReactNode } from "react";

export interface LiveReactNodeStore {
  node: ReactNode;
  version: number;
  listeners: Set<() => void>;
}

export function createLiveReactNodeStore(): LiveReactNodeStore {
  return { node: null, version: 0, listeners: new Set() };
}

export function publishLiveReactNode(
  store: LiveReactNodeStore,
  node: ReactNode,
): void {
  if (Object.is(store.node, node)) return;
  store.node = node;
  store.version += 1;
  store.listeners.forEach((listener) => listener());
}

export function LiveReactNode({ store }: { store: LiveReactNodeStore }) {
  useSyncExternalStore(
    (listener) => {
      store.listeners.add(listener);
      return () => store.listeners.delete(listener);
    },
    () => store.version,
    () => store.version,
  );
  return <>{store.node}</>;
}

"use client";

// requireBayLogin() 记下的登录请求由这里弹现有登录框。浮窗、Bay 页、访客浮窗各挂一份，只有最先挂上的那份渲染。
import { useEffect, useId, useSyncExternalStore } from "react";
import { AuthDialog } from "../../../pages/AuthDialog";
import { dismissBayLogin, useBayLoginRequested } from "./bay-state";

const hosts: string[] = [];
const hostListeners = new Set<() => void>();

function notifyHosts(): void {
  for (const listener of Array.from(hostListeners)) listener();
}

function subscribeHosts(listener: () => void): () => void {
  hostListeners.add(listener);
  return () => {
    hostListeners.delete(listener);
  };
}

export function BayAuthHost() {
  const id = useId();
  const requested = useBayLoginRequested();
  const owner = useSyncExternalStore(subscribeHosts, () => hosts[0] ?? null, () => null);

  useEffect(() => {
    hosts.push(id);
    notifyHosts();
    return () => {
      const at = hosts.indexOf(id);
      if (at >= 0) hosts.splice(at, 1);
      notifyHosts();
    };
  }, [id]);

  if (!requested || owner !== id) return null;
  return <AuthDialog onClose={dismissBayLogin} onSuccess={dismissBayLogin} />;
}

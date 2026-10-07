// 「这个人登没登录」查清了没有。登录态是懒加载的：刚打开页面的那一下还不知道，
// 这时就画「请登录」，已登录的人每次进来都会先看到一眼。整页据此在查清之前让聊天、联系人两栏先空着。
import { useSyncExternalStore } from "react";
import { accessToken } from "../../lib/auth/client";

let settled = false;
let asked = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!asked) {
    asked = true;
    const done = () => {
      settled = true;
      for (const each of Array.from(listeners)) each();
    };
    // 取到令牌、确认没登录、取的时候出错，都算查清了：之后以登录态本身为准。
    void accessToken().then(done, done);
  }
  return () => {
    listeners.delete(listener);
  };
}

/** 服务端与水合首帧为 false；查清之后为 true，不再变回去。 */
export function useAuthSettled(): boolean {
  return useSyncExternalStore(subscribe, () => settled, () => false);
}

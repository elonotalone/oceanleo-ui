import type { HostPersistPort } from "../host-ports";

/** Web-only persist. Browser globals stay in this adapter file. */
export function createWebPersist(): HostPersistPort {
  return {
    get(key) {
      try {
        if (typeof window === "undefined") return null;
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(key, value);
      } catch {
        /* private mode / quota */
      }
    },
    subscribe(key, onChange) {
      if (typeof window === "undefined") return () => {};
      const onStorage = (event: StorageEvent) => {
        if (event.key === key) onChange();
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
  };
}

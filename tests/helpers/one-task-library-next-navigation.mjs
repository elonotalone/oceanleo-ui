export function usePathname() {
  return typeof window === "undefined" ? "/library" : window.location.pathname;
}

const router = {
  push(path) {
    globalThis.__oneTaskLibraryNavigationCalls?.push({ method: "push", path });
  },
  replace(path) {
    globalThis.__oneTaskLibraryNavigationCalls?.push({ method: "replace", path });
  },
  back() {
    globalThis.__oneTaskLibraryNavigationCalls?.push({ method: "back" });
  },
};

export function useRouter() {
  // Next's App Router object is stable across renders. HistoryDetail uses it
  // as an effect dependency, so returning a fresh object here would manufacture
  // an infinite session-reload loop that does not exist in the real runtime.
  return router;
}

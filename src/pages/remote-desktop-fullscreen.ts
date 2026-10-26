const PORTAL_ID = "oceanleo-remote-desktop-screen";
let ownedFullscreen = false;

export function remoteDesktopPortal(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  let portal = document.getElementById(PORTAL_ID);
  if (!portal) {
    portal = document.createElement("div");
    portal.id = PORTAL_ID;
    document.body.appendChild(portal);
  }
  return portal;
}

/** Must run synchronously in the user's entry click to retain activation. */
export function requestRemoteDesktopFullscreen(): void {
  const portal = remoteDesktopPortal();
  if (!portal || document.fullscreenElement === portal || !portal.requestFullscreen) return;
  ownedFullscreen = true;
  try {
    void portal.requestFullscreen().then(() => {
      if (!ownedFullscreen && document.fullscreenElement === portal) void document.exitFullscreen().catch(() => {});
    }).catch(() => { ownedFullscreen = false; });
  } catch { /* Dedicated fixed viewport remains usable when the browser refuses. */ }
}

export function releaseRemoteDesktopFullscreen(): void {
  const portal = typeof document === "undefined" ? null : document.getElementById(PORTAL_ID);
  if (ownedFullscreen && document.fullscreenElement === portal) void document.exitFullscreen().catch(() => {});
  ownedFullscreen = false;
  queueMicrotask(() => { if (portal && !portal.childElementCount) portal.remove(); });
}

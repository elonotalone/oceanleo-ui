/**
 * One explicit request from the person to connect to a computer's remote
 * desktop: minted only in a click handler (进入桌面, 接管电脑, 连接, 重新连接)
 * and spent by `RemoteDesktopPanel` on the single session request it allows.
 *
 * Why (W, 2026-10-27 13:36:33 UTC): a page that came back with
 * `/devices?desktop=<id>` (reload, back/forward, a dev hot reload, a remount)
 * used to send `POST …/remote-desktop/sessions` by itself, so a consent dialog
 * appeared on the computer although nobody had asked. A ticket that is already
 * spent, or none at all, leaves the panel waiting for a click instead.
 */
export interface RemoteDesktopTicket {
  readonly id: number;
  /** Set by the panel when it sends the session request for this ticket. */
  spent: boolean;
  /** `performance.now()` of the click: origin of the anonymous click -> first frame timing. */
  readonly at?: number;
}

let sequence = 0;

/** Call only from a user's click (or tap) handler. */
export function remoteDesktopTicket(): RemoteDesktopTicket {
  sequence += 1;
  return { id: sequence, spent: false, at: typeof performance !== "undefined" ? performance.now() : Date.now() };
}

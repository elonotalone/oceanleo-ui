/** The host's own identity, without acquiring control or opening a native card. */
export async function readLocalDeviceId(): Promise<string | null> {
  if (typeof globalThis === "undefined") return null;
  const host = (globalThis as typeof globalThis & { __OCEANLEO_HOST__?: { bridge?: { status?: () => Promise<{ device?: { device_id?: unknown } }> } } }).__OCEANLEO_HOST__;
  if (typeof host?.bridge?.status !== "function") return null;
  try {
    const value = await host.bridge.status();
    const id = value?.device?.device_id;
    return typeof id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(id) ? id : null;
  } catch { return null; }
}

export async function readDeviceUser(): Promise<{ known: boolean; userId: string | null }> {
  try {
    const auth = await import("../../lib/auth/client");
    if (typeof auth.getUserIdSnapshot !== "function") return { known: false, userId: null };
    const snapshot = await auth.getUserIdSnapshot();
    return { known: snapshot.available, userId: snapshot.userId };
  } catch { return { known: false, userId: null }; }
}

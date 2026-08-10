/**
 * The small read-only adapter behind `PluginHost.appData()`.
 *
 * App runtimes already persist their opaque state in the current app session's
 * `snapshot`. This adapter exposes that value without teaching the platform
 * anything about its shape.
 */

export interface PluginAppDataSession {
  site_id: string;
  app_id: string;
  snapshot?: unknown;
}

export interface PluginAppDataReaderOptions {
  siteKey: string;
  appId: string;
  /** Read lazily so a host sees the newest session after React re-renders. */
  session: () => PluginAppDataSession | null | undefined;
}

export type PluginAppDataReader = () => Promise<unknown | null>;

/**
 * Build the `appData` function passed to one plugin host.
 *
 * The identity check prevents a still-mounted plugin from seeing the previous
 * app while the workspace changes. It does not inspect or normalize content.
 */
export function createPluginAppDataReader({
  siteKey,
  appId,
  session,
}: PluginAppDataReaderOptions): PluginAppDataReader {
  return async () => {
    const current = session();
    if (!current) return null;
    if (current.site_id !== siteKey || current.app_id !== appId) return null;
    return current.snapshot === undefined || current.snapshot === null
      ? null
      : current.snapshot;
  };
}


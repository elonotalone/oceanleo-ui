import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";
import { emitTelemetry } from "../lib/telemetry/index";
import { mapAutosaveErrorMessage } from "../lib/auth/autosave-error-message";

export const WORKING_COPY_CONFLICT = "这份文件已在其他标签页或设备上修改，请重新加载。";
export type WorkingCopyState = "saved" | "saving" | "error" | "conflict";
export interface WorkingCopy {
  schema: string; seq: number; base_revision_id: string | null;
  published_seq: number | null; saved_at: string; doc: unknown;
}
export interface WorkingCopyReceipt { ok: true; seq: number; saved_at: string; server_ms: number }
export interface WorkingCopyTransport {
  get(): Promise<WorkingCopy | null>;
  put(doc: unknown, seq: number | null): Promise<WorkingCopyReceipt>;
  published(seq: number, revisionId: string): Promise<void>;
}
export class WorkingCopyError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export function workingCopyRoot(item: { artifactId?: string; id: string; meta?: Record<string, unknown> }): string {
  return String(item.artifactId || item.meta?.artifact_id || item.id);
}
export function workingCopyTransport(root: string, schema: string, baseRevision: string | null): WorkingCopyTransport {
  const url = `${GATEWAY_BASE}/v1/editor-working-copies/${encodeURIComponent(root)}`;
  async function request(method: string, data?: unknown, suffix = "") {
    const token = await accessToken();
    if (!token) throw new WorkingCopyError("登录已过期，重新登录后自动继续", 401);
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    let body: BodyInit | undefined;
    if (data !== undefined) {
      const json = JSON.stringify(data);
      headers["Content-Type"] = "application/json";
      const bytes = new TextEncoder().encode(json);
      if (bytes.byteLength > 8 * 1024 && typeof CompressionStream !== "undefined") {
        body = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
        headers["Content-Encoding"] = "gzip";
      } else body = json;
    }
    const response = await fetch(url + suffix, { method, headers, body });
    if (method === "GET" && response.status === 404) return null;
    if (!response.ok) {
      const message = response.status === 409 ? WORKING_COPY_CONFLICT : response.status === 401 ? "登录已过期，重新登录后自动继续" : mapAutosaveErrorMessage({ status: response.status }) || "保存失败，请重试";
      throw new WorkingCopyError(message, response.status);
    }
    return response.status === 204 ? null : response.json();
  }
  return {
    get: () => request("GET"),
    put: (doc, seq) => request("PUT", { schema, if_seq: seq, base_revision_id: baseRevision, doc }),
    published: async (seq, revision_id) => { await request("POST", { seq, revision_id }, "/published"); baseRevision = revision_id; },
  };
}

export interface WorkingCopySnapshot { state: WorkingCopyState; error: string; seq: number | null; pending: boolean }
interface SaverOptions {
  transport: WorkingCopyTransport;
  capture: () => unknown | Promise<unknown>;
  restore: (doc: unknown, at?: number) => unknown | Promise<unknown>;
  schema: string;
  baseRevision: string | null;
  baseSavedAt?: number;
  now?: () => number;
  setTimer?: (run: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  onSaved?: (seq: number) => void;
  measure?: (ms: number, seq: number) => void;
  events?: Pick<Window, "addEventListener" | "removeEventListener">;
}
/** One conditional request at a time. Captures are never queued: only the latest edit is. */
export class WorkingCopySaver {
  private view: WorkingCopySnapshot = { state: "saving", error: "", seq: null, pending: false };
  private listeners = new Set<() => void>();
  private generation = 0;
  private acknowledged = 0;
  private editAt = 0;
  private latestAt = 0;
  private initialized = false;
  private initialization?: Promise<void>;
  private running?: Promise<boolean>;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private attempt = 0;
  private disposed = false;
  private readonly now;
  private readonly setTimer;
  private readonly clearTimer;
  private options: SaverOptions;
  constructor(options: SaverOptions) {
    this.options = options;
    this.now = options.now ?? (() => performance.now());
    this.setTimer = options.setTimer ?? setTimeout;
    this.clearTimer = options.clearTimer ?? clearTimeout;
    options.events?.addEventListener("online", this.online);
    options.events?.addEventListener("beforeunload", this.beforeUnload);
  }
  snapshot = () => this.view;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(state: WorkingCopyState, error = "") {
    this.view = { ...this.view, state, error, pending: this.generation > this.acknowledged };
    for (const listener of this.listeners) listener();
  }
  initialize = (): Promise<void> => {
    if (this.initialization) return this.initialization;
    this.initialization = (async () => {
      try {
        const copy = await this.options.transport.get();
        if (this.disposed) return;
        if (copy) {
          this.view = { ...this.view, seq: copy.seq };
          const newer = copy.base_revision_id === this.options.baseRevision ||
            !Number.isFinite(this.options.baseSavedAt) || Date.parse(copy.saved_at) > this.options.baseSavedAt!;
          const unpublished = copy.seq > (copy.published_seq ?? 0) && newer;
          if (unpublished && this.generation > 0) throw new WorkingCopyError(WORKING_COPY_CONFLICT, 409);
          if (unpublished && this.generation === 0) {
            if (copy.schema !== this.options.schema) throw new WorkingCopyError("服务器草稿暂时无法读取，请重新载入", 409);
            const restored = await this.options.restore(copy.doc, Date.parse(copy.saved_at));
            if (restored === false) throw new Error("服务器草稿暂时无法读取，请重新载入");
            this.options.onSaved?.(copy.seq);
          }
        }
        this.initialized = true;
        this.update(this.generation > this.acknowledged ? "saving" : "saved");
      } catch (error) { this.fail(error); this.initialization = undefined; }
    })();
    return this.initialization;
  };
  edit(): void {
    if (this.disposed) return;
    if (this.generation === this.acknowledged) this.editAt = this.now();
    this.latestAt = this.now();
    this.generation += 1;
    if (this.view.state === "conflict") { this.update("conflict", this.view.error); return; }
    this.cancelRetry();
    this.update("saving");
    void this.flush();
  }
  flush = (): Promise<boolean> => {
    if (this.running) return this.running;
    if (this.disposed || this.view.state === "conflict") return Promise.resolve(false);
    const run = this.drain();
    this.running = run;
    void run.then((ok) => {
      if (this.running === run) this.running = undefined;
      // An edit may arrive between the final acknowledgement and this microtask.
      if (ok && !this.disposed && this.view.state === "saving" && this.view.pending) void this.flush();
    });
    return run;
  };
  private async drain(): Promise<boolean> {
    await this.initialize();
    if (!this.initialized || this.disposed) return false;
    try {
      while (this.acknowledged < this.generation) {
        const target = this.generation;
        const started = this.editAt;
        const doc = await this.options.capture();
        if (doc === null || doc === undefined) throw new Error("保存失败，请重试");
        const result = await this.options.transport.put(doc, this.view.seq);
        if (!result.ok || !Number.isInteger(result.seq)) throw new Error("保存失败，请重试");
        this.view = { ...this.view, seq: result.seq };
        this.acknowledged = target;
        this.attempt = 0;
        const ms = this.now() - started;
        this.options.measure?.(ms, result.seq);
        if (!this.options.measure) {
          emitTelemetry({ source: "autosave", name: "editor_save", severity: ms > 500 ? "warn" : "info", value: ms,
            detail: { seq: result.seq, over_budget: ms > 500, server_ms: result.server_ms } });
          if (process.env.NODE_ENV !== "production") console.debug("[editor_save]", { ms, seq: result.seq, over_budget: ms > 500 });
        }
        this.editAt = this.latestAt;
        this.update(this.acknowledged < this.generation ? "saving" : "saved");
        this.options.onSaved?.(result.seq);
      }
      return true;
    } catch (error) { this.fail(error); return false; }
  }
  private fail(error: unknown) {
    const conflict = error instanceof WorkingCopyError && error.status === 409;
    this.update(conflict ? "conflict" : "error", error instanceof WorkingCopyError ? error.message : mapAutosaveErrorMessage({ error: error instanceof Error ? error.message : String(error) }) || "保存失败，请重试");
    if (!conflict && !this.disposed) {
      this.cancelRetry();
      this.retryTimer = this.setTimer(() => { this.retryTimer = undefined; void this.retry(); }, Math.min(30_000, 1000 * 2 ** this.attempt++));
    }
  }
  retry = (): Promise<boolean> => {
    if (this.view.state === "conflict") return Promise.resolve(false);
    this.cancelRetry();
    this.update("saving");
    return this.flush();
  };
  private online = () => { if (this.view.state === "error") void this.retry(); };
  private beforeUnload = (event: Event) => {
    if (!this.view.pending) return;
    event.preventDefault();
    (event as BeforeUnloadEvent).returnValue = "";
  };
  private cancelRetry() { if (this.retryTimer !== undefined) this.clearTimer(this.retryTimer); this.retryTimer = undefined; }
  freeze() {
    // Called before unmount: a pending request must never read a destroyed canvas.
    const captured = this.options.capture();
    this.options.capture = () => captured;
  }
  dispose() {
    this.disposed = true;
    this.cancelRetry();
    this.options.events?.removeEventListener("online", this.online);
    this.options.events?.removeEventListener("beforeunload", this.beforeUnload);
    this.listeners.clear();
  }
}

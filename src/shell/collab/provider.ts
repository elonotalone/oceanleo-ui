/**
 * 协同通道客户端（契约 §6.2）：拿票 → WebSocket → 第一帧 auth → `ready` →
 * 二进制帧走 y-websocket 协议（首字节 0 = sync，1 = awareness）→ 文本控制帧。
 *
 * 这个文件不认识登录、网关地址、React：拿票和拼 ws 地址都由调用方注入
 * （`use-collab-room.ts` 给真实现，测试给假的），所以能在 Node 里直接连真服务端。
 *
 * 行为要点：
 * - viewer 本地的 Yjs 更新不发出去，也不回应服务端的 sync step1（服务端本来也丢弃）。
 * - 断线按 1s → 2s → … → 30s 指数退避重连，每次重连**重新拿票**（票一次性）；
 *   重连后重发 step1，离线期间的本地改动随 step2 合进去。
 * - 锁拿到后每 20 秒发一次 `lock.renew`；页面关闭（`pagehide`）与 `destroy()` 时释放。
 * - 保存者：服务端说了算；从没连上过服务端（一开始就离线 / 被拒绝 / 未启用）时按「单人」处理，
 *   `isSaver` 为 true，免得谁都不存版本。
 */
import { Doc } from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { normalizeSelf, readPeers, sameUsers, sanitizeCollabUser, setLocalUser } from "./awareness";
import type { CollabLock, CollabRole, CollabRoom, CollabStatus, CollabUser } from "./index";

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const WS_OPEN = 1;

export interface CollabTicket {
  ticket: string;
  room_key: string;
  role: CollabRole;
  ws_path: string;
  needs_seed: boolean;
  self: CollabUser;
}

export class CollabTicketError extends Error {
  status: number;
  code: string;
  constructor(status: number, code = "", message = "") {
    super(message || `collab ticket failed (${status})`);
    this.name = "CollabTicketError";
    this.status = status;
    this.code = code;
  }
}

export interface WebSocketLike {
  readyState: number;
  binaryType: string;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
}

export interface CollabProviderOptions {
  /** 没拿到票之前用于 `room.roomKey` 的占位，一般是 `artifact:<id>`。 */
  roomKey: string;
  fetchTicket(): Promise<CollabTicket>;
  /** 把票里的 `ws_path` 拼成完整 ws(s) 地址。 */
  wsUrl(path: string): string;
  WebSocketImpl?: new (url: string) => WebSocketLike;
  doc?: Doc;
  /** 默认 1000 / 30000。 */
  backoffInitialMs?: number;
  backoffMaxMs?: number;
  /** 默认 20000。 */
  renewIntervalMs?: number;
  /** 默认 5000：发出 lock.acquire 后等回复的上限。 */
  acquireTimeoutMs?: number;
  /** 默认 10000：连上后等 `ready` 的上限。 */
  readyTimeoutMs?: number;
  /** 先不连（`connect()` 手动调）；默认 false。 */
  manual?: boolean;
}

type ExternalCb = (revisionId: string, origin: string) => void;

const PLACEHOLDER_SELF: CollabUser = { id: "", name: "", color: "hsl(0, 0%, 45%)", avatar_url: null };

function sameLock(a: CollabLock | null, b: CollabLock | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.holder.id === b.holder.id && a.expires_at === b.expires_at && a.mode === b.mode;
}

function parseLock(raw: unknown): CollabLock | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const holder = sanitizeCollabUser(r.holder);
  if (!holder) return null;
  return { holder, mode: "pro", expires_at: typeof r.expires_at === "string" ? r.expires_at : "" };
}

export class CollabProvider implements CollabRoom {
  roomKey: string;
  readonly doc: Doc;
  readonly awareness: Awareness;
  role: CollabRole = "editor";
  status: CollabStatus = "connecting";
  self: CollabUser = PLACEHOLDER_SELF;
  needsSeed = false;
  isSaver = false;
  lock: CollabLock | null = null;
  peers: CollabUser[] = [];

  private readonly opts: CollabProviderOptions;
  private readonly WS: new (url: string) => WebSocketLike;
  private ws: WebSocketLike | null = null;
  private wsReady = false;
  private gen = 0;
  private destroyed = false;
  private everReady = false;
  private failures = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;
  private renewTimer: ReturnType<typeof setInterval> | null = null;
  private pendingAcquire: { resolve(v: boolean): void; timer: ReturnType<typeof setTimeout> } | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly externalCbs = new Set<ExternalCb>();
  private dirty = false;
  private batching = 0;
  private readonly onDocUpdate: (update: Uint8Array, origin: unknown) => void;
  private readonly onAwarenessUpdate: (
    change: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => void;
  private readonly onAwarenessChange: () => void;
  private readonly onPageHide: () => void;
  private readonly onBackOnline: () => void;

  constructor(opts: CollabProviderOptions) {
    this.opts = opts;
    this.roomKey = opts.roomKey;
    this.doc = opts.doc ?? new Doc();
    this.awareness = new Awareness(this.doc);
    this.WS =
      opts.WebSocketImpl ??
      ((globalThis as { WebSocket?: new (url: string) => WebSocketLike }).WebSocket as new (
        url: string,
      ) => WebSocketLike);

    this.onDocUpdate = (update, origin) => {
      if (origin === this) return;
      if (this.role !== "editor" || !this.wsReady) return;
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_SYNC);
      syncProtocol.writeUpdate(enc, update);
      this.sendBinary(encoding.toUint8Array(enc));
    };
    this.doc.on("update", this.onDocUpdate);

    this.onAwarenessUpdate = ({ added, updated, removed }, origin) => {
      if (origin === this || !this.wsReady) return;
      const mine = this.awareness.clientID;
      if (![...added, ...updated, ...removed].includes(mine)) return;
      this.sendBinary(this.awarenessFrame([mine]));
    };
    this.awareness.on("update", this.onAwarenessUpdate);

    this.onAwarenessChange = () => {
      const next = readPeers(this.awareness, this.self.id);
      if (!sameUsers(next, this.peers)) {
        this.peers = next;
        this.emit();
      }
    };
    this.awareness.on("change", this.onAwarenessChange);

    this.onPageHide = () => this.releaseLock();
    this.onBackOnline = () => {
      if (this.destroyed || this.wsReady || !this.reconnectTimer) return;
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      void this.connect();
    };
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("pagehide", this.onPageHide);
      window.addEventListener("online", this.onBackOnline);
    }

    if (!opts.manual) void this.connect();
  }

  // ---------------------------------------------------------------- 订阅
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private emit(): void {
    if (this.batching > 0) {
      this.dirty = true;
      return;
    }
    for (const cb of Array.from(this.listeners)) {
      try {
        cb();
      } catch {
        /* 订阅者自己的错误不影响通道 */
      }
    }
  }

  private batch(fn: () => void): void {
    this.batching += 1;
    try {
      fn();
    } finally {
      this.batching -= 1;
      if (this.batching === 0 && this.dirty) {
        this.dirty = false;
        this.emit();
      }
    }
  }

  private setStatus(status: CollabStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.emit();
    }
  }

  // ---------------------------------------------------------------- 连接
  async connect(): Promise<void> {
    if (this.destroyed) return;
    this.clearReconnect();
    const gen = ++this.gen;
    this.setStatus("connecting");
    let ticket: CollabTicket;
    try {
      ticket = await this.opts.fetchTicket();
    } catch (error) {
      if (this.destroyed || gen !== this.gen) return;
      const status = error instanceof CollabTicketError ? error.status : 0;
      if (status === 401 || status === 403 || status === 404) {
        this.deny();
      } else {
        this.connectionLost();
      }
      return;
    }
    if (this.destroyed || gen !== this.gen) return;

    this.roomKey = ticket.room_key || this.roomKey;
    this.batch(() => {
      this.self = normalizeSelf(ticket.self);
      this.role = ticket.role === "viewer" ? "viewer" : "editor";
      this.needsSeed = Boolean(ticket.needs_seed);
      setLocalUser(this.awareness, this.self);
    });

    let socket: WebSocketLike;
    try {
      socket = new this.WS(this.opts.wsUrl(ticket.ws_path || "/v1/collab/ws"));
    } catch {
      this.connectionLost();
      return;
    }
    socket.binaryType = "arraybuffer";
    this.ws = socket;
    this.wsReady = false;
    socket.onopen = () => {
      if (gen !== this.gen) return;
      socket.send(JSON.stringify({ type: "auth", ticket: ticket.ticket }));
      this.readyTimer = setTimeout(() => {
        if (gen === this.gen && !this.wsReady) {
          try {
            socket.close(4000, "ready timeout");
          } catch {
            /* ignore */
          }
        }
      }, this.opts.readyTimeoutMs ?? 10_000);
    };
    socket.onmessage = (ev) => {
      if (gen !== this.gen) return;
      this.handleMessage(ev.data);
    };
    socket.onerror = () => {
      /* close 事件会跟上来；这里不处理 */
    };
    socket.onclose = (ev) => {
      if (gen !== this.gen) return;
      this.handleClose(ev?.code ?? 1006);
    };
  }

  private deny(): void {
    this.clearTimers();
    this.wsReady = false;
    this.batch(() => {
      // 从没连上过 = 单人处理，可以存版本；连上过的，保持最后一次服务端给的值。
      if (!this.everReady) this.isSaver = true;
      this.setStatus("denied");
    });
  }

  private handleClose(code: number): void {
    this.wsReady = false;
    this.ws = null;
    if (this.readyTimer) {
      clearTimeout(this.readyTimer);
      this.readyTimer = null;
    }
    if (this.destroyed) return;
    this.settlePendingAcquire(false);
    if (code === 4403 || code === 1008) {
      this.deny();
      return;
    }
    this.connectionLost();
  }

  /** 断线或连不上：清别人的在线状态，按退避重连。 */
  private connectionLost(): void {
    this.stopRenew();
    this.wsReady = false;
    const others = Array.from(this.awareness.getStates().keys()).filter((id) => id !== this.awareness.clientID);
    if (others.length) removeAwarenessStates(this.awareness, others, this);
    this.batch(() => {
      if (!this.everReady) this.isSaver = true;
      this.setStatus("offline");
    });
    const initial = this.opts.backoffInitialMs ?? 1000;
    const max = this.opts.backoffMaxMs ?? 30_000;
    const delay = Math.min(max, initial * 2 ** Math.min(this.failures, 16));
    this.failures += 1;
    this.clearReconnect();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearReconnect();
    if (this.readyTimer) {
      clearTimeout(this.readyTimer);
      this.readyTimer = null;
    }
    this.stopRenew();
  }

  // ---------------------------------------------------------------- 收帧
  private handleMessage(data: unknown): void {
    if (typeof data === "string") {
      let msg: unknown;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      if (msg && typeof msg === "object") this.handleControl(msg as Record<string, unknown>);
      return;
    }
    if (!this.wsReady) return;
    let bytes: Uint8Array | null = null;
    if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
    else if (ArrayBuffer.isView(data)) bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (!bytes || bytes.length === 0) return;
    try {
      this.handleBinary(bytes);
    } catch {
      /* 坏帧丢弃 */
    }
  }

  private handleBinary(bytes: Uint8Array): void {
    const decoder = decoding.createDecoder(bytes);
    const type = decoding.readVarUint(decoder);
    if (type === MSG_SYNC) {
      const reply = encoding.createEncoder();
      encoding.writeVarUint(reply, MSG_SYNC);
      const syncType = syncProtocol.readSyncMessage(decoder, reply, this.doc, this);
      // viewer 不回 step2（服务端丢弃，白发）；editor 才回。
      if (syncType === syncProtocol.messageYjsSyncStep1 && encoding.length(reply) > 1 && this.role === "editor") {
        this.sendBinary(encoding.toUint8Array(reply));
      }
      if (syncType === syncProtocol.messageYjsSyncStep2 && this.status === "syncing") {
        this.setStatus("synced");
      }
    } else if (type === MSG_AWARENESS) {
      applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), this);
    }
  }

  private handleControl(msg: Record<string, unknown>): void {
    switch (msg.type) {
      case "ready": {
        if (this.readyTimer) {
          clearTimeout(this.readyTimer);
          this.readyTimer = null;
        }
        this.batch(() => {
          this.wsReady = true;
          this.everReady = true;
          this.failures = 0;
          if (typeof msg.room_key === "string" && msg.room_key) this.roomKey = msg.room_key;
          if (msg.role === "viewer" || msg.role === "editor") this.role = msg.role;
          this.needsSeed = Boolean(msg.needs_seed);
          this.isSaver = Boolean(msg.is_saver);
          this.lock = parseLock(msg.lock);
          this.setStatus("syncing");
        });
        this.syncRenew();
        this.sendStep1();
        this.sendBinary(this.awarenessFrame([this.awareness.clientID]));
        return;
      }
      case "saver": {
        const next = Boolean(msg.is_saver);
        if (this.isSaver !== next) {
          this.isSaver = next;
          this.emit();
        }
        return;
      }
      case "lock": {
        this.applyLock(parseLock(msg.lock));
        return;
      }
      case "role": {
        if (msg.role !== "viewer" && msg.role !== "editor") return;
        const was = this.role;
        if (was === msg.role) return;
        this.role = msg.role;
        this.emit();
        if (msg.role === "editor" && this.wsReady) this.sendStep1();
        return;
      }
      case "external_revision": {
        const id = typeof msg.revision_id === "string" ? msg.revision_id : "";
        if (!id) return;
        const origin = typeof msg.origin === "string" ? msg.origin : "other";
        for (const cb of Array.from(this.externalCbs)) {
          try {
            cb(id, origin);
          } catch {
            /* ignore */
          }
        }
        return;
      }
      default:
        return;
    }
  }

  // ---------------------------------------------------------------- 发帧
  private sendBinary(bytes: Uint8Array): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WS_OPEN) return;
    try {
      ws.send(bytes);
    } catch {
      /* 发不出去等 close 事件处理 */
    }
  }

  private sendControl(payload: Record<string, unknown>): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== WS_OPEN || !this.wsReady) return false;
    try {
      ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  private sendStep1(): void {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeSyncStep1(enc, this.doc);
    this.sendBinary(encoding.toUint8Array(enc));
  }

  private awarenessFrame(clients: number[]): Uint8Array {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_AWARENESS);
    encoding.writeVarUint8Array(enc, encodeAwarenessUpdate(this.awareness, clients));
    return encoding.toUint8Array(enc);
  }

  // ---------------------------------------------------------------- 锁
  private holdsLock(lock: CollabLock | null = this.lock): boolean {
    return Boolean(lock && this.self.id && lock.holder.id === this.self.id);
  }

  private applyLock(next: CollabLock | null): void {
    if (!sameLock(this.lock, next)) {
      this.lock = next;
      this.emit();
    }
    this.syncRenew();
    if (this.pendingAcquire && next) this.settlePendingAcquire(this.holdsLock(next));
  }

  private syncRenew(): void {
    if (this.holdsLock() && this.wsReady) {
      if (this.renewTimer) return;
      this.renewTimer = setInterval(() => {
        if (!this.sendControl({ type: "lock.renew" })) this.stopRenew();
      }, this.opts.renewIntervalMs ?? 20_000);
    } else {
      this.stopRenew();
    }
  }

  private stopRenew(): void {
    if (this.renewTimer) {
      clearInterval(this.renewTimer);
      this.renewTimer = null;
    }
  }

  private settlePendingAcquire(value: boolean): void {
    const pending = this.pendingAcquire;
    if (!pending) return;
    this.pendingAcquire = null;
    clearTimeout(pending.timer);
    pending.resolve(value);
  }

  acquireLock(): Promise<boolean> {
    if (this.destroyed || !this.wsReady) return Promise.resolve(false);
    if (this.holdsLock()) return Promise.resolve(true);
    const held = this.lock;
    if (held && held.holder.id !== this.self.id) {
      const expires = Date.parse(held.expires_at);
      // 别人的锁还没过期（留 2 秒时钟误差）→ 不用问服务端了。
      if (Number.isFinite(expires) && Date.now() < expires + 2000) return Promise.resolve(false);
    }
    this.settlePendingAcquire(false);
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => this.settlePendingAcquire(this.holdsLock()), this.opts.acquireTimeoutMs ?? 5000);
      this.pendingAcquire = { resolve, timer };
      if (!this.sendControl({ type: "lock.acquire", mode: "pro" })) this.settlePendingAcquire(false);
    });
  }

  releaseLock(): void {
    this.settlePendingAcquire(false);
    if (!this.holdsLock()) return;
    this.sendControl({ type: "lock.release" });
    this.stopRenew();
    this.lock = null;
    this.emit();
  }

  // ---------------------------------------------------------------- 其余 API
  completeSeed(roots: string[]): void {
    if (!this.needsSeed) return;
    this.sendControl({ type: "seed.done", roots: Array.from(new Set(roots)) });
    this.needsSeed = false;
    this.emit();
  }

  markSaved(revisionId: string): void {
    if (!revisionId) return;
    this.sendControl({ type: "mark", kind: "save", revision_id: revisionId });
  }

  onExternalRevision(cb: ExternalCb): () => void {
    this.externalCbs.add(cb);
    return () => {
      this.externalCbs.delete(cb);
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.releaseLock();
    this.destroyed = true;
    this.gen += 1;
    this.clearTimers();
    this.settlePendingAcquire(false);
    // 先告诉别人我走了（awareness 置空会触发 update → 发出去），再关连接。
    this.awareness.setLocalState(null);
    this.doc.off("update", this.onDocUpdate);
    const ws = this.ws;
    this.ws = null;
    this.wsReady = false;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try {
        ws.close(1000, "destroy");
      } catch {
        /* ignore */
      }
    }
    if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
      window.removeEventListener("pagehide", this.onPageHide);
      window.removeEventListener("online", this.onBackOnline);
    }
    this.awareness.off("update", this.onAwarenessUpdate);
    this.awareness.off("change", this.onAwarenessChange);
    this.awareness.destroy();
    this.listeners.clear();
    this.externalCbs.clear();
  }
}

export function createCollabProvider(opts: CollabProviderOptions): CollabProvider {
  return new CollabProvider(opts);
}

/** viewer，或专业模式锁在别人手里 → true。锁在自己手里不算只读。 */
export function isCollabReadOnly(room: CollabRoom | null): boolean {
  if (!room) return false;
  if (room.role === "viewer") return true;
  return Boolean(room.lock && room.lock.holder.id !== room.self.id);
}

/** 保存闸：不在协同里 → true；在协同里 → 房间里的保存者才存版本；没连上协同（拒绝/未启用）→ true。 */
export function canSaveVersion(room: CollabRoom | null): boolean {
  if (!room) return true;
  if (room.status === "denied" || room.status === "disabled") return true;
  return room.isSaver;
}

// ============================================================================
// 第二块屏，和让它保持诚实的那条通道
// ----------------------------------------------------------------------------
// 这份文件里没有 React，也没有一行 deck 的知识。两件事都是通用的：
//
//   1. `createTabLink()` —— 同源多标签页/多窗口之间的一条命名通道。
//      2026-08-31 之前全仓 `BroadcastChannel` 命中 0（`01-verified-facts.md` §2.5，
//      W16 用控制串复核过），这是第一处。**所以它从一开始就不长成 deck 的形状**：
//      后面做「多标签页编辑同一份文档」的人直接拿这个用，不要再散写一遍。
//   2. `openDetachedWindow()` —— 开一个同源空窗，并把样式带过去。
//
// 两处刻意的选择，改之前先读：
//
// **不加 `noopener`。** 仓里现有三处 `window.open` 一律
// `"_blank", "noopener,noreferrer"`（`AppMarket.tsx:138` 等），那是对的——它们开的是
// 外链。这里开的是我们自己的第二块屏，而 `noopener` 会让 `open()` 返回 `null`，
// 主窗从此判断不了子窗是否还活着，「主窗关闭给提示」和「子窗关了要收回状态」
// 两条就都做不成。返回 `null` 在这里的语义是**被拦截**，不能再有第二种来源。
//
// **样式要自己搬。** 空窗的 document 是干净的，Tailwind 的类名在那边一个都不认。
// 搬不过去的后果不是难看，是演讲者视图在真投影仪上变成一堆没有布局的黑字。
// ============================================================================

/** `BroadcastChannel` 里我们真正用到的那一小块。测试给替身时照着这个形状给。 */
export interface TabLinkChannel {
  postMessage(data: unknown): void;
  close(): void;
  addEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
}

export type TabLinkFactory = (name: string) => TabLinkChannel;

export interface TabLink<TMessage> {
  /** 通道真的建起来了吗。`false` 时 `post()` 是空操作，调用方据此走降级。 */
  readonly supported: boolean;
  post(message: TMessage): void;
  close(): void;
}

export interface TabLinkOptions<TMessage> {
  name: string;
  onMessage: (message: TMessage) => void;
  /** 注入口：jsdom 没有 `BroadcastChannel`，测试从这里给替身。 */
  factory?: TabLinkFactory | null;
}

const TAB_LINK_MARKER = "@oceanleo/tab-link@1";

interface TabLinkEnvelope {
  marker: typeof TAB_LINK_MARKER;
  sender: string;
  payload: unknown;
}

let senderSeq = 0;

function nextSenderId(): string {
  senderSeq += 1;
  return `tab-${senderSeq}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 平台自带的 `BroadcastChannel`，没有就 `null`。
 *
 * SSR 与 jsdom 都会走到 `null` 这一支，所以每个调用点都必须能在没有通道的情况下
 * 照常工作——这不是防御性编程，是本包 31 个站有服务端渲染这一条的直接后果。
 */
export function nativeTabLinkFactory(): TabLinkFactory | null {
  if (typeof globalThis === "undefined") return null;
  const Channel = (
    globalThis as { BroadcastChannel?: new (name: string) => TabLinkChannel }
  ).BroadcastChannel;
  if (typeof Channel !== "function") return null;
  return (name: string) => new Channel(name);
}

function isEnvelope(value: unknown): value is TabLinkEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as TabLinkEnvelope).marker === TAB_LINK_MARKER &&
    typeof (value as TabLinkEnvelope).sender === "string"
  );
}

/**
 * 一条命名通道。收到自己发的消息一律丢掉。
 *
 * 原生 `BroadcastChannel` 本来就不回显给发送方，这条判断是为**替身**留的：
 * 测试里的 mock 通常拿一张订阅表广播给所有人，回显就成了默认行为，
 * 而双向同步一旦回显就是一个无限循环。判据不该依赖替身有没有想到这件事。
 */
export function createTabLink<TMessage>({
  name,
  onMessage,
  factory,
}: TabLinkOptions<TMessage>): TabLink<TMessage> {
  const resolved = factory === undefined ? nativeTabLinkFactory() : factory;
  if (!resolved) {
    return { supported: false, post: () => {}, close: () => {} };
  }

  const sender = nextSenderId();
  let channel: TabLinkChannel | null;
  try {
    channel = resolved(name);
  } catch {
    // 通道建不起来（隐私模式、被扩展改过的实现）与「不支持」是同一件事。
    return { supported: false, post: () => {}, close: () => {} };
  }

  const listener = (event: { data: unknown }) => {
    if (!isEnvelope(event.data)) return;
    if (event.data.sender === sender) return;
    onMessage(event.data.payload as TMessage);
  };
  channel.addEventListener("message", listener);

  let open = true;
  return {
    supported: true,
    post(message) {
      if (!open) return;
      const envelope: TabLinkEnvelope = {
        marker: TAB_LINK_MARKER,
        sender,
        payload: message,
      };
      try {
        channel.postMessage(envelope);
      } catch {
        // 结构化克隆失败只该让这一条消息丢掉，不该把放映打断。
      }
    },
    close() {
      if (!open) return;
      open = false;
      channel.removeEventListener("message", listener);
      try {
        channel.close();
      } catch {
        // 已经关掉的通道再关一次不是错误。
      }
    },
  };
}

// ── 第二个窗口 ───────────────────────────────────────────────────────────────

export type DetachedWindowFailure = "unsupported" | "blocked";

export interface DetachedWindowHandle {
  readonly window: Window;
  /** 渲染落点。子窗 `document.body` 下的一个容器，不是 body 本身。 */
  readonly container: HTMLElement;
  closed(): boolean;
  close(): void;
  focus(): void;
}

export type DetachedWindowOutcome =
  | { ok: true; handle: DetachedWindowHandle }
  | { ok: false; reason: DetachedWindowFailure };

export interface DetachedWindowOptions {
  /** `window.open` 的第二个参数。同名再开会复用同一个窗口，正是我们要的。 */
  name: string;
  title: string;
  width?: number;
  height?: number;
  /** 注入口：jsdom 的 `window.open` 恒返回 `null`，测试从这里给替身。 */
  opener?: (
    url: string,
    name: string,
    features: string,
  ) => Window | null;
  /** 样式从哪儿搬。默认当前文档。 */
  sourceDocument?: Document | null;
}

/**
 * 把开窗文档里的样式搬进子窗。
 *
 * `<style>` 直接抄文本；`<link rel=stylesheet>` 抄 href 让子窗自己去取
 * （同源，命中的是同一份 HTTP 缓存，不会多一次真实下载）。
 * 任何一条搬不动都只跳过它：少一条样式是难看，抛出去是整个演讲者视图不出现。
 */
function adoptStyles(source: Document, target: Document): void {
  const head = target.head || target.getElementsByTagName("head")[0];
  if (!head) return;
  const nodes = source.querySelectorAll(
    'style, link[rel="stylesheet"]',
  );
  for (const node of Array.from(nodes)) {
    try {
      if (node.tagName.toLowerCase() === "style") {
        const style = target.createElement("style");
        style.textContent = node.textContent || "";
        head.append(style);
        continue;
      }
      const href = (node as HTMLLinkElement).href;
      if (!href) continue;
      const link = target.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      head.append(link);
    } catch {
      // 跨源样式表读不到 cssRules 之类，跳过这一条即可。
    }
  }
}

/**
 * 开一个同源空窗并交还渲染落点。
 *
 * 必须在用户手势的调用栈里同步调用，否则一定被拦截——这也是它不返回 Promise 的原因。
 */
export function openDetachedWindow({
  name,
  title,
  width = 1_120,
  height = 720,
  opener,
  sourceDocument,
}: DetachedWindowOptions): DetachedWindowOutcome {
  const open =
    opener ??
    (typeof window !== "undefined" && typeof window.open === "function"
      ? (url: string, target: string, features: string) =>
          window.open(url, target, features)
      : null);
  if (!open) return { ok: false, reason: "unsupported" };

  let child: Window | null = null;
  try {
    child = open(
      "",
      name,
      `popup=yes,width=${width},height=${height},menubar=no,toolbar=no,location=no`,
    );
  } catch {
    return { ok: false, reason: "blocked" };
  }
  // J10：没有 `noopener` 时 `null` 只可能是被拦截。
  if (!child) return { ok: false, reason: "blocked" };

  const doc = child.document;
  if (!doc) return { ok: false, reason: "blocked" };

  try {
    doc.title = title;
  } catch {
    // 标题写不进去不影响放映。
  }

  const source =
    sourceDocument ?? (typeof document !== "undefined" ? document : null);
  if (source) adoptStyles(source, doc);

  const container = doc.createElement("div");
  container.setAttribute("data-deck-presenter-window", "true");
  container.style.height = "100%";
  const body = doc.body || doc.getElementsByTagName("body")[0];
  if (!body) return { ok: false, reason: "blocked" };
  body.style.margin = "0";
  body.style.height = "100vh";
  body.append(container);

  return {
    ok: true,
    handle: {
      window: child,
      container,
      closed: () => Boolean(child.closed),
      close: () => {
        try {
          child.close();
        } catch {
          // 关不掉的窗口留给用户自己关，不要因此抛。
        }
      },
      focus: () => {
        try {
          child.focus();
        } catch {
          // 聚焦被拒不是错误。
        }
      },
    },
  };
}

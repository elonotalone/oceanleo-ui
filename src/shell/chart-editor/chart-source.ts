import type { EditorManifestV1, LibraryItem } from "../library-data";
import { refreshArtifactRendition } from "../artifact-client";
import {
  CHART_DOCUMENT_SCHEMA,
  CHART_SOURCE_MAX_BYTES,
  chartDocumentFromJson,
  chartDocumentFromStructuredValue,
  type ChartDocumentV1,
  type ChartStructuredSourceKind,
} from "./chart-schema";

const GATEWAY =
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_OCEANLEO_GATEWAY_URL ||
      process.env.NEXT_PUBLIC_GATEWAY_URL)) ||
  "https://api.oceanleo.com";

export const CHART_EDITOR_ID = "chart-editor";
export const CHART_EDITOR_ADAPTER = "chart-editor@1";
export const CHART_OPTION_FORMAT = "echarts-option+json";
export const CHART_SOURCE_TIMEOUT_MS = 15_000;
export const CHART_SOURCE_REPAIR =
  "数据修复：为当前 revision 补录 oceanleo.chart.v1，或补录 chart-editor@1 的结构化 ECharts option 源；不会从 HTML、脚本或 PNG 逆向伪恢复。";

const ROUND_TRIP = ["load", "mutate", "save", "reopen"] as const;
const LEGACY_SOURCE_PATH =
  /^\/v1\/assets\/library\/[a-z0-9-]{3,128}\/editor-source$/i;
const LEGACY_SOURCE_HOSTS = new Set([
  "api.oceanleo.com",
  "oceanleo-assets.oss-cn-guangzhou.aliyuncs.com",
]);

export type ChartSourceErrorCode =
  | "missing-source"
  | "invalid-manifest"
  | "invalid-revision"
  | "untrusted-url"
  | "expired-url"
  | "source-timeout"
  | "source-network"
  | "source-http"
  | "source-type"
  | "source-too-large"
  | "source-digest"
  | "invalid-option";

export class ChartSourceError extends Error {
  readonly code: ChartSourceErrorCode;

  constructor(code: ChartSourceErrorCode, message: string) {
    super(message);
    this.name = "ChartSourceError";
    this.code = code;
  }
}

interface InlineChartSource {
  kind: "inline";
  parseAs: ChartStructuredSourceKind;
  value: string | unknown;
  origin: "content" | "chart_document" | "chart_option";
}

interface UrlChartSource {
  kind: "url";
  parseAs: ChartStructuredSourceKind;
  url: string;
  requestUrl: string;
  trust: "canonical-artifact" | "chart-editor-manifest";
  expiresAt: string | null;
  digest: string | null;
}

export type ResolvedChartSource = InlineChartSource | UrlChartSource;

export interface ChartLoadOptions {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  refreshRendition?: typeof refreshArtifactRendition;
  now?: number;
  timeoutMs?: number;
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? (value as Record<string, unknown>)
    : null;
}

function sourceFailure(
  code: ChartSourceErrorCode,
  message: string,
): ChartSourceError {
  return new ChartSourceError(code, `${message} ${CHART_SOURCE_REPAIR}`);
}

function normalizedManifest(item: LibraryItem): EditorManifestV1 {
  const candidate =
    item.descriptor?.editor ??
    item.meta.editor_manifest ??
    item.meta.editor;
  const manifest = record(candidate);
  const source = record(manifest?.source);
  const capabilities = Array.isArray(manifest?.capabilities)
    ? manifest.capabilities
    : null;
  if (!manifest) {
    throw sourceFailure(
      "missing-source",
      `此图表没有 ${CHART_EDITOR_ADAPTER} 结构化源。`,
    );
  }
  if (
    manifest.schema !== "oceanleo.editor-manifest.v1" ||
    manifest.id !== CHART_EDITOR_ID ||
    manifest.version !== 1 ||
    !source ||
    (source.kind !== "inline" && source.kind !== "url") ||
    (source.format !== CHART_OPTION_FORMAT &&
      source.format !== CHART_DOCUMENT_SCHEMA) ||
    !capabilities ||
    !ROUND_TRIP.every((capability) =>
      capabilities.includes(capability),
    )
  ) {
    throw sourceFailure(
      "invalid-manifest",
      `${CHART_EDITOR_ADAPTER} manifest 的版本、能力或 source format 无效。`,
    );
  }
  const url =
    typeof source.url === "string" && source.url.length <= 2_000
      ? source.url.trim()
      : "";
  if (source.kind === "url" && !url) {
    throw sourceFailure(
      "invalid-manifest",
      `${CHART_EDITOR_ADAPTER} URL manifest 缺少 source.url。`,
    );
  }
  return {
    schema: "oceanleo.editor-manifest.v1",
    id: CHART_EDITOR_ID,
    version: 1,
    capabilities: [...ROUND_TRIP],
    source: {
      kind: source.kind,
      format: source.format,
      ...(url ? { url } : {}),
    },
  };
}

function safePort(url: URL): boolean {
  return !url.port || (url.protocol === "https:" && url.port === "443");
}

function privateNetworkHostname(value: string): boolean {
  const hostname = value.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return true;
  }
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(
    hostname,
  );
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    return (
      octets.some((octet) => octet > 255) ||
      octets[0] === 0 ||
      octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      octets[0] >= 224
    );
  }
  return (
    hostname === "::" ||
    hostname === "::1" ||
    hostname.startsWith("fc") ||
    hostname.startsWith("fd") ||
    /^fe[89ab]/.test(hostname) ||
    hostname.startsWith("::ffff:127.") ||
    hostname.startsWith("::ffff:10.") ||
    hostname.startsWith("::ffff:192.168.")
  );
}

export function trustedCanonicalChartSourceUrl(value: string): string {
  if (!value || value.length > 4_096) {
    throw sourceFailure(
      "untrusted-url",
      "canonical chart source URL 为空或超过 4096 字符。",
    );
  }
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      !safePort(parsed) ||
      privateNetworkHostname(parsed.hostname) ||
      parsed.hash
    ) {
      throw new Error("unsafe");
    }
    return parsed.toString();
  } catch {
    throw sourceFailure(
      "untrusted-url",
      "canonical chart source 必须是无凭据、无 fragment 的 HTTPS URL。",
    );
  }
}

export function trustedChartManifestSourceUrl(value: string): string {
  const candidate = value.trim();
  if (
    candidate.length <= 2_000 &&
    LEGACY_SOURCE_PATH.test(candidate)
  ) {
    return candidate;
  }
  try {
    const parsed = new URL(candidate);
    if (
      candidate.length > 2_000 ||
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      !safePort(parsed) ||
      parsed.hash ||
      !LEGACY_SOURCE_HOSTS.has(parsed.hostname.toLowerCase()) ||
      (!parsed.pathname.toLowerCase().endsWith(".json") &&
        !LEGACY_SOURCE_PATH.test(parsed.pathname))
    ) {
      throw new Error("unsafe");
    }
    return parsed.toString();
  } catch {
    throw sourceFailure(
      "untrusted-url",
      `${CHART_EDITOR_ADAPTER} URL manifest 指向了不受信任的协议、主机或非 JSON 路径。`,
    );
  }
}

function parseCompactUtc(value: string): number | null {
  const match =
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/i.exec(value);
  if (!match) return null;
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  );
}

function numericExpiry(value: string | null): number | null {
  if (!value || !/^\d{1,16}$/.test(value)) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number > 10_000_000_000 ? number : number * 1_000;
}

export function chartSourceExpiry(
  url: string,
  declaredExpiresAt: string | null = null,
): number | null {
  if (declaredExpiresAt) {
    const declared = Date.parse(declaredExpiresAt);
    if (!Number.isFinite(declared)) {
      throw sourceFailure(
        "invalid-revision",
        "canonical chart source 的 expiresAt 无效。",
      );
    }
    return declared;
  }
  let parsed: URL;
  try {
    parsed = new URL(url, "https://api.oceanleo.com");
  } catch {
    return null;
  }
  const direct =
    numericExpiry(parsed.searchParams.get("Expires")) ??
    numericExpiry(parsed.searchParams.get("expires")) ??
    numericExpiry(parsed.searchParams.get("expires_at"));
  if (direct !== null) return direct;
  const isoExpiry =
    parsed.searchParams.get("se") ||
    parsed.searchParams.get("expiry") ||
    parsed.searchParams.get("expires_at");
  if (isoExpiry) {
    const parsedIso = Date.parse(isoExpiry);
    if (Number.isFinite(parsedIso)) return parsedIso;
  }
  const duration = Number(
    parsed.searchParams.get("X-Amz-Expires") ||
      parsed.searchParams.get("x-oss-expires") ||
      "",
  );
  const issuedAt =
    parseCompactUtc(
      parsed.searchParams.get("X-Amz-Date") ||
        parsed.searchParams.get("x-oss-date") ||
        "",
    ) ?? null;
  return issuedAt !== null && Number.isFinite(duration) && duration >= 0
    ? issuedAt + duration * 1_000
    : null;
}

export function assertFreshChartSourceUrl(
  url: string,
  declaredExpiresAt: string | null = null,
  now = Date.now(),
): void {
  const expires = chartSourceExpiry(url, declaredExpiresAt);
  if (expires === null) {
    try {
      const keys = [...new URL(url, "https://api.oceanleo.com").searchParams.keys()]
        .map((key) => key.toLowerCase());
      if (
        keys.some((key) =>
          [
            "signature",
            "token",
            "x-amz-signature",
            "x-oss-signature",
            "ossaccesskeyid",
          ].includes(key),
        )
      ) {
        throw sourceFailure(
          "expired-url",
          "图表结构化 source URL 含无法验证生命周期的签名参数。",
        );
      }
    } catch (caught) {
      if (caught instanceof ChartSourceError) throw caught;
    }
  }
  if (expires !== null && expires <= now + 5_000) {
    throw sourceFailure(
      "expired-url",
      "图表结构化 source URL 已过期；请刷新当前素材 revision 获取新 URL。",
    );
  }
}

function gatewayRequestUrl(url: string): string {
  if (!url.startsWith("/")) return url;
  try {
    const gateway = new URL(GATEWAY);
    if (
      (gateway.protocol !== "https:" &&
        !(
          gateway.protocol === "http:" &&
          ["localhost", "127.0.0.1", "::1"].includes(gateway.hostname)
        )) ||
      gateway.username ||
      gateway.password
    ) {
      throw new Error("unsafe gateway");
    }
    return new URL(url, gateway).toString();
  } catch {
    throw sourceFailure(
      "untrusted-url",
      "chart source 无法通过受信任 gateway 解析。",
    );
  }
}

function canonicalArtifactSource(item: LibraryItem): UrlChartSource | null {
  const artifact = item.artifact;
  if (!artifact && !item.artifactId && !item.revisionId) return null;
  if (
    !artifact ||
    artifact.schema !== "oceanleo.artifact.v1" ||
    item.artifactId !== artifact.artifactId ||
    item.revisionId !== artifact.revisionId ||
    item.artifactType !== "chart" ||
    artifact.artifactType !== "chart" ||
    (artifact.editorCapability !== CHART_EDITOR_ID &&
      artifact.editorCapability !== CHART_EDITOR_ADAPTER) ||
    artifact.sourceFormat !== CHART_DOCUMENT_SCHEMA ||
    !artifact.integrity.ok ||
    !artifact.access.canRead
  ) {
    throw sourceFailure(
      "invalid-revision",
      "canonical chart 的 artifact/revision identity、integrity、ACL 或 source format 不匹配。",
    );
  }
  const source = artifact.renditions.source;
  if (
    !source ||
    source.purpose !== "source" ||
    source.revisionId !== artifact.revisionId ||
    !source.digest
  ) {
    throw sourceFailure(
      "invalid-revision",
      "canonical chart 当前 revision 缺少同 revision、带 digest 的 source rendition。",
    );
  }
  const url = trustedCanonicalChartSourceUrl(source.url);
  return {
    kind: "url",
    parseAs: "canonical",
    url,
    requestUrl: url,
    trust: "canonical-artifact",
    expiresAt: source.expiresAt,
    digest: source.digest,
  };
}

async function refreshCanonicalChartSource(
  item: LibraryItem,
  signal?: AbortSignal,
  refreshRendition = refreshArtifactRendition,
  now = Date.now(),
): Promise<UrlChartSource> {
  const pinned = canonicalArtifactSource(item);
  if (!pinned || !item.artifactId || !item.revisionId || !pinned.digest) {
    throw sourceFailure(
      "expired-url",
      "canonical chart source 已过期且缺少可刷新的 artifact revision identity。",
    );
  }
  const refreshed = await refreshRendition(
    { artifactId: item.artifactId, revisionId: item.revisionId },
    "source",
    signal,
  );
  const rendition = refreshed.data;
  const expectedDigest = pinned.digest
    .trim()
    .toLowerCase()
    .replace(/^sha256:/, "");
  const actualDigest = String(rendition?.digest || "")
    .trim()
    .toLowerCase()
    .replace(/^sha256:/, "");
  if (
    !refreshed.ok ||
    !rendition ||
    rendition.revisionId !== item.revisionId ||
    actualDigest !== expectedDigest
  ) {
    throw sourceFailure(
      "expired-url",
      refreshed.error ||
        "canonical chart source 刷新后没有固定到原 revision/digest。",
    );
  }
  const url = trustedCanonicalChartSourceUrl(rendition.url);
  assertFreshChartSourceUrl(url, rendition.expiresAt, now);
  return {
    ...pinned,
    url,
    requestUrl: url,
    expiresAt: rendition.expiresAt,
    digest: rendition.digest,
  };
}

function inlineValue(item: LibraryItem): InlineChartSource["value"] | undefined {
  if (typeof item.content === "string" && item.content.trim()) {
    return item.content;
  }
  if (item.meta.chart_document !== undefined) {
    return item.meta.chart_document;
  }
  if (item.meta.chart_option !== undefined) {
    return item.meta.chart_option;
  }
  return undefined;
}

export function resolveChartSource(
  item: LibraryItem,
  now = Date.now(),
): ResolvedChartSource {
  const canonical = canonicalArtifactSource(item);
  if (canonical) {
    assertFreshChartSourceUrl(canonical.url, canonical.expiresAt, now);
    return canonical;
  }
  const manifest = normalizedManifest(item);
  const parseAs: ChartStructuredSourceKind =
    manifest.source.format === CHART_DOCUMENT_SCHEMA
      ? "canonical"
      : "manifest-option";
  if (manifest.source.kind === "url") {
    const url = trustedChartManifestSourceUrl(manifest.source.url || "");
    assertFreshChartSourceUrl(url, null, now);
    return {
      kind: "url",
      parseAs,
      url,
      requestUrl: gatewayRequestUrl(url),
      trust: "chart-editor-manifest",
      expiresAt: null,
      digest: null,
    };
  }
  const value = inlineValue(item);
  if (value === undefined) {
    throw sourceFailure(
      "missing-source",
      `${CHART_EDITOR_ADAPTER} inline manifest 缺少 content、chart_document 或 chart_option。`,
    );
  }
  return {
    kind: "inline",
    parseAs,
    value,
    origin:
      typeof item.content === "string" && item.content.trim()
        ? "content"
        : item.meta.chart_document !== undefined
          ? "chart_document"
          : "chart_option",
  };
}

async function boundedResponseBytes(response: Response): Promise<Uint8Array> {
  const declared = response.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > CHART_SOURCE_MAX_BYTES) {
    throw sourceFailure(
      "source-too-large",
      "图表结构化源超过 2MB 安全上限。",
    );
  }
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > CHART_SOURCE_MAX_BYTES) {
      throw sourceFailure(
        "source-too-large",
        "图表结构化源超过 2MB 安全上限。",
      );
    }
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > CHART_SOURCE_MAX_BYTES) {
        await reader.cancel("chart source too large");
        throw sourceFailure(
          "source-too-large",
          "图表结构化源超过 2MB 安全上限。",
        );
      }
      chunks.push(value);
    }
    const joined = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return joined;
  } catch (caught) {
    if (caught instanceof ChartSourceError) throw caught;
    throw caught;
  } finally {
    reader.releaseLock();
  }
}

async function verifyCanonicalDigest(
  bytes: Uint8Array,
  declaredDigest: string | null,
): Promise<void> {
  if (!declaredDigest) return;
  const expected = declaredDigest
    .trim()
    .toLowerCase()
    .replace(/^sha256:/, "");
  if (!/^[0-9a-f]{64}$/.test(expected) || !globalThis.crypto?.subtle) {
    throw sourceFailure(
      "source-digest",
      "canonical chart source digest 格式无效或当前环境无法校验 SHA-256。",
    );
  }
  const digestInput = new Uint8Array(bytes.byteLength);
  digestInput.set(bytes);
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    digestInput.buffer,
  );
  const actual = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (actual !== expected) {
    throw sourceFailure(
      "source-digest",
      "canonical chart source bytes 与当前 revision digest 不一致。",
    );
  }
}

function parseResolvedSource(
  source: InlineChartSource,
): ChartDocumentV1 {
  try {
    return typeof source.value === "string"
      ? chartDocumentFromJson(source.value, source.parseAs)
      : chartDocumentFromStructuredValue(source.value, source.parseAs);
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : "unknown chart option error";
    throw sourceFailure(
      "invalid-option",
      `图表 inline 结构化 option 校验失败：${message}。`,
    );
  }
}

function validateFinalUrl(source: UrlChartSource, response: Response): void {
  if (!response.url) return;
  if (source.trust === "chart-editor-manifest") {
    trustedChartManifestSourceUrl(response.url);
  } else {
    trustedCanonicalChartSourceUrl(response.url);
  }
  assertFreshChartSourceUrl(response.url, source.expiresAt);
}

export async function loadChartDocument(
  item: LibraryItem,
  options: ChartLoadOptions = {},
): Promise<ChartDocumentV1> {
  let source: ResolvedChartSource;
  let refreshedCanonical = false;
  try {
    source = resolveChartSource(item, options.now);
  } catch (caught) {
    if (
      caught instanceof ChartSourceError &&
      caught.code === "expired-url" &&
      item.artifactType === "chart" &&
      item.artifactId &&
      item.revisionId
    ) {
      source = await refreshCanonicalChartSource(
        item,
        options.signal,
        options.refreshRendition,
        options.now,
      );
      refreshedCanonical = true;
    } else {
      throw caught;
    }
  }
  if (source.kind === "inline") return parseResolvedSource(source);

  const fetcher = options.fetcher || fetch;
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) {
    controller.abort(options.signal.reason);
  } else {
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort("chart source timeout");
  }, Math.max(1, options.timeoutMs ?? CHART_SOURCE_TIMEOUT_MS));
  try {
    let response: Response;
    try {
      response = await fetcher(source.requestUrl, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
        cache: "no-store",
        redirect: "follow",
      });
    } catch (caught) {
      if (options.signal?.aborted) throw caught;
      if (timedOut) {
        throw sourceFailure(
          "source-timeout",
          "图表结构化 source URL 读取超时。",
        );
      }
      throw sourceFailure(
        "source-network",
        `图表结构化 source URL 网络读取失败：${
          caught instanceof Error ? caught.message : "unknown network error"
        }。`,
      );
    }
    if (
      !response.ok &&
      source.trust === "canonical-artifact" &&
      !refreshedCanonical &&
      [401, 403, 404, 410].includes(response.status)
    ) {
      source = await refreshCanonicalChartSource(
        item,
        controller.signal,
        options.refreshRendition,
        options.now,
      );
      refreshedCanonical = true;
      try {
        response = await fetcher(source.requestUrl, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
          cache: "no-store",
          redirect: "follow",
        });
      } catch (caught) {
        if (options.signal?.aborted) throw caught;
        throw sourceFailure(
          timedOut ? "source-timeout" : "source-network",
          timedOut
            ? "刷新后的图表结构化 source URL 读取超时。"
            : `刷新后的图表结构化 source URL 网络读取失败：${
                caught instanceof Error ? caught.message : "unknown network error"
              }。`,
        );
      }
    }
    validateFinalUrl(source, response);
    if (!response.ok) {
      const stale = response.status === 404 || response.status === 410;
      throw sourceFailure(
        stale ? "expired-url" : "source-http",
        stale
          ? `图表结构化 source URL 已失效（HTTP ${response.status}）；请刷新或重建当前 revision。`
          : `图表结构化 source 读取失败（HTTP ${response.status}）。`,
      );
    }
    const contentType = (response.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (
      contentType !== "application/json" &&
      !contentType.endsWith("+json")
    ) {
      throw sourceFailure(
        "source-type",
        `图表 source Content-Type 必须是 JSON，实际为 ${contentType || "missing"}；HTML、脚本和图片均不可作为编辑源。`,
      );
    }
    let bytes: Uint8Array;
    try {
      bytes = await boundedResponseBytes(response);
      await verifyCanonicalDigest(bytes, source.digest);
    } catch (caught) {
      if (caught instanceof ChartSourceError) throw caught;
      if (options.signal?.aborted) throw caught;
      if (timedOut) {
        throw sourceFailure(
          "source-timeout",
          "图表结构化 source URL 读取超时。",
        );
      }
      throw sourceFailure(
        "source-network",
        "图表结构化 source 响应中断或不是有效 UTF-8。",
      );
    }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw sourceFailure(
        "invalid-option",
        "图表结构化 source 不是有效 UTF-8 JSON。",
      );
    }
    try {
      return chartDocumentFromJson(text, source.parseAs);
    } catch (caught) {
      if (caught instanceof ChartSourceError) throw caught;
      throw sourceFailure(
        "invalid-option",
        `图表 URL 结构化 option 校验失败：${
          caught instanceof Error ? caught.message : "unknown chart option error"
        }。`,
      );
    }
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

"use client";

import { filenameFromContentDisposition } from "../shell/template-download";
import type { WebsiteConnectorEnvironment } from "./website-connectors";
import { WebsiteRequestError, websiteResponse } from "./website-runtime";

export type WebsiteExportKind = "code" | "database";
export type WebsiteDatabaseExportConnection = "managed" | "supabase";
export type WebsiteExportErrorCode = "unauthorized" | "not-ready" | "too-large" | "busy" | "unavailable" | "invalid-file" | "unsupported-database" | "cancelled" | "failed";
export interface WebsiteExportFile { blob: Blob; filename: string }

export class WebsiteExportError extends Error {
  constructor(readonly code: WebsiteExportErrorCode) {
    super("Website export failed");
    this.name = "WebsiteExportError";
  }
}

const DATABASE_CONNECTIONS: Record<string, WebsiteDatabaseExportConnection> = {
  ours_postgres: "managed", own_supabase: "supabase", supabase_on_behalf: "supabase",
};
export function websiteDatabaseExportConnection(connectorId: string): WebsiteDatabaseExportConnection | null {
  return Object.prototype.hasOwnProperty.call(DATABASE_CONNECTIONS, connectorId) ? DATABASE_CONNECTIONS[connectorId] : null;
}

const FORMATS = {
  code: { type: "application/zip", magic: [0x50, 0x4b, 0x03, 0x04], maximum: 26 * 1024 * 1024, filename: "website-code.zip", extension: ".zip" },
  database: { type: "application/octet-stream", magic: [0x50, 0x47, 0x44, 0x4d, 0x50], maximum: 256 * 1024 * 1024, filename: "website-database.dump", extension: ".dump" },
} as const;
const mediaType = (value: string | null) => String(value || "").split(";", 1)[0].trim().toLowerCase();
function checkAbort(signal?: AbortSignal) { if (signal?.aborted) throw new WebsiteExportError("cancelled"); }

async function fetchExport(projectId: string, suffix: string, kind: WebsiteExportKind, signal?: AbortSignal): Promise<WebsiteExportFile> {
  const format = FORMATS[kind];
  try {
    checkAbort(signal);
    const response = await websiteResponse(projectId, suffix, { method: "GET", signal, redirect: "error" }, format.type);
    checkAbort(signal);
    if (response.status !== 200 || mediaType(response.headers.get("Content-Type")) !== format.type) throw new WebsiteExportError("invalid-file");
    const length = response.headers.get("Content-Length");
    if (length && Number(length) > format.maximum) throw new WebsiteExportError("too-large");
    const blob = await response.blob();
    checkAbort(signal);
    if (blob.size > format.maximum) throw new WebsiteExportError("too-large");
    if (mediaType(blob.type) !== format.type || blob.size < format.magic.length) throw new WebsiteExportError("invalid-file");
    const prefix = new Uint8Array(await blob.slice(0, format.magic.length).arrayBuffer());
    checkAbort(signal);
    if (!format.magic.every((byte, index) => prefix[index] === byte)) throw new WebsiteExportError("invalid-file");
    const suggested = filenameFromContentDisposition(response.headers.get("Content-Disposition"));
    const filename = suggested.length > format.extension.length && suggested.length <= 180 && suggested.toLowerCase().endsWith(format.extension)
      ? suggested : format.filename;
    return { blob, filename };
  } catch (caught) {
    checkAbort(signal);
    if (caught instanceof WebsiteExportError) throw caught;
    if (caught instanceof WebsiteRequestError) {
      const status = caught.status;
      throw new WebsiteExportError(status === 401 || status === 403 ? "unauthorized"
        : status === 404 || status === 409 || status === 400 || status === 422 ? "not-ready"
        : status === 413 ? "too-large" : status === 429 ? "busy"
        : status >= 500 ? "unavailable" : "failed");
    }
    throw new WebsiteExportError("failed");
  }
}

export const websiteExportsApi = {
  code: (id: string, signal?: AbortSignal) => fetchExport(id, "/exports/code", "code", signal),
  database: (id: string, connection: WebsiteDatabaseExportConnection, environment: WebsiteConnectorEnvironment, signal?: AbortSignal) => {
    if ((connection !== "managed" && connection !== "supabase") || (environment !== "preview" && environment !== "production")) {
      return Promise.reject(new WebsiteExportError("unsupported-database"));
    }
    return fetchExport(id, "/exports/database?" + new URLSearchParams({ connection_ref: connection, environment, schema: "public" }), "database", signal);
  },
};
export type WebsiteExportsApi = typeof websiteExportsApi;

/** The verified private bytes are saved locally; the gateway URL and bearer never enter a navigation. */
export function saveWebsiteExport(file: WebsiteExportFile): void {
  let url: string | undefined;
  let link: HTMLAnchorElement | undefined;
  try {
    url = URL.createObjectURL(file.blob);
    link = document.createElement("a");
    link.href = url; link.download = file.filename;
    document.body.append(link); link.click();
    const completed = url;
    window.setTimeout(() => URL.revokeObjectURL(completed), 1000);
  } catch {
    if (url) URL.revokeObjectURL(url);
    throw new WebsiteExportError("failed");
  } finally { link?.remove(); }
}

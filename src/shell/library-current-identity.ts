"use client";

import { isDurableLibraryItem, type LibraryItem } from "./library-data";
import {
  consumeWorkspaceAction,
  type WorkspaceActionEnvelope,
} from "./workspace-actions";
import type { WorkspaceLibraryEntry } from "./workspace-library-model";

export const LIBRARY_ENTRY_QUERY_KEY = "entry";

export interface LibraryCurrentIdentity {
  artifactId: string;
  entryId: string;
}

type IdentityWriter = (search: string, href: string) => void;

let currentIdentity: LibraryCurrentIdentity | null = null;
let identityWriter: IdentityWriter | null = null;

export function getLibraryCurrentIdentity(): LibraryCurrentIdentity | null {
  return currentIdentity;
}

export function setLibraryCurrentIdentity(
  identity: LibraryCurrentIdentity | null,
): void {
  currentIdentity =
    identity && (identity.artifactId || identity.entryId)
      ? {
          artifactId: String(identity.artifactId || "").trim(),
          entryId: String(identity.entryId || "").trim(),
        }
      : null;
}

export function registerLibraryIdentityWriter(
  writer: IdentityWriter | null,
): void {
  identityWriter = writer;
}

export function resetLibraryCurrentIdentityForTests(): void {
  currentIdentity = null;
  identityWriter = null;
}

function searchParamsOf(search: string | URLSearchParams): URLSearchParams {
  return search instanceof URLSearchParams
    ? search
    : new URLSearchParams(String(search || "").replace(/^\?/, ""));
}

export function libraryCurrentIdentityFromSearch(
  search: string | URLSearchParams,
): LibraryCurrentIdentity | null {
  const params = searchParamsOf(search);
  const artifactId = (params.get("item") || "").trim();
  const entryId = (params.get(LIBRARY_ENTRY_QUERY_KEY) || "").trim();
  if (!artifactId && !entryId) return null;
  return { artifactId, entryId };
}

export function applyLibraryCurrentIdentityToSearch(
  search: string | URLSearchParams,
  identity: LibraryCurrentIdentity,
): string {
  const params = searchParamsOf(search);
  const artifactId = String(identity.artifactId || "").trim();
  const entryId = String(identity.entryId || "").trim();
  if (artifactId) params.set("item", artifactId);
  else params.delete("item");
  if (entryId) params.set(LIBRARY_ENTRY_QUERY_KEY, entryId);
  else params.delete(LIBRARY_ENTRY_QUERY_KEY);
  params.delete("mode");
  return params.toString();
}

export function replaceLibraryCurrentIdentity(
  identity: LibraryCurrentIdentity,
): { search: string; href: string } {
  setLibraryCurrentIdentity(identity);
  if (typeof window === "undefined") {
    return { search: "", href: "" };
  }
  const search = applyLibraryCurrentIdentityToSearch(
    window.location.search,
    identity,
  );
  const href = `${window.location.pathname}${search ? `?${search}` : ""}${
    window.location.hash || ""
  }`;
  window.history.replaceState(window.history.state, "", href);
  identityWriter?.(search, href);
  return { search, href };
}

export function matchLibraryIdentityEntry(
  entry: WorkspaceLibraryEntry,
  identity: LibraryCurrentIdentity,
): boolean {
  if (identity.entryId && entry.id === identity.entryId) return true;
  if (identity.artifactId && entry.id === identity.artifactId) return true;
  const item = entry.libraryItem;
  return Boolean(
    identity.artifactId &&
      item &&
      isDurableLibraryItem(item) &&
      item.artifactId === identity.artifactId,
  );
}

export function libraryIdentityAction(
  original: WorkspaceActionEnvelope | null | undefined,
  rewritten: WorkspaceActionEnvelope | null | undefined,
  entryId: string,
): WorkspaceActionEnvelope | null | undefined {
  if (!rewritten || !entryId) return rewritten;
  const artifactId = String(original?.action.itemId || rewritten.action.itemId || "").trim();
  return {
    ...rewritten,
    action: {
      ...rewritten.action,
      ...(artifactId ? { itemId: artifactId } : {}),
      entryId,
    },
  };
}

export function rememberOpenedLibraryItem(
  item: Pick<LibraryItem, "id" | "artifactId">,
  nonce?: string,
  entryId?: string,
): void {
  const artifactId = String(item.artifactId || item.id || "").trim();
  if (nonce) {
    consumeWorkspaceAction(nonce, "library-edit-intent");
    consumeWorkspaceAction(nonce, "workspace-library");
    consumeWorkspaceAction(nonce, "material-deeplink");
  }
  replaceLibraryCurrentIdentity({
    artifactId,
    entryId: String(entryId || "").trim(),
  });
}

export function resolveLibraryCurrentIdentity(
  search?: string,
): LibraryCurrentIdentity | null {
  return (
    getLibraryCurrentIdentity() ||
    libraryCurrentIdentityFromSearch(
      search ?? (typeof window === "undefined" ? "" : window.location.search),
    )
  );
}

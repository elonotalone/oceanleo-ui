"use client";

/**
 * Stable identity for the browser tab that sent a task message.
 *
 * The gateway uses this to target live workspace actions to the window that
 * initiated the turn. sessionStorage is intentionally used instead of a
 * cookie/localStorage: a new tab must get a new window id while reloads in the
 * same tab retain it.
 */
const STORAGE_KEY = "oceanleo_window_id";
const WINDOW_ID_PATTERN = /^w_[0-9a-f]{16}$/;
let memoryId: string | null = null;

function randomWindowId(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  return `w_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function getClientWindowId(): string {
  if (memoryId) return memoryId;
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored && WINDOW_ID_PATTERN.test(stored)) {
      memoryId = stored;
      return stored;
    }
    const next = randomWindowId();
    window.sessionStorage.setItem(STORAGE_KEY, next);
    memoryId = next;
    return next;
  } catch {
    // Server rendering and privacy mode can make sessionStorage unavailable.
    // Keep the identity stable for this mounted document without persisting it.
    memoryId = randomWindowId();
    return memoryId;
  }
}

export const CLIENT_WINDOW_STORAGE_KEY = STORAGE_KEY;

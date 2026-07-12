"use client";

export const HISTORY_CHANGED_EVENT = "oceanleo:history-changed";

export function notifyHistoryChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT));
  }
}

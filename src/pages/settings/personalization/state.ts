import type {
  MemoryItem,
  PersonalizationApiCode,
  PersonalizationPrefs,
} from "../../../lib/personalization-api";

export type PrefsState =
  | { status: "loading" }
  | { status: "ready"; prefs: PersonalizationPrefs }
  | { status: "failed"; code: PersonalizationApiCode };

export type MemoriesState =
  | { status: "loading" }
  | { status: "ready"; items: MemoryItem[] }
  | { status: "failed"; code: PersonalizationApiCode };

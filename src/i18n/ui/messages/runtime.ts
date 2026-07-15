import type { Locale } from "../../config";

export const UI_MESSAGES_NAMESPACE = "__oceanleo_ui";

export type UIMessageDictionary = Record<string, string>;

const EMPTY_UI_MESSAGES: UIMessageDictionary = Object.freeze({});

export function uiMessageDictionaryFrom(
  messages: Record<string, unknown> | undefined,
): UIMessageDictionary {
  const candidate = messages?.[UI_MESSAGES_NAMESPACE];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return EMPTY_UI_MESSAGES;
  }
  return candidate as UIMessageDictionary;
}

export type UIMessageModule = {
  default: UIMessageDictionary;
};

export type UIMessageLoader = (
  locale: Locale,
) => Promise<UIMessageDictionary>;

"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

import type { UIMessageDictionary } from "./runtime";

const EMPTY_UI_MESSAGES: UIMessageDictionary = Object.freeze({});
const UIMessageContext =
  createContext<UIMessageDictionary>(EMPTY_UI_MESSAGES);

export function UIMessageProvider({
  messages,
  children,
}: {
  messages: UIMessageDictionary;
  children: ReactNode;
}) {
  return (
    <UIMessageContext.Provider value={messages}>
      {children}
    </UIMessageContext.Provider>
  );
}

export function useUiMessages(): UIMessageDictionary {
  return useContext(UIMessageContext);
}

"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { GalleryEditorProps } from "./types";

const GalleryHostContext = createContext<GalleryEditorProps | null>(null);

export function GalleryHostProvider({
  docPath,
  host,
  children,
}: GalleryEditorProps & { children: ReactNode }) {
  return (
    <GalleryHostContext.Provider value={{ docPath, host }}>
      {children}
    </GalleryHostContext.Provider>
  );
}

export function useGalleryHost(): GalleryEditorProps {
  const value = useContext(GalleryHostContext);
  if (!value) {
    throw new Error("Canvas editor requires GalleryHostProvider.");
  }
  return value;
}

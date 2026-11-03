"use client";

import { lazy, Suspense, type ComponentProps } from "react";
import type { MaterialStandaloneEditor as Editor } from "./material-library-standalone";

// Shelves also live inside AgentChat's ResultCanvas. Keep their shared editor
// host a leaf: loading a shelf must not eagerly load a second Task workspace
// through MaterialStandaloneEditor → AgentChat → ResultCanvas → the shelf.
const StandaloneEditor = lazy(async () => {
  const { MaterialStandaloneEditor } = await import("./material-library-standalone");
  return { default: MaterialStandaloneEditor };
});

export function MaterialStandaloneEditor(props: ComponentProps<typeof Editor>) {
  return <Suspense fallback={null}><StandaloneEditor {...props} /></Suspense>;
}

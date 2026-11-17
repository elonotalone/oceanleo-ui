"use client";

import { ThreeDViewer } from "../../library-viewers";

/** Origin and typed material details share the Library model viewer. */
export function BayModelViewer({ src, poster, alt }: { src: string; poster?: string; alt?: string }) {
  return <ThreeDViewer item={{ key: src, id: src, source: "artifact", title: alt || "", kind: "threed",
    siteId: "", favorite: false, url: src, thumbUrl: poster, meta: {} }} />;
}

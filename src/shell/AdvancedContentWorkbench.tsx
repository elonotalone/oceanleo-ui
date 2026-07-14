"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";
import type { AdvancedContentWorkbenchProps } from "./advanced-workbench-types";
import { UnsupportedRoute } from "./advanced-routes/UnsupportedRoute";
import { WorkbenchRouteLoading } from "./advanced-routes/WorkbenchRouteLoading";
import { editorRouteFor } from "./workbench-routes";
import { WorkbenchErrorBoundary } from "./WorkbenchErrorBoundary";

export type { AdvancedContentWorkbenchProps } from "./advanced-workbench-types";

const VideoTimelineRoute = dynamic(
  () =>
    import("./advanced-routes/VideoTimelineRoute").then(
      (module) => module.VideoTimelineRoute,
    ),
  { ssr: false, loading: WorkbenchRouteLoading },
);
const AudioRoute = dynamic(
  () =>
    import("./advanced-routes/AudioRoute").then(
      (module) => module.AudioRoute,
    ),
  { ssr: false, loading: WorkbenchRouteLoading },
);
const ImageRoute = dynamic(
  () =>
    import("./advanced-routes/ImageRoute").then(
      (module) => module.ImageRoute,
    ),
  { ssr: false, loading: WorkbenchRouteLoading },
);
const OfficeRoute = dynamic(
  () =>
    import("./advanced-routes/OfficeRoute").then(
      (module) => module.OfficeRoute,
    ),
  { ssr: false, loading: WorkbenchRouteLoading },
);
const PdfRoute = dynamic(
  () =>
    import("./advanced-routes/PdfRoute").then(
      (module) => module.PdfRoute,
    ),
  { ssr: false, loading: WorkbenchRouteLoading },
);
const Model3DRoute = dynamic(
  () =>
    import("./advanced-routes/Model3DRoute").then(
      (module) => module.Model3DRoute,
    ),
  { ssr: false, loading: WorkbenchRouteLoading },
);
const RichDocRoute = dynamic(
  () =>
    import("./advanced-routes/RichDocRoute").then(
      (module) => module.RichDocRoute,
    ),
  { ssr: false, loading: WorkbenchRouteLoading },
);
const GridRoute = dynamic(
  () =>
    import("./advanced-routes/GridRoute").then(
      (module) => module.GridRoute,
    ),
  { ssr: false, loading: WorkbenchRouteLoading },
);
const DeckRoute = dynamic(
  () =>
    import("./advanced-routes/DeckRoute").then(
      (module) => module.DeckRoute,
    ),
  { ssr: false, loading: WorkbenchRouteLoading },
);
const EmbeddedRoute = dynamic(
  () =>
    import("./advanced-routes/EmbeddedRoute").then(
      (module) => module.EmbeddedRoute,
    ),
  { ssr: false, loading: WorkbenchRouteLoading },
);

export function AdvancedContentWorkbench(
  props: AdvancedContentWorkbenchProps,
) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const route = editorRouteFor(props.item);
  const routeKey = `${props.item.kind}:${props.item.id}:${props.item.url || props.item.previewUrl || ""}`;
  let editor: ReactNode;
  switch (route.type) {
    case "video-timeline":
      editor = <VideoTimelineRoute {...props} />;
      break;
    case "audio":
      editor = <AudioRoute {...props} />;
      break;
    case "image":
      editor = <ImageRoute {...props} />;
      break;
    case "office":
      editor = <OfficeRoute {...props} />;
      break;
    case "pdf":
      editor = <PdfRoute {...props} />;
      break;
    case "threed":
      editor = <Model3DRoute {...props} />;
      break;
    case "richdoc":
      editor = <RichDocRoute {...props} />;
      break;
    case "grid":
      editor = <GridRoute {...props} />;
      break;
    case "deck":
      editor = <DeckRoute {...props} />;
      break;
    case "embed":
      editor = <EmbeddedRoute {...props} />;
      break;
    case "none":
    default:
      editor = <UnsupportedRoute {...props} />;
      break;
  }

  return (
    <WorkbenchErrorBoundary
      key={routeKey}
      item={props.item}
      onClose={props.onClose}
    >
      {editor}
    </WorkbenchErrorBoundary>
  );
}

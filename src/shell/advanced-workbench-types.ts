import type { ReactNode } from "react";

import type { AppSession } from "../lib/app-session";
import type { LibraryItem } from "./library-data";

export interface AdvancedContentWorkbenchProps {
  item: LibraryItem;
  previewContent?: ReactNode;
  linkUrl?: string;
  taskId?: string | null;
  siteId?: string;
  /** @deprecated Advanced routes no longer inherit the originating GoalApp. */
  appId?: string;
  sessionId?: string | null;
  initialSession?: AppSession | null;
  mode?: "workspace" | "history";
  accent?: string;
  onClose: () => void;
}

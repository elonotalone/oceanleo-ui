import type { ReactNode } from "react";

import type { LibraryItem } from "./library-data";

export interface AdvancedContentWorkbenchProps {
  item: LibraryItem;
  previewContent?: ReactNode;
  linkUrl?: string;
  taskId?: string | null;
  siteId?: string;
  /** Originating GoalApp identity used to resolve live site materials. */
  appId?: string;
  accent?: string;
  onClose: () => void;
}

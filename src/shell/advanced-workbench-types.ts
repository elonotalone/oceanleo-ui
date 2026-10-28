import type { ReactNode } from "react";

import type { AppSession } from "../lib/app-session";
import type { LibraryItem } from "./library-data";
import type { LocalImageSaveHandler } from "./image-editor/local-save";

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
  /** Render inside the normal App library instead of opening a standalone shell. */
  embedded?: boolean;
  /** Receives the concrete library version produced by autosave. */
  onSavedItem?: (item: LibraryItem) => void;
  /**
   * Trusted native editor mounts only (never the website). When present, the
   * image editor's autosave and save button hand the real Fabric project to the
   * host and succeed only on the host's matching ok ack. This is a local save,
   * not a cloud sync. Absent = the ordinary cloud save, unchanged.
   */
  onLocalSave?: LocalImageSaveHandler;
  /** Trusted native mount: report a real document edit, not a selection change. */
  onLocalChange?: () => void;
  /**
   * Trusted native editor mounts only, together with `onLocalSave`: the host's own stored image project
   * (oceanleo.fabric-image.v1) the mount already matched to this artifact and library revision. The image
   * editor opens from it without needing the remote original; if it cannot be loaded the original opens.
   */
  localProject?: unknown;
  onClose: () => void;
}

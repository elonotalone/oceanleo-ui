"use client";

// W09B — source badge for folder cards and the detail header; D7 "unreviewed source" tag.

import { useUI } from "../../../i18n/ui/useUI";
import { KitIconShield, type Folder } from "../kit";
import { FOLDER_SOURCE_LABEL_ZH, isUnreviewedSource, type FolderSource } from "./logic";
import { IconFolderPlus, IconGithub, IconPencil, IconUpload } from "./manager-icons";

export function SourceBadge({ folder }: { folder: Pick<Folder, "source" | "origin"> }) {
  const tt = useUI();
  const label = tt(FOLDER_SOURCE_LABEL_ZH[folder.source as FolderSource] ?? String(folder.source));
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {folder.source === "official" ? (
        <KitIconShield className="h-4 w-4 shrink-0" />
      ) : folder.source === "github" ? (
        <IconGithub className="h-4 w-4 shrink-0" />
      ) : folder.source === "upload" ? (
        <IconUpload className="h-4 w-4 shrink-0" />
      ) : folder.source === "created" ? (
        <IconPencil className="h-4 w-4 shrink-0" />
      ) : (
        <IconFolderPlus className="h-4 w-4 shrink-0" />
      )}
      <span className="truncate">{label}</span>
      {isUnreviewedSource(folder) ? <UnreviewedTag /> : null}
    </span>
  );
}

export function UnreviewedTag() {
  const tt = useUI();
  return (
    <span
      data-unreviewed-source=""
      title={tt("这个技能来自上传或 GitHub，没有经过 OceanLeo 审核")}
      className="ml-1 inline-flex shrink-0 items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[11.5px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30"
    >
      {tt("未审核来源")}
    </span>
  );
}

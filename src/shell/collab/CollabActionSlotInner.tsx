"use client";

/**
 * 动作栏挂件的实体（由 `CollabActionSlot.tsx` 懒加载，所以动作栏本身不依赖 yjs、消息客户端、弹窗等）：
 * 头像串、锁提示、邀请一起改、生成回放，以及专业模式锁的接线。
 * `imEnabledHere()` 为 false（境内、未登录）时什么都不渲染、什么都不接。
 *
 * D1（2026-10-23）：第一行只剩一个 `···`。头像串和锁提示留在外面（`···` 左边）；
 * 「邀请一起改」「生成回放」登记进 `···` 菜单（plugin-chrome/more-menu-registry），
 * 点菜单项弹出的就是原来那两个窗口——邀请对话框与回放面板仍由这里画，回放面板锚在 `···` 上。
 * 不在任何 `···` 宿主里时（理论上的独立承载），退回原来的两个图标按钮，弹的也是同一个窗口。
 */
import { useEffect, useId, useMemo, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { useToast } from "../../ui/Toast";
import { useImEnabled } from "../../lib/im/client";
import type { PluginThemeId } from "../plugin-theme";
import {
  usePluginMoreMenuEntries,
  usePluginMoreMenuRegistry,
  type PluginMoreMenuEntry,
} from "../plugin-chrome/more-menu-registry";
import {
  GenerateReplayButton,
  GenerateReplayPanel,
} from "../replay/work/GenerateReplayButton";
import type { EditorCollabBinding } from "./index";
import { CollabInviteButton, CollabInviteDialog } from "./CollabInviteButton";
import { CollabLockBanner } from "./CollabLockBanner";
import { CollabPresenceBar } from "./CollabPresenceBar";
import { attachProModeLock } from "./pro-mode-lock";

const NO_ENTRIES: readonly PluginMoreMenuEntry[] = [];

export function CollabActionSlotInner({
  collab,
  pluginThemeId,
}: {
  collab: EditorCollabBinding | undefined;
  pluginThemeId: PluginThemeId | null | undefined;
}) {
  const tt = useUI();
  const toast = useToast();
  const enabled = useImEnabled();
  const room = collab?.room ?? null;
  const artifact = collab?.artifact ?? null;
  const ownerId = `collab:${useId()}`;
  const registry = usePluginMoreMenuRegistry();
  const [dialog, setDialog] = useState<"invite" | "replay" | null>(null);

  useEffect(() => {
    if (!enabled || !room || !pluginThemeId) return undefined;
    return attachProModeLock({
      pluginId: pluginThemeId,
      room,
      onBlocked: (verdict) => {
        if (verdict.reason === "viewer") toast.info(tt("你只能查看这个作品，不能修改"));
        else if (verdict.holder) {
          toast.info(tt("{name} 正在专业模式中编辑，等他退出后再进入", { name: verdict.holder.name || tt("协作者") }));
        } else toast.info(tt("暂时进不了专业模式，请稍后再试"));
      },
    });
    // tt / toast 每次渲染可能是新引用，不进依赖；接线只跟房间与插件走。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, room, pluginThemeId]);

  const inviteLabel = tt("邀请一起改");
  const replayLabel = tt("生成回放");
  const entries = useMemo<readonly PluginMoreMenuEntry[]>(
    () =>
      enabled && collab && artifact
        ? [
            {
              id: "invite",
              label: inviteLabel,
              icon: "add",
              order: 10,
              onSelect: () => setDialog("invite"),
            },
            {
              id: "replay",
              label: replayLabel,
              icon: "history",
              order: 20,
              onSelect: () => setDialog("replay"),
            },
          ]
        : NO_ENTRIES,
    [artifact, collab, enabled, inviteLabel, replayLabel],
  );
  const anchorRef = usePluginMoreMenuEntries(ownerId, entries);

  if (!enabled || !collab) return null;
  const replayResource = artifact
    ? {
        kind: "artifact" as const,
        id: artifact.id,
        title: artifact.title,
        editorKind: artifact.editorKind,
      }
    : null;
  return (
    <div data-global-row-slot="collab" data-collab-slot className="flex min-w-0 items-center gap-1">
      <CollabPresenceBar room={room} />
      <CollabLockBanner room={room} />
      {registry ? (
        <>
          {artifact && dialog === "invite" ? (
            <CollabInviteDialog
              room={room}
              artifact={artifact}
              onClose={() => setDialog(null)}
            />
          ) : null}
          {replayResource && anchorRef ? (
            <GenerateReplayPanel
              resource={replayResource}
              open={dialog === "replay"}
              anchorRef={anchorRef}
              onClose={() => setDialog(null)}
            />
          ) : null}
        </>
      ) : (
        <>
          {artifact ? (
            <CollabInviteButton iconOnly room={room} artifact={artifact} />
          ) : null}
          {replayResource ? (
            <GenerateReplayButton iconOnly resource={replayResource} />
          ) : null}
        </>
      )}
    </div>
  );
}

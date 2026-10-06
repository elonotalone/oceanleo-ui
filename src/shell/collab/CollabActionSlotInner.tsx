"use client";

/**
 * 动作栏挂件的实体（由 `CollabActionSlot.tsx` 懒加载，所以动作栏本身不依赖 yjs、消息客户端、弹窗等）：
 * 头像串、锁提示、邀请一起改、生成回放，以及专业模式锁的接线。
 * `imEnabledHere()` 为 false（境内、未登录）时什么都不渲染、什么都不接。
 */
import { useEffect } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { useToast } from "../../ui/Toast";
import { useImEnabled } from "../../lib/im/client";
import type { PluginThemeId } from "../plugin-theme";
import { GenerateReplayButton } from "../replay/work/GenerateReplayButton";
import type { EditorCollabBinding } from "./index";
import { CollabInviteButton } from "./CollabInviteButton";
import { CollabLockBanner } from "./CollabLockBanner";
import { CollabPresenceBar } from "./CollabPresenceBar";
import { attachProModeLock } from "./pro-mode-lock";

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

  if (!enabled || !collab) return null;
  const artifact = collab.artifact;
  return (
    <div data-global-row-slot="collab" data-collab-slot className="flex min-w-0 items-center gap-1">
      <CollabPresenceBar room={room} />
      <CollabLockBanner room={room} />
      {artifact ? <CollabInviteButton room={room} artifact={artifact} /> : null}
      {artifact ? (
        <GenerateReplayButton
          resource={{ kind: "artifact", id: artifact.id, title: artifact.title, editorKind: artifact.editorKind }}
        />
      ) : null}
    </div>
  );
}

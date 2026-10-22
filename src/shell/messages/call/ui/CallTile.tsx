"use client";

// 一格参与者：开了摄像头就是画面（attachVideo 绑定），否则头像。说话 = 亮框（叠在最上层，不挪位置、不改顺序）；
// 静音、仅对我静音、正在重连各有标记；放大视图里每格还有信号格和「更多」（参与者菜单）。
import { useCallback, useRef, useState } from "react";
import { useUI } from "../../../../i18n/ui/useUI";
import { PersonAvatar } from "../../groups/GroupAvatar";
import { NetworkBars } from "../diagnostics";
import { callActions, type CallParticipantView } from "../engine";
import { CallParticipantMenu } from "./CallParticipantMenu";
import { IconMicOff, IconMore, IconVolumeOff } from "./icons";
import { DOCK_TILE_PX } from "./layout";

/** 说话亮框：叠在画面上面的内描边（翠绿），不改变格子大小与位置。 */
export const SPEAKING_RING_SHADOW = "inset 0 0 0 3px #34d399";

export type CallTileVariant = "dock" | "stage" | "rail";

export interface CallTileProps {
  participant: CallParticipantView;
  variant: CallTileVariant;
  /** 自己开了「仅语音」：别人的画面一律不画（自己的预览照常）。 */
  audioOnly: boolean;
  narrow?: boolean;
}

function avatarSize(variant: CallTileVariant, narrow: boolean): number {
  if (variant === "dock") return 34;
  if (variant === "rail") return narrow ? 34 : 44;
  return narrow ? 56 : 72;
}

export function CallTile({ participant, variant, audioOnly, narrow = false }: CallTileProps) {
  const tt = useUI();
  const [menuOpen, setMenuOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement | null>(null);
  const { participantId } = participant;
  const showVideo = participant.camera && (participant.isMe || !audioOnly);
  // 同一个参与者同一路画面只绑一次：回调身份只随参与者变，避免每次渲染解绑再绑。
  const attachCamera = useCallback(
    (element: HTMLVideoElement | null) => callActions.attachVideo(element, participantId, "camera"),
    [participantId],
  );

  const name = participant.isMe ? tt("{name}（我）", { name: participant.displayName }) : participant.displayName;
  const states = [
    participant.mic ? null : tt("已静音"),
    participant.locallyMuted ? tt("已对我静音") : null,
    participant.speaking ? tt("正在说话") : null,
    participant.connection === "reconnecting" ? tt("正在重连") : null,
  ].filter(Boolean);
  const compact = variant === "dock";
  const withMenu = !compact && !participant.isMe;

  function closeMenu() {
    setMenuOpen(false);
    // 举报框关掉、或选了一项之后，焦点没处去就回到「更多」按钮。
    window.requestAnimationFrame(() => {
      const active = document.activeElement;
      if (!active || active === document.body) moreRef.current?.focus();
    });
  }

  return (
    <li
      data-call-tile={variant}
      data-participant-id={participantId}
      data-speaking={participant.speaking ? "true" : "false"}
      data-mic={participant.mic ? "on" : "off"}
      className="relative min-h-0 min-w-0 list-none overflow-hidden rounded-xl bg-neutral-200 dark:bg-neutral-800"
      style={
        compact
          ? { width: DOCK_TILE_PX, height: DOCK_TILE_PX, flex: "0 0 auto" }
          : variant === "rail"
            ? narrow
              ? { height: "100%", aspectRatio: "1 / 1", flex: "0 0 auto" }
              : { width: "100%", aspectRatio: "16 / 9", flex: "0 0 auto" }
            : undefined
      }
      title={compact ? [name, ...states].join(" · ") : undefined}
    >
      {showVideo ? (
        <video
          ref={attachCamera}
          autoPlay
          playsInline
          muted
          data-call-video="camera"
          className="absolute inset-0 h-full w-full object-cover"
          // 自己的预览照镜子习惯左右翻转；别人的不翻。
          style={participant.isMe ? { transform: "scaleX(-1)" } : undefined}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <PersonAvatar name={participant.displayName} src={participant.avatarUrl} seed={participant.userId} size={avatarSize(variant, narrow)} />
        </div>
      )}

      {participant.connection === "reconnecting" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-[11px] font-medium text-white">
          {compact ? null : tt("正在重连")}
        </div>
      ) : null}

      {/* 读屏读这一行：名字 + 状态。小窗的格子太小，名字只放在 title 与读屏文字里。 */}
      <span className="sr-only">{[name, ...states].join("，")}</span>

      {compact ? (
        participant.mic && !participant.locallyMuted ? null : (
          <span aria-hidden="true" className="absolute bottom-1 right-1 flex items-center rounded-md bg-black/55 p-0.5 text-white">
            {participant.mic ? <IconVolumeOff size={11} /> : <IconMicOff size={11} />}
          </span>
        )
      ) : (
        <div aria-hidden="true" className="absolute bottom-1.5 left-1.5 flex max-w-[85%] items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] text-white">
          {participant.mic ? null : <IconMicOff size={12} />}
          {participant.locallyMuted ? <IconVolumeOff size={12} /> : null}
          <span className="truncate">{name}</span>
        </div>
      )}

      {compact ? null : (
        <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
          <span className="flex items-center rounded-md bg-black/55 px-1 py-0.5 text-white">
            <NetworkBars level={participant.network} />
          </span>
        </div>
      )}

      {withMenu ? (
        <>
          <button
            ref={moreRef}
            type="button"
            data-call-tile-menu={participantId}
            aria-label={tt("{name} 的更多操作", { name: participant.displayName })}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="absolute bottom-1.5 right-1.5 flex size-7 items-center justify-center rounded-md bg-black/55 text-white hover:bg-black/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500"
          >
            <IconMore size={16} />
          </button>
          <CallParticipantMenu participantId={participantId} open={menuOpen} onClose={closeMenu} anchorRef={moreRef} />
        </>
      ) : null}

      {/* 说话亮框放在最后、盖在画面上面：只亮不挪。 */}
      {participant.speaking ? (
        <span
          aria-hidden="true"
          data-speaking-ring
          className="pointer-events-none absolute inset-0 rounded-xl"
          style={{ boxShadow: SPEAKING_RING_SHADOW }}
        />
      ) : null}
    </li>
  );
}

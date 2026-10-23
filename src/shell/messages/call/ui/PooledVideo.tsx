"use client";

// 格子里放画面的位置：自己只渲染一个空的宿主 <div>，挂载时把池里那个 <video> 挪进来，卸载时挪走但不解绑
// （见 video-pool.ts，返工 A-34 / D3）。同一次提交里旧格子卸、新格子挂，元素在同一个任务里离开又回到文档，
// 浏览器不会暂停它；真的离开过一阵（仅语音、翻页、对方关摄像头）再回来，补一次 play()。
import { useLayoutEffect, useRef } from "react";
import { acquireVideo, resumeIfPaused, type VideoTrack } from "./video-pool";

export interface PooledVideoProps {
  participantId: string;
  track: VideoTrack;
  /** 自己的摄像头预览左右翻转。 */
  mirror?: boolean;
  /** 拿到 / 交还这个 <video>（共享主位要把它交给 W09 的控制层）。 */
  onElement?(el: HTMLVideoElement | null): void;
}

export function PooledVideo({ participantId, track, mirror = false, onElement }: PooledVideoProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const onElementRef = useRef(onElement);
  useLayoutEffect(() => {
    onElementRef.current = onElement;
  });

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const el = acquireVideo(participantId, track, mirror);
    if (el.parentNode !== host) host.appendChild(el);
    resumeIfPaused(el);
    onElementRef.current?.(el);
    return () => {
      // 只从这个格子里拿走；绑定留着，下一个格子接着用同一个元素。
      if (el.parentNode === host) host.removeChild(el);
      onElementRef.current?.(null);
    };
  }, [participantId, track, mirror]);

  return <div ref={hostRef} aria-hidden="true" data-call-video-host={track} className="absolute inset-0" />;
}

"use client";

import { useEffect, useState } from "react";

import { refreshArtifactRendition } from "../artifact-client";
import { isDurableLibraryItem, type LibraryItem } from "../library-data";
import {
  loadAudioProjectFromUrl,
  renderAudioProjectPlayable,
} from "./audio-project-source";

export interface AudioProjectPlayback {
  /** `idle`：不需要（或不可能）还原；`failed` 时调用方落到诚实说明。 */
  status: "idle" | "loading" | "ready" | "failed";
  /** `ready` 时是可直接交给 `<audio>` 的 blob 地址。 */
  src: string;
  error: string;
}

const IDLE: AudioProjectPlayback = { status: "idle", src: "", error: "" };

/**
 * 编辑器存下的 revision 只有工程（source/editor_manifest）和位图预览、没有 `full`
 * 音频 rendition。这里按工程引用的基础音频把它还原成能播的字节，让这种存量
 * revision 也能放出声音，而不是只摆一张图。
 *
 * `enabled` 为假（已有可播 rendition、非音频、非 durable 条目）时什么都不做。
 */
export function useAudioProjectPlayback(
  item: LibraryItem,
  enabled: boolean,
): AudioProjectPlayback {
  const durable = isDurableLibraryItem(item);
  const artifactId = durable ? item.artifactId : "";
  const revisionId = durable ? item.revisionId : "";
  const active = enabled && Boolean(artifactId && revisionId);
  const [state, setState] = useState<AudioProjectPlayback>(IDLE);

  useEffect(() => {
    if (!active) {
      setState(IDLE);
      return;
    }
    const controller = new AbortController();
    let objectUrl = "";
    setState({ status: "loading", src: "", error: "" });
    void (async () => {
      try {
        const manifest = await refreshArtifactRendition(
          { artifactId, revisionId },
          "editor_manifest",
          controller.signal,
        );
        if (!manifest.ok || !manifest.data?.url) {
          throw new Error(manifest.error || "没有可读取的音频工程");
        }
        const project = await loadAudioProjectFromUrl(
          manifest.data.url,
          controller.signal,
        );
        const blob = await renderAudioProjectPlayable(
          project,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ status: "ready", src: objectUrl, error: "" });
      } catch (caught) {
        if (controller.signal.aborted) return;
        setState({
          status: "failed",
          src: "",
          error: caught instanceof Error ? caught.message : "音频还原失败",
        });
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [active, artifactId, revisionId]);

  if (!active) return IDLE;
  // The effect has not run yet on the first active render; never flash the
  // "no playable audio" note for that one frame.
  return state.status === "idle"
    ? { status: "loading", src: "", error: "" }
    : state;
}

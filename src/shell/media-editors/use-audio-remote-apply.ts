"use client";

/**
 * 多人同改下音频的两个「套用」入口（F07）。和 `restoreRecovery`（恢复本地草稿，会清撤销栈、标未保存、弹提示）分开：
 * - `applyRemoteProject`：对方的改动。重放操作日志，但不动我的撤销栈、不标「未保存」、不加改动版本号（所以不触发自动保存）、
 *   不报错提示；波形用「保住播放位置和选区」的方式重载。
 * - `applyLocalProject`：「只撤自己」撤销 / 重做算出来的我自己的改动。标未保存、走自动保存，但不清撤销栈（栈在协同层里）。
 * 对方的改动到达时我正在做一条编辑，就等它做完（最多 15 秒）再套；撤销 / 重做遇到这种情况直接放弃这一次。
 */
import { useCallback, useRef, type MutableRefObject } from "react";

import { importMediaUrl, fetchMediaBlob, isFirstPartyMediaUrl } from "../../lib/media-proxy";
import type { UITranslate } from "../../i18n/ui/useUI";
import type { LibraryItem } from "../library-data";
import type { AudioEditOperation } from "./audio-operations";
import {
  applyAudioOperation,
  audioBufferBytes,
  encodeWav,
  MAX_AUDIO_FILE_BYTES,
  MAX_DECODED_AUDIO_BYTES,
  validAudioProject,
} from "./audio-workbench-utils";
import { assertBlobSource } from "./source-integrity.mjs";

export interface AudioRemoteApplyOptions {
  item: LibraryItem;
  siteId: string;
  requiresExistingSource: boolean;
  bufferRef: MutableRefObject<AudioBuffer | null>;
  sourceUrlRef: MutableRefObject<string>;
  operationsRef: MutableRefObject<AudioEditOperation[]>;
  /** 一条编辑正在做；对方的改动等它做完再套。 */
  mutatingRef: MutableRefObject<boolean>;
  /** 对方的改动正在回灌；这期间本端新编辑先不接。 */
  remoteReplayRef: MutableRefObject<boolean>;
  revisionRef: MutableRefObject<number>;
  /** 重载波形并保住播放位置与选区。 */
  reloadWaveformKeepView: (next: AudioBuffer) => Promise<void>;
  /** 对方的改动落到编辑器上后调用（让协同层重新读本端状态）。 */
  bumpContent: () => void;
  setError: (value: string) => void;
  setSavedUrl: (value: string) => void;
  setDirty: (value: boolean) => void;
  tt: UITranslate;
}

const REMOTE_WAIT_MS = 15_000;

export function useAudioRemoteApply({
  item,
  siteId,
  requiresExistingSource,
  bufferRef,
  sourceUrlRef,
  operationsRef,
  mutatingRef,
  remoteReplayRef,
  revisionRef,
  reloadWaveformKeepView,
  bumpContent,
  setError,
  setSavedUrl,
  setDirty,
  tt,
}: AudioRemoteApplyOptions) {
  // 最近一次解码出来的「源文件」：对方每改一处都要重放，源没换就不重新下载解码。
  const decodedSourceRef = useRef<{ url: string; buffer: AudioBuffer } | null>(null);

  const replay = useCallback(
    async (payload: unknown, mode: "remote" | "local"): Promise<boolean> => {
      const quiet = mode === "remote";
      if (!validAudioProject(payload)) return false;
      const project = payload;
      if (requiresExistingSource && !project.sourceUrl.trim()) return false;
      // 本端有一条编辑正在做：对方的改动等它落定再套上去（否则两边互相盖）；撤销 / 重做直接放弃这一次。
      const waitUntil = Date.now() + (quiet ? REMOTE_WAIT_MS : 0);
      while (mutatingRef.current && Date.now() < waitUntil) {
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      if (mutatingRef.current) return false;
      remoteReplayRef.current = true;
      let context: AudioContext | null = null;
      try {
        context = new AudioContext();
        const durableUrl = project.sourceUrl
          ? isFirstPartyMediaUrl(project.sourceUrl)
            ? project.sourceUrl
            : await importMediaUrl(project.sourceUrl, {
                kind: "audio",
                siteId: siteId || "audio",
                title: item.title,
                registerAsset: false,
              })
          : "";
        let decoded: AudioBuffer;
        const cached = decodedSourceRef.current;
        if (durableUrl && cached && cached.url === durableUrl) {
          decoded = cached.buffer;
        } else {
          const blob = durableUrl
            ? await fetchMediaBlob(durableUrl, { maxBytes: MAX_AUDIO_FILE_BYTES })
            : encodeWav(new AudioBuffer({ length: 44_100, numberOfChannels: 1, sampleRate: 44_100 }));
          await assertBlobSource(blob, "audio");
          try {
            decoded = await context.decodeAudioData((await blob.arrayBuffer()).slice(0));
          } catch {
            throw new Error(tt("恢复源虽有正确音频签名，但没有浏览器可解码的音轨"));
          }
          if (durableUrl) decodedSourceRef.current = { url: durableUrl, buffer: decoded };
        }
        for (const operation of project.operations) {
          decoded = applyAudioOperation(decoded, operation);
        }
        if (audioBufferBytes(decoded) > MAX_DECODED_AUDIO_BYTES) return false;
        await reloadWaveformKeepView(decoded);
        bufferRef.current = decoded;
        sourceUrlRef.current = durableUrl;
        operationsRef.current = [...project.operations];
        if (mode === "local") {
          revisionRef.current += 1;
          setDirty(true);
          setSavedUrl("");
        }
        bumpContent();
        return true;
      } catch (caught) {
        if (!quiet) {
          setError(caught instanceof Error ? caught.message : tt("音频本地草稿恢复失败"));
        }
        return false;
      } finally {
        remoteReplayRef.current = false;
        await context?.close().catch(() => undefined);
      }
    },
    [
      bufferRef,
      bumpContent,
      item.title,
      mutatingRef,
      operationsRef,
      reloadWaveformKeepView,
      remoteReplayRef,
      requiresExistingSource,
      revisionRef,
      setDirty,
      setError,
      setSavedUrl,
      siteId,
      sourceUrlRef,
      tt,
    ],
  );

  const applyRemoteProject = useCallback(
    (project: unknown): Promise<boolean> => replay(project, "remote"),
    [replay],
  );
  const applyLocalProject = useCallback(
    (project: unknown): Promise<boolean> => replay(project, "local"),
    [replay],
  );
  return { applyRemoteProject, applyLocalProject };
}

import { useCallback, useEffect, useRef, type MutableRefObject } from "react";

import { uploadFile } from "../../lib/database";
import {
  importMediaUrl,
  isFirstPartyMediaUrl,
} from "../../lib/media-proxy";
import type { UITranslate } from "../../i18n/ui/useUI";
import {
  saveFileToLibrary,
  saveProjectWorkingHead,
  type PersistedEditorVersion,
} from "../doc-editors/doc-io";
import { isDurableLibraryItem, type LibraryItem } from "../library-data";
import { buildAudioDelivery } from "./audio-delivery";
import {
  artifactAccessIdentity,
  fetchAudioProjectSourceBlob,
} from "./audio-project-source";
import { artifactSaveStepMessage } from "../doc-editors/artifact-save-contract";
import { renderAudioWaveformPng } from "../doc-editors/editor-preview-raster";
import type { AudioEditOperation } from "./audio-operations";
import {
  auditAudioLicenseLock,
  audioLicenseMetadata,
  AUDIO_LICENSE_CODES,
  type AudioAttributionEntry,
} from "./audio-project-carrier";
import type { AudioProjectData } from "./audio-workbench-state";
import {
  applyAudioOperation,
  audioBufferBytes,
  AUDIO_PROJECT_SCHEMA,
  encodeWav,
  MAX_AUDIO_FILE_BYTES,
  MAX_DECODED_AUDIO_BYTES,
  validAudioProject,
} from "./audio-workbench-utils";
import { assertBlobSource } from "./source-integrity.mjs";

const LICENSE_URLS: Record<string, string> = {
  CC0: "https://creativecommons.org/publicdomain/zero/1.0/",
  "CC-BY": "https://creativecommons.org/licenses/by/4.0/",
  "OCEANLEO-AIGEN": "https://oceanleo.com/licenses/aigen",
};

/**
 * 从素材元数据抽出署名条目（§1.3 / §7 A8–A9）。`license_code` 是既有键
 * （`artifact-contract.ts:1765`、`use-pdf-workbench.ts:114` 都读它）。
 * 抽不出许可时不编一个 —— 空署名比假署名安全，完备判据会把它判为不达标。
 */
function audioAttributionFromItem(item: LibraryItem): AudioAttributionEntry[] {
  const rawCode = String(item.meta.license_code || "").trim();
  if (!rawCode) return [];
  const code = rawCode.toUpperCase();
  const known = AUDIO_LICENSE_CODES.find((entry) => entry === code);
  const licenseUrl =
    String(item.meta.license_url || "").trim() || LICENSE_URLS[code] || "";
  if (!licenseUrl.startsWith("https://")) return [];
  const text = String(item.meta.attribution || item.title || "").trim();
  if (text.length < 2) return [];
  return [
    {
      text: text.slice(0, 200),
      // 未知许可原样带出，交给 auditAudioLicenseLock 判 —— 静默改写成 CC0
      // 才是真的危险。
      licenseCode: (known ?? rawCode) as AudioAttributionEntry["licenseCode"],
      licenseUrl,
    },
  ];
}

/**
 * 编辑停下多久之后才去渲染并上传完整音频（`full` 交付物）。自动保存只存工程、
 * 轻且频繁；一份 WAV 动辄几十 MB，不能跟着每一次防抖保存走。
 */
export const AUDIO_DELIVERY_IDLE_MS = 8_000;

interface AudioPersistenceOptions {
  item: LibraryItem;
  /** 测试可缩短；生产用 `AUDIO_DELIVERY_IDLE_MS`。 */
  deliveryIdleMs?: number;
  siteId: string;
  requiresExistingSource: boolean;
  bufferRef: MutableRefObject<AudioBuffer | null>;
  sourceUrlRef: MutableRefObject<string>;
  operationsRef: MutableRefObject<AudioEditOperation[]>;
  undoOperationsRef: MutableRefObject<AudioEditOperation[][]>;
  redoOperationsRef: MutableRefObject<AudioEditOperation[][]>;
  workingHeadUrlRef: MutableRefObject<string>;
  undoRef: MutableRefObject<AudioBuffer[]>;
  redoRef: MutableRefObject<AudioBuffer[]>;
  revisionRef: MutableRefObject<number>;
  savingRef: MutableRefObject<boolean>;
  reloadWaveform: (next: AudioBuffer) => Promise<void>;
  setSaving: (value: boolean) => void;
  setError: (value: string) => void;
  setSavedUrl: (value: string) => void;
  setDirty: (value: boolean) => void;
  setCanUndo: (value: boolean) => void;
  setCanRedo: (value: boolean) => void;
  tt: UITranslate;
}

export function useAudioPersistence({
  item,
  siteId,
  requiresExistingSource,
  bufferRef,
  sourceUrlRef,
  operationsRef,
  undoOperationsRef,
  redoOperationsRef,
  workingHeadUrlRef,
  undoRef,
  redoRef,
  revisionRef,
  savingRef,
  reloadWaveform,
  setSaving,
  setError,
  setSavedUrl,
  setDirty,
  setCanUndo,
  setCanRedo,
  tt,
  deliveryIdleMs = AUDIO_DELIVERY_IDLE_MS,
}: AudioPersistenceOptions) {
  /**
   * 交付物节流（每个「稳定下来」的 revision 至多渲一次）：
   *   - 自动保存 / 关闭冲刷一律只存工程（有编辑时）；
   *   - 一次成功的工程保存后起一个空闲计时器；`deliveryIdleMs` 内没有新编辑，
   *     就把 `deliveryDueRef` 置位并把编辑器标成「有改动」，让既有的自动保存
   *     通路再来一次——这一次才渲染并上传交付物；
   *   - 期间任何新编辑都会让这次渲染作废（`isSuperseded`），下一次保存重新计时；
   *   - 未编辑（原样带原始音频，几 MB）不受节流。
   * 两次保存之间的工程-only revision 由查看器按工程还原播放。
   */
  const deliveryDueRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(idleTimerRef.current), []);

  const save = useCallback(async (): Promise<PersistedEditorVersion | null> => {
    const source = bufferRef.current;
    if (!source || savingRef.current) return null;
    const savingRevision = revisionRef.current;
    clearTimeout(idleTimerRef.current);
    const deliveryWasDue = deliveryDueRef.current;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const title = `${item.title || tt("音频")}-${tt("编辑版")}`;
      const attribution = audioAttributionFromItem(item);
      // 稳定引用：签名地址 5 分钟后失效，重开 / 查看靠它重新换发。
      const sourceRef = artifactAccessIdentity(sourceUrlRef.current);
      const project: AudioProjectData = {
        sourceUrl: sourceUrlRef.current,
        ...(sourceRef ? { sourceRef } : {}),
        operations: structuredClone(operationsRef.current),
        ...(attribution.length ? { attribution } : {}),
      };
      if (!validAudioProject(project)) {
        throw new Error(
          tt("音频工程操作日志无效或超过安全上限，保存已阻止；当前状态仍保留"),
        );
      }
      /**
       * §1.3 许可锁。CC-BY-SA 件 MUST NOT 进 v1 组合产物 —— 平台还没有
       * 「署名与许可随产物走」的全链机制，用户导出即断链，SA 义务违约由
       * 平台承担。这里在落库前就拦，而不是等 catalog 发布时整包被拒。
       */
      const licenseLock = auditAudioLicenseLock(project);
      if (!licenseLock.ok) {
        const first = licenseLock.violations[0];
        throw new Error(
          tt(
            `音频许可锁拦截：${first.path} 的 ${first.licenseCode} 带 ${first.obligations.join(" + ")} 义务，v1 组合产物不接受`,
          ),
        );
      }
      const licenseMeta = audioLicenseMetadata(project);
      const saveInput = {
        item,
        siteId,
        fallbackSite: "audio",
        title,
        mediaType: "audio" as const,
        kind: "audio",
        idempotencyKey: `audio:${item.id}:${savingRevision}`,
        workingHeadUrl: workingHeadUrlRef.current,
        meta: {
          editor: "audio-v3",
          editor_capability: "audio-editor",
          audio_source_url: project.sourceUrl,
          audio_operation_count: project.operations.length,
          // §1.3 / §7 A9：许可义务在产物元数据里可见，随产物传递。
          audio_license_lock: licenseMeta.license_lock,
          audio_license_share_alike: licenseMeta.share_alike,
          audio_license_codes: licenseMeta.licenses,
          audio_license_obligations: licenseMeta.obligations,
          audio_attribution: licenseMeta.attribution,
          audio_attribution_text: licenseMeta.attribution_text,
        },
        project: {
          schema: AUDIO_PROJECT_SCHEMA,
          data: project,
        },
        editorManifest: {
          id: "audio-editor",
          format: AUDIO_PROJECT_SCHEMA,
        },
        // The waveform is the displayable cover; the playable audio travels as
        // the `full` delivery (see `buildAudioDelivery`) whenever one can be built.
        createPreview: () => renderAudioWaveformPng(bufferRef.current),
        /**
         * `oceanleo.audio-project.v1` is itself an accepted `source.format`
         * (matrix §3.2 row 11), so a project-only save can still publish a
         * revision. It never did before because `SaveProjectWorkingHeadInput`
         * omitted `artifactRevision` outright.
         */
        artifactRevision: {
          artifactType: "audio",
          editor: "audio-v3",
          provenance: {
            editorRevision: savingRevision,
            operationCount: project.operations.length,
          },
        },
      };
      /**
       * 已有 typed identity 的音频 revision 必须带一个能播、能下载的 `full`
       * 交付物：未编辑就原样带上原始音频，有编辑就把当前混音渲成 WAV。只存
       * 工程 JSON 的 revision（6cf6ec0a rev 2）在查看器里没有任何音频可放。
       * 渲出来过大（见 buildAudioDelivery）时退回只存工程，不让保存失败。
       */
      const durableAudio =
        isDurableLibraryItem(item) && item.artifactType === "audio";
      const delivery =
        durableAudio &&
        (project.operations.length === 0 || deliveryWasDue)
          ? await buildAudioDelivery({
              title,
              buffer: source,
              operationCount: project.operations.length,
              sourceUrl: project.sourceUrl,
              sourceRef,
              isSuperseded: () => revisionRef.current !== savingRevision,
            })
          : null;
      const saved = delivery
        ? await saveFileToLibrary({
            ...saveInput,
            file: delivery.file,
            sourceFormat: delivery.sourceFormat,
            sourceMediaType: delivery.sourceMediaType,
            meta: {
              ...saveInput.meta,
              audio_delivery_origin: delivery.origin,
            },
          })
        : await saveProjectWorkingHead(saveInput);
      if (!saved.ok) {
        throw new Error(
          saved.error || artifactSaveStepMessage("revision-publish", ""),
        );
      }
      workingHeadUrlRef.current = saved.url;
      setSavedUrl(saved.url);
      if (revisionRef.current === savingRevision) setDirty(false);
      if (deliveryWasDue) deliveryDueRef.current = false;
      if (durableAudio && !delivery && !deliveryWasDue) {
        // Project-only revision of an edited item: render the playable
        // delivery once the edits have been quiet for `deliveryIdleMs`.
        idleTimerRef.current = setTimeout(() => {
          if (revisionRef.current !== savingRevision || savingRef.current) {
            return;
          }
          deliveryDueRef.current = true;
          revisionRef.current += 1;
          setDirty(true);
        }, deliveryIdleMs);
      }
      return {
        url: saved.url,
        versionId: saved.versionId,
        projectUrl: saved.projectUrl,
        projectSchema: saved.projectSchema,
        artifactId: saved.artifactId,
        revisionId: saved.revisionId,
        previousRevisionId: saved.previousRevisionId,
        item: saved.item,
      };
    } catch (caught) {
      setError(
        artifactSaveStepMessage(
          "revision-publish",
          caught instanceof Error ? caught.message : caught,
        ),
      );
      return null;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [
    bufferRef,
    item,
    operationsRef,
    revisionRef,
    savingRef,
    setDirty,
    setError,
    setSavedUrl,
    setSaving,
    siteId,
    sourceUrlRef,
    tt,
    workingHeadUrlRef,
    deliveryIdleMs,
  ]);

  const captureRecovery = useCallback(
    (): AudioProjectData | null =>
      bufferRef.current
        ? {
            sourceUrl: sourceUrlRef.current,
            operations: structuredClone(operationsRef.current),
          }
        : null,
    [bufferRef, operationsRef, sourceUrlRef],
  );

  const restoreRecovery = useCallback(
    async (payload: unknown): Promise<boolean> => {
      let project: AudioProjectData;
      if (validAudioProject(payload)) {
        project = payload;
      } else if (
        payload instanceof Blob &&
        payload.size <= MAX_AUDIO_FILE_BYTES
      ) {
        const recoveredFormat = await assertBlobSource(payload, "audio");
        const extension = recoveredFormat === "mp4" ? "m4a" : recoveredFormat;
        const recoveredMime =
          recoveredFormat === "mp3"
            ? "audio/mpeg"
            : recoveredFormat === "mp4"
              ? "audio/mp4"
              : `audio/${recoveredFormat}`;
        const uploaded = await uploadFile(
          new File([payload], `${item.title || "audio"}-recovery.${extension}`, {
            type: recoveredMime,
          }),
          {
            siteId: siteId || "audio",
            title: `${item.title || "audio"}-recovery`,
            registerAsset: false,
            idempotencyKey: `audio-recovery:${item.id}:${payload.size}`,
          },
        );
        const url = uploaded.data?.file?.url || "";
        if (!uploaded.ok || !url) return false;
        project = { sourceUrl: url, operations: [] };
      } else {
        return false;
      }
      if (requiresExistingSource && !project.sourceUrl.trim()) {
        setError(
          tt("当前音频 revision 的恢复草稿缺少源文件；已阻止用静音占位替代"),
        );
        return false;
      }
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
        const blob = durableUrl
          ? await fetchAudioProjectSourceBlob(durableUrl)
          : encodeWav(
              new AudioBuffer({
                length: 44_100,
                numberOfChannels: 1,
                sampleRate: 44_100,
              }),
            );
        await assertBlobSource(blob, "audio");
        let decoded: AudioBuffer;
        try {
          decoded = await context.decodeAudioData(
            (await blob.arrayBuffer()).slice(0),
          );
        } catch {
          throw new Error(
            tt("恢复源虽有正确音频签名，但没有浏览器可解码的音轨"),
          );
        }
        for (const operation of project.operations) {
          decoded = applyAudioOperation(decoded, operation);
        }
        if (audioBufferBytes(decoded) > MAX_DECODED_AUDIO_BYTES) return false;
        await reloadWaveform(decoded);
        bufferRef.current = decoded;
        sourceUrlRef.current = durableUrl;
        operationsRef.current = [...project.operations];
        undoRef.current = [];
        redoRef.current = [];
        undoOperationsRef.current = [];
        redoOperationsRef.current = [];
        revisionRef.current += 1;
        setCanUndo(false);
        setCanRedo(false);
        setDirty(true);
        setSavedUrl("");
        return true;
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : tt("音频本地草稿恢复失败"),
        );
        return false;
      } finally {
        await context?.close().catch(() => undefined);
      }
    },
    [
      bufferRef,
      item.id,
      item.title,
      operationsRef,
      redoOperationsRef,
      redoRef,
      reloadWaveform,
      requiresExistingSource,
      revisionRef,
      setCanRedo,
      setCanUndo,
      setDirty,
      setSavedUrl,
      siteId,
      sourceUrlRef,
      tt,
      undoOperationsRef,
      undoRef,
    ],
  );

  return { save, captureRecovery, restoreRecovery };
}

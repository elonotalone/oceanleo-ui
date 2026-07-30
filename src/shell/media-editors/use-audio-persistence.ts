import { useCallback, type MutableRefObject } from "react";

import { uploadFile } from "../../lib/database";
import {
  fetchMediaBlob,
  importMediaUrl,
  isFirstPartyMediaUrl,
} from "../../lib/media-proxy";
import type { UITranslate } from "../../i18n/ui/useUI";
import type { LibraryItem } from "../library-data";
import {
  saveProjectWorkingHead,
  type PersistedEditorVersion,
} from "../doc-editors/doc-io";
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

interface AudioPersistenceOptions {
  item: LibraryItem;
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
}: AudioPersistenceOptions) {
  const save = useCallback(async (): Promise<PersistedEditorVersion | null> => {
    const source = bufferRef.current;
    if (!source || savingRef.current) return null;
    const savingRevision = revisionRef.current;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const title = `${item.title || tt("音频")}-${tt("编辑版")}`;
      const attribution = audioAttributionFromItem(item);
      const project: AudioProjectData = {
        sourceUrl: sourceUrlRef.current,
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
      const saved = await saveProjectWorkingHead({
        item,
        siteId,
        fallbackSite: "audio",
        title,
        mediaType: "audio",
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
        // No product bytes exist at save time (source URL + operation journal),
        // so the waveform is this type's only displayable primary.
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
      });
      if (!saved.ok) {
        throw new Error(
          saved.error || artifactSaveStepMessage("revision-publish", ""),
        );
      }
      workingHeadUrlRef.current = saved.url;
      setSavedUrl(saved.url);
      if (revisionRef.current === savingRevision) setDirty(false);
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
          ? await fetchMediaBlob(durableUrl, {
              maxBytes: MAX_AUDIO_FILE_BYTES,
            })
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

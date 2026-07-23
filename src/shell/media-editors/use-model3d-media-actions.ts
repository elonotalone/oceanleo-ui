"use client";

import {
  useCallback,
  useState,
  type MutableRefObject,
} from "react";
import type { UITranslate } from "../../i18n/ui/useUI";
import { saveCreations, uploadFile } from "../../lib/database";
import type { LibraryItem } from "../library-data";
import { safeModelStem, triggerModelDownload } from "./model3d-files";
import type {
  Model3DSceneRuntime,
  Model3DTextureSlot,
} from "./model3d-runtime.mjs";
import { assertBlobSource } from "./source-integrity.mjs";

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}

export function useModel3DMediaActions({
  runtimeRef,
  modelLoaded,
  exportModel,
  item,
  siteId,
  setError,
  setNotice,
  setSavedUrl,
  onSaved,
  tt,
}: {
  runtimeRef: MutableRefObject<Model3DSceneRuntime | null>;
  modelLoaded: boolean;
  exportModel: () => Promise<ArrayBuffer | null>;
  item: LibraryItem;
  siteId: string;
  setError: (value: string) => void;
  setNotice: (value: string) => void;
  setSavedUrl: (value: string) => void;
  onSaved?: (url: string) => void;
  tt: UITranslate;
}) {
  const [capturing, setCapturing] = useState(false);
  const [savingScreenshot, setSavingScreenshot] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const captureBlob = useCallback(async () => {
    if (!runtimeRef.current || !modelLoaded) {
      throw new Error(tt("3D 模型尚未加载完成"));
    }
    return runtimeRef.current.capturePng();
  }, [modelLoaded, runtimeRef, tt]);

  const downloadScreenshot = useCallback(async () => {
    setCapturing(true);
    setError("");
    try {
      const blob = await captureBlob();
      triggerModelDownload(blob, `${safeModelStem(item.title)}-view.png`);
      setNotice(tt("3D 视图截图已下载"));
    } catch (caught) {
      setError(errorMessage(caught, tt("3D 截图失败")));
    } finally {
      setCapturing(false);
    }
  }, [captureBlob, item.title, setError, setNotice, tt]);

  const saveScreenshot = useCallback(
    async (receiptMeta: Record<string, unknown> = {}): Promise<string> => {
      setSavingScreenshot(true);
      setError("");
      try {
        const title = `${safeModelStem(item.title)}-${tt("3D 视图截图")}`;
        const blob = await captureBlob();
        const uploaded = await uploadFile(
          new File([blob], `${title}.png`, { type: "image/png" }),
          { siteId: siteId || "threed", title },
        );
        const url = uploaded.data?.file?.url || "";
        if (!uploaded.ok || !url) {
          throw new Error(uploaded.error || tt("截图上传失败"));
        }
        const saved = await saveCreations(siteId || "threed", [{
          url,
          thumb_url: url,
          media_type: "image",
          title,
          kind: "image",
          meta: {
            parent_asset_id: item.id,
            editor: "three-scene-screenshot-v1",
            ...receiptMeta,
          },
        }]);
        if (!saved.ok || Number(saved.data?.saved || 0) !== 1) {
          throw new Error(saved.error || tt("截图已上传，但登记到我的库失败"));
        }
        setSavedUrl(url);
        setNotice(tt("3D 视图截图已保存到我的库"));
        onSaved?.(url);
        return url;
      } catch (caught) {
        setError(errorMessage(caught, tt("保存 3D 截图失败")));
        return "";
      } finally {
        setSavingScreenshot(false);
      }
    },
    [
      captureBlob,
      item.id,
      item.title,
      onSaved,
      setError,
      setNotice,
      setSavedUrl,
      siteId,
      tt,
    ],
  );

  const replaceMaterialTexture = useCallback(async (
    slot: Model3DTextureSlot,
    file: File,
  ) => {
    setError("");
    try {
      const actualFormat = await assertBlobSource(file, "image");
      if (!["png", "jpeg"].includes(actualFormat)) {
        throw new Error(tt("纹理只支持 PNG 或 JPEG，以确保 GLB 可安全导出"));
      }
      const uploaded = await uploadFile(file, {
        siteId: siteId || "threed",
        title: file.name,
      });
      const url = uploaded.data?.file?.url || "";
      if (!uploaded.ok || !url) {
        throw new Error(uploaded.error || tt("纹理上传失败"));
      }
      const runtime = runtimeRef.current;
      if (!runtime) throw new Error(tt("3D 编辑器尚未就绪"));
      await runtime.replaceSelectedTexture(slot, url);
      setNotice(tt("材质纹理已替换"));
    } catch (caught) {
      setError(errorMessage(caught, tt("纹理替换失败")));
    }
  }, [runtimeRef, setError, setNotice, siteId, tt]);

  const downloadModel = useCallback(async () => {
    if (!runtimeRef.current || downloading) return;
    setDownloading(true);
    setError("");
    try {
      const bytes = await exportModel();
      if (!bytes) throw new Error(tt("3D checkpoint 正在保存，请稍后重试"));
      triggerModelDownload(
        new Blob([bytes], { type: "model/gltf-binary" }),
        `${safeModelStem(item.title)}-edited.glb`,
      );
      setNotice(tt("修改后的 GLB 已导出"));
    } catch (caught) {
      setError(errorMessage(caught, tt("3D 模型导出失败")));
    } finally {
      setDownloading(false);
    }
  }, [downloading, exportModel, item.title, runtimeRef, setError, setNotice, tt]);

  return {
    capturing,
    savingScreenshot,
    downloading,
    downloadScreenshot,
    saveScreenshot,
    replaceMaterialTexture,
    downloadModel,
  };
}

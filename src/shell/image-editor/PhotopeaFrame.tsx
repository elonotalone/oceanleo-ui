"use client";

/**
 * Photopea 免费版 iframe。只在专业模式由 ImagePhotopeaHost 挂上。
 *
 * UC-3：sandbox 走 photopeaFrameSandbox() → UNTRUSTED_FRAME_SANDBOX，
 * 不含 allow-same-origin。
 * UC-6：收信 origin + source；发信 targetOrigin 必须是 PHOTOPEA_ORIGIN。
 */
import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  PHOTOPEA_EXPORT_SCRIPT,
  PHOTOPEA_INITIAL_STATE,
  PHOTOPEA_ORIGIN,
  classifyPhotopeaMessage,
  isPhotopeaFrameSource,
  photopeaLaunchUrl,
  photopeaReducer,
  postToPhotopea,
  type PhotopeaLaunchOptions,
} from "./photopea-bridge";
import { photopeaFrameSandbox } from "./photopea-mount";

export function PhotopeaFrame({
  documentDataUrl,
  theme,
  onDocument,
}: PhotopeaLaunchOptions & {
  onDocument?: (bytes: ArrayBuffer) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [state, dispatch] = useReducer(photopeaReducer, PHOTOPEA_INITIAL_STATE);
  const sandbox = photopeaFrameSandbox();

  useEffect(() => {
    dispatch({ type: "open" });
    return () => {
      dispatch({ type: "close" });
    };
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isPhotopeaFrameSource(event, iframeRef.current?.contentWindow)) {
        return;
      }
      const message = classifyPhotopeaMessage(event);
      dispatch({ type: "message", message });
      if (message.kind === "document") onDocument?.(message.bytes);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onDocument]);

  const requestExport = useCallback(() => {
    dispatch({ type: "request-export" });
    postToPhotopea(
      iframeRef.current?.contentWindow ?? null,
      PHOTOPEA_EXPORT_SCRIPT,
      PHOTOPEA_ORIGIN,
    );
  }, []);

  void requestExport;
  void state;

  return (
    <iframe
      ref={iframeRef}
      title="Photopea"
      src={photopeaLaunchUrl({ documentDataUrl, theme })}
      sandbox={sandbox}
      referrerPolicy="no-referrer"
      data-testid="image-photopea-frame"
      className="h-full min-h-[280px] w-full border-0"
    />
  );
}

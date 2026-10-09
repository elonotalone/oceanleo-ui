"use client";

// 右侧栏里的 LeoBay（缩小版）。属性是合同 §3.2 定的，不许改；实现由第四波 W2 整份重写。
import { useEffect, useRef, useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { LibraryWorkPickerHost } from "../needs/LibraryWorkPicker";
import { formatBayParam } from "../shell/bay-links";
import {
  bayBack,
  closeBayDetails,
  registerBayPanel,
  useBayEnabled,
  useBayState,
} from "../shell/bay-state";
import { BayDetailPane, bayDetailTitleKey } from "../shell/BayDetail";
import type { WorkspaceBayRequest } from "../../workspace-actions";
import { PanelBrowse } from "./PanelBrowse";
import { RelatedServices } from "./RelatedServices";

export type BayPanelRequest = WorkspaceBayRequest;

export interface BayPanelProps {
  siteKey: string;
  /** 这一块此刻是不是右侧栏正显示的那一块。藏着的时候不登记在场、不发请求。 */
  active: boolean;
  /** agent 的「找相关服务」请求；`nonce` 变了才算新请求。没有过就是 null。 */
  request: BayPanelRequest | null;
  /** 栏内还有上一层可退时交出一个函数（右侧栏顶上的「返回」先调它）；退到头交 null。 */
  onBackChange?: (back: (() => void) | null) => void;
  /** 「先聊聊」：让右侧栏换到 LeoChat 的这条会话（`talent:<threadId>`）。 */
  onOpenConversation?: (conversationId: string) => void;
}

type PanelMode = "related" | "browse";

export function BayPanel({ siteKey, active, request, onBackChange, onOpenConversation }: BayPanelProps): ReactElement | null {
  const tt = useUI();
  const enabled = useBayEnabled();
  const { current } = useBayState();
  const inDetail = current.kind !== "feed";
  const [mode, setMode] = useState<PanelMode>(request ? "related" : "browse");
  const openConversationRef = useRef(onOpenConversation);
  openConversationRef.current = onOpenConversation;
  const onBackChangeRef = useRef(onBackChange);
  onBackChangeRef.current = onBackChange;

  useEffect(() => {
    if (!active || !enabled) return;
    return registerBayPanel({
      openConversation: (id) => openConversationRef.current?.(id),
    });
  }, [active, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const nonce = request?.nonce;
    if (!nonce) return;
    setMode("related");
    closeBayDetails();
  }, [enabled, request?.nonce]);

  useEffect(() => {
    const notify = onBackChangeRef.current;
    if (!enabled) {
      notify?.(null);
      return () => {
        onBackChangeRef.current?.(null);
      };
    }
    if (inDetail) {
      notify?.(() => bayBack());
    } else if (mode === "browse" && request) {
      notify?.(() => setMode("related"));
    } else {
      notify?.(null);
    }
    return () => {
      onBackChangeRef.current?.(null);
    };
  }, [enabled, inDetail, mode, request?.nonce]);

  if (!enabled) return null;

  const title = inDetail ? bayDetailTitleKey(current) : null;

  return (
    <div data-bay-panel-root data-bay-panel-mode={inDetail ? "detail" : mode} className="flex h-full min-h-0 flex-col bg-white">
      {inDetail ? (
        <div data-bay-panel="detail" data-bay-panel-target={current.kind} className="flex h-full min-h-0 flex-col">
          {title ? (
            <h3 data-bay-panel-title className="shrink-0 px-3 pb-1 pt-3 text-[13px] font-semibold text-stone-900">
              {tt(title)}
            </h3>
          ) : null}
          <div key={formatBayParam(current)} className="min-h-0 flex-1 overflow-y-auto">
            <BayDetailPane target={current} layout="docked" siteKey={siteKey} />
          </div>
        </div>
      ) : mode === "related" && request ? (
        <RelatedServices siteKey={siteKey} request={request} active={active} onBrowseAll={() => setMode("browse")} />
      ) : (
        <PanelBrowse siteKey={siteKey} />
      )}
      <LibraryWorkPickerHost />
    </div>
  );
}

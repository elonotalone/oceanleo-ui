"use client";

import { useId, useState, type HTMLAttributes, type ReactNode, type Ref, type ButtonHTMLAttributes } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { Modal } from "../../ui";
import { CARD, CARD_TITLE, CARD_DESC, QUIET, PRIMARY } from "../../pages/settings/personalization/parts";

export { CARD, CARD_TITLE, CARD_DESC, QUIET, PRIMARY };
// SettingsModal's non-expanded size. Inline panels also fit their host column.
// Modal also sets w-full; override it explicitly so its scrim padding cannot narrow the Settings size.
export const MESSAGE_SETTINGS_WIDTH = "!w-[min(1040px,94vw)] max-w-[min(1040px,94vw)] shrink-0";
export const MESSAGE_SETTINGS_HEIGHT = "h-[min(760px,88vh)]";
export const MESSAGE_SETTINGS_ROW = "flex items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-white px-4 py-3.5";

export function MessageSettingsHeader({ title, titleId, onClose, onBack, backButtonProps, children }: {
  title: ReactNode;
  titleId?: string;
  onClose?: () => void;
  onBack?: () => void;
  backButtonProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  children?: ReactNode;
}) {
  const tt = useUI();
  return <header data-message-settings-header className="shrink-0 border-b border-neutral-200 px-5 py-4">
    <div className="mx-auto flex w-full max-w-[800px] items-center gap-3">
      {onBack && <button {...backButtonProps} type="button" data-action="back" onClick={onBack} aria-label={tt("返回")} className={QUIET}>‹</button>}
      <h2 id={titleId} className={`min-w-0 flex-1 truncate ${CARD_TITLE}`}>{title}</h2>
      {children}
      {onClose && <button type="button" onClick={onClose} aria-label={tt("关闭")} data-action="close-panel" className={QUIET}>×</button>}
    </div>
  </header>;
}

export function MessageSettingsFrame({ title, titleId, onClose, onBack, children, className = "", card = true, ref, backButtonProps, headerActions, ...props }:
  Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
    title?: ReactNode;
    titleId?: string;
    onClose?: () => void;
    onBack?: () => void;
    card?: boolean;
    headerActions?: ReactNode;
    ref?: Ref<HTMLDivElement>;
    backButtonProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  }) {
  return <div {...props} ref={ref} data-message-settings-frame className={`mx-auto flex min-h-0 w-full max-w-[1040px] flex-1 flex-col overflow-hidden bg-white text-neutral-900 ${className}`}>
    {title != null && <MessageSettingsHeader title={title} titleId={titleId} onClose={onClose} onBack={onBack} backButtonProps={backButtonProps}>{headerActions}</MessageSettingsHeader>}
    <div data-message-settings-body className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
      <div data-message-settings-content className="mx-auto w-full max-w-[800px]">
        {card ? <div className={CARD}>{children}</div> : children}
      </div>
    </div>
  </div>;
}

export function MessageSettingsDialog({ title, labelledBy, onClose, children, contentHeight = false }: {
  title: ReactNode;
  labelledBy?: string;
  onClose: () => void;
  children: ReactNode;
  contentHeight?: boolean;
}) {
  const id = useId();
  const titleId = labelledBy ?? id;
  return <Modal onClose={onClose} labelledBy={titleId} className={`${MESSAGE_SETTINGS_WIDTH} ${contentHeight ? "max-h-[min(760px,88vh)]" : MESSAGE_SETTINGS_HEIGHT} overflow-hidden`}>
    <MessageSettingsFrame title={title} titleId={titleId} onClose={onClose} className={contentHeight ? "max-h-[min(760px,88vh)]" : "h-full"}>
      {children}
    </MessageSettingsFrame>
  </Modal>;
}

/** Small confirmations and single-field prompts keep Settings controls without the page-sized frame. */
export function MessagePromptDialog({ title, labelledBy, onClose, children }: {
  title: ReactNode;
  labelledBy?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const id = useId();
  const titleId = labelledBy ?? id;
  return <Modal onClose={onClose} labelledBy={titleId} className="max-w-md max-h-[88vh] overflow-y-auto">
    <div data-message-prompt>
      <MessageSettingsHeader title={title} titleId={titleId} onClose={onClose} />
      <div className="p-5"><div className={CARD}>{children}</div></div>
    </div>
  </Modal>;
}

/** Keep destructive actions explicit, with the same neutral settings controls. */
export function MessageConfirmDialog({ title, body, confirmLabel = "确认", cancelLabel = "取消", danger = false, onConfirm, onCancel }: {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const tt = useUI();
  const [busy, setBusy] = useState(false);
  return <MessagePromptDialog title={tt(title)} onClose={onCancel}>
    <div data-confirm={title} data-danger={danger ? "true" : undefined}>
      {body && <p className={CARD_DESC}>{tt(body)}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" data-confirm-cancel onClick={onCancel} className={QUIET}>{tt(cancelLabel)}</button>
        <button type="button" disabled={busy} data-confirm-ok onClick={async () => {
          setBusy(true);
          try { await onConfirm(); } finally { setBusy(false); }
        }} className={PRIMARY}>{tt(confirmLabel)}</button>
      </div>
    </div>
  </MessagePromptDialog>;
}

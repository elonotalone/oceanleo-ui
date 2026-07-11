"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useUI } from "../i18n/ui/useUI";
import {
  getActiveOperatorRemark,
  OPERATOR_REMARK_MAX_LENGTH,
  setActiveOperatorRemark,
} from "../lib/operator-remark";
import { StudioSection } from "./StudioSection";

export interface OperatorRemarkValue {
  remark: string;
  setRemark: (remark: string) => void;
}

const OperatorRemarkContext =
  createContext<OperatorRemarkValue | null>(null);

export function OperatorRemarkProvider({
  value,
  children,
}: {
  value: OperatorRemarkValue;
  children: ReactNode;
}) {
  useEffect(() => {
    setActiveOperatorRemark(value.remark);
    return () => {
      if (getActiveOperatorRemark() === value.remark) {
        setActiveOperatorRemark("");
      }
    };
  }, [value.remark]);
  const contextValue = useMemo<OperatorRemarkValue>(
    () => ({
      remark: value.remark,
      setRemark: (remark) => {
        setActiveOperatorRemark(remark);
        value.setRemark(remark);
      },
    }),
    [value],
  );
  return (
    <OperatorRemarkContext.Provider value={contextValue}>
      {children}
    </OperatorRemarkContext.Provider>
  );
}

/**
 * The app-scoped optional note shared by the operator form, its direct
 * generation action, and the sibling agent mode.
 */
export function useOperatorRemark(): OperatorRemarkValue {
  const shared = useContext(OperatorRemarkContext);
  const [localRemark, setLocalRemark] = useState("");
  return useMemo(
    () =>
      shared ?? {
        remark: localRemark,
        setRemark: setLocalRemark,
      },
    [shared, localRemark],
  );
}

export function OperatorRemarkField({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const tt = useUI();
  const { remark, setRemark } = useOperatorRemark();
  const [open, setOpen] = useState(false);
  const summary = remark.trim()
    ? remark.trim().replace(/\s+/g, " ").slice(0, 36)
    : tt("未填写");
  return (
    <div className="mt-3">
      <StudioSection
        title={tt("备注（可选）")}
        open={open}
        onToggle={() => setOpen((value) => !value)}
        summary={summary}
      >
        <div className="mb-1.5 flex items-center justify-end">
          <span className="text-[10px] tabular-nums text-stone-300">
            {remark.length}/{OPERATOR_REMARK_MAX_LENGTH}
          </span>
        </div>
        <textarea
          id="oceanleo-operator-remark"
          aria-label={tt("备注（可选）")}
          value={remark}
          onChange={(event) => setRemark(event.target.value)}
          disabled={disabled}
          maxLength={OPERATOR_REMARK_MAX_LENGTH}
          rows={3}
          placeholder={tt(
            "补充必须包含、需要避免、语气、受众或其它要求，生成时会一并交给 AI。",
          )}
          className="block w-full resize-y rounded-lg border border-stone-200 bg-white px-3 py-2 text-[13px] leading-relaxed text-stone-800 outline-none transition placeholder:text-stone-300 focus:border-stone-400 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
        />
      </StudioSection>
    </div>
  );
}

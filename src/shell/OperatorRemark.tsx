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
  return (
    <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50/60 p-3">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label
          htmlFor="oceanleo-operator-remark"
          className="text-[12px] font-medium text-stone-600"
        >
          {tt("备注（可选）")}
        </label>
        <span className="text-[10px] tabular-nums text-stone-300">
          {remark.length}/{OPERATOR_REMARK_MAX_LENGTH}
        </span>
      </div>
      <textarea
        id="oceanleo-operator-remark"
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
    </div>
  );
}

"use client";

import { useEffect, useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { checkBayAppVerification, startBayAppVerification, type BayAppMine, type BayAppVerification } from "../../../lib/bay/apps";
import { BayApiError } from "../../../lib/bay/http";
import { PRIMARY_BUTTON, SECONDARY_BUTTON, SellerNotice } from "../seller/seller-ui";

export function AppVerifyPanel({
  app,
  onChanged,
}: {
  app: BayAppMine;
  onChanged: (app: BayAppMine) => void;
}): ReactElement {
  const tt = useUI();
  const verified = Boolean(app.verified_at);
  const [proof, setProof] = useState<BayAppVerification | null>(null);
  const [loadError, setLoadError] = useState("");
  const [checkError, setCheckError] = useState("");
  const [copyError, setCopyError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (verified) return;
    let alive = true;
    setLoadError("");
    startBayAppVerification(app.id).then(
      (body) => {
        if (alive) setProof(body);
      },
      (error: unknown) => {
        if (alive) setLoadError(error instanceof BayApiError && error.message ? error.message : tt("核验信息没取到，请稍后再试。"));
      },
    );
    return () => {
      alive = false;
    };
  }, [app.id, verified, tt]);

  async function copy(text: string) {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setCopyError(tt("没能复制，请手动选中复制"));
    }
  }

  async function check() {
    if (busy) return;
    setBusy(true);
    setCheckError("");
    try {
      const result = await checkBayAppVerification(app.id);
      if (result.verified) {
        onChanged(result.app);
        return;
      }
      setCheckError(result.reason || tt("核验没有通过，请确认已经放好并发布。"));
    } catch (error) {
      setCheckError(error instanceof BayApiError && error.message ? error.message : tt("核验没有通过，请确认已经放好并发布。"));
    } finally {
      setBusy(false);
    }
  }

  if (verified) {
    return (
      <SellerNotice tone="ok">
        {tt("已核验：{host}", { host: app.url_host || app.url })}
      </SellerNotice>
    );
  }

  return (
    <section data-bay-app-verify className="space-y-3">
      <h3 className="text-[14px] font-semibold text-stone-900">{tt("证明这个网站是你的")}</h3>
      {loadError ? <SellerNotice tone="error">{loadError}</SellerNotice> : null}
      {proof ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-[13px] font-medium text-stone-800">{tt("把一行 meta 放进首页的 head")}</p>
            <code className="block overflow-x-auto rounded-lg bg-stone-50 px-3 py-2 text-[12px] text-stone-800">
              {proof.meta_tag}
            </code>
            <button type="button" className={SECONDARY_BUTTON} onClick={() => void copy(proof.meta_tag)}>
              {tt("复制")}
            </button>
          </div>
          <div className="space-y-1.5">
            <p className="text-[13px] font-medium text-stone-800">{tt("在 /.well-known/oceanleo-bay.txt 放一个文本文件")}</p>
            <p className="text-[12px] text-stone-500">{proof.file_path}</p>
            <code className="block overflow-x-auto rounded-lg bg-stone-50 px-3 py-2 text-[12px] text-stone-800">
              {proof.file_content}
            </code>
            <button type="button" className={SECONDARY_BUTTON} onClick={() => void copy(proof.file_content)}>
              {tt("复制")}
            </button>
          </div>
        </div>
      ) : !loadError ? (
        <p className="text-[13px] text-stone-500">{tt("正在打开…")}</p>
      ) : null}
      {copyError ? <SellerNotice tone="warn">{copyError}</SellerNotice> : null}
      {checkError ? <SellerNotice tone="error">{checkError}</SellerNotice> : null}
      <button type="button" disabled={busy || !proof} className={PRIMARY_BUTTON} onClick={() => void check()}>
        {busy ? tt("正在核验…") : tt("我放好了，去核验")}
      </button>
    </section>
  );
}

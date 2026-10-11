"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  checkBayAppEndpoint,
  createBayAppEndpoint,
  listBayEndpointComputers,
  listMyBayAppEndpoints,
  type BayAppEndpoint,
  type BayEndpointComputer,
} from "../../../lib/bay/app-endpoints";
import { BayApiError } from "../../../lib/bay/http";
import { INPUT_CLASS, PRIMARY_BUTTON, SECONDARY_BUTTON, SellerEmpty, SellerField, SellerNotice } from "../seller/seller-ui";
import { requireBayLogin } from "../shell/bay-state";
import {
  checkHintText,
  checkOutcomeText,
  parsePort,
  pickableEndpoints,
  portProblem,
  previewPublicUrl,
  slugProblem,
  suffixFromEndpoints,
} from "./endpoint-model";

function failText(error: unknown, fallback: string): string {
  return error instanceof BayApiError && error.message ? error.message : fallback;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function EndpointPicker({
  selectedId,
  keepAppId,
  onSelect,
  disabled,
}: {
  selectedId: string | null;
  keepAppId?: string | null;
  onSelect: (endpoint: BayAppEndpoint) => void;
  disabled?: boolean;
}): ReactElement {
  const tt = useUI();
  const [computers, setComputers] = useState<BayEndpointComputer[]>([]);
  const [endpoints, setEndpoints] = useState<BayAppEndpoint[]>([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [computerId, setComputerId] = useState("");
  const [portDraft, setPortDraft] = useState("");
  const [slugDraft, setSlugDraft] = useState("");
  const [formError, setFormError] = useState("");
  const [checkLine, setCheckLine] = useState("");
  const [checkHint, setCheckHint] = useState("");
  const [copyError, setCopyError] = useState("");
  const [busy, setBusy] = useState<"create" | "check" | "">("");

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [computerBody, endpointBody] = await Promise.all([listBayEndpointComputers(), listMyBayAppEndpoints()]);
      setComputers(computerBody.items || []);
      setEndpoints(endpointBody.items || []);
    } catch (error) {
      setLoadError(failText(error, tt("公开网址没读出来，请稍后再试。")));
    } finally {
      setLoading(false);
    }
  }, [tt]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const pickable = pickableEndpoints(endpoints, keepAppId);
  const selected = endpoints.find((item) => item.id === selectedId) || null;
  const suffix = suffixFromEndpoints(endpoints);
  const preview = previewPublicUrl(slugDraft, suffix);
  const portIssue = portDraft.trim() ? portProblem(portDraft) : null;
  const slugIssue = slugProblem(slugDraft);

  async function create() {
    if (disabled || busy) return;
    if (!requireBayLogin()) return;
    const port = parsePort(portDraft);
    if (!computerId) {
      setFormError(tt("请选一台云电脑"));
      return;
    }
    if (port == null) {
      setFormError(tt(portProblem(portDraft) || "端口必须是 1024 到 65535 的整数"));
      return;
    }
    if (slugIssue) {
      setFormError(tt(slugIssue));
      return;
    }
    setBusy("create");
    setFormError("");
    try {
      const body = await createBayAppEndpoint({
        computer_id: computerId,
        port,
        ...(slugDraft.trim() ? { slug: slugDraft.trim() } : {}),
      });
      setEndpoints((current) => [body.endpoint, ...current.filter((item) => item.id !== body.endpoint.id)]);
      onSelect(body.endpoint);
      setSlugDraft("");
      setPortDraft("");
    } catch (error) {
      setFormError(failText(error, tt("公开网址没读出来，请稍后再试。")));
    } finally {
      setBusy("");
    }
  }

  async function check() {
    if (!selected || disabled || busy) return;
    if (!requireBayLogin()) return;
    setBusy("check");
    setCheckLine("");
    setCheckHint("");
    try {
      const result = await checkBayAppEndpoint(selected.id);
      setEndpoints((current) => current.map((item) => (item.id === result.endpoint.id ? result.endpoint : item)));
      onSelect(result.endpoint);
      setCheckLine(result.ok ? tt("应用回应了（HTTP {code}）", { code: result.status_code ?? 0 }) : checkOutcomeText(result));
      if (!result.ok) setCheckHint(tt(checkHintText()));
    } catch (error) {
      setCheckLine(failText(error, tt("公开网址没读出来，请稍后再试。")));
      setCheckHint(tt(checkHintText()));
    } finally {
      setBusy("");
    }
  }

  async function copyUrl(url: string) {
    setCopyError("");
    const ok = await copyText(url);
    if (!ok) setCopyError(tt("没能复制，请手动选中复制"));
  }

  if (loading) {
    return (
      <div data-bay-endpoint-picker className="text-[13px] text-stone-500">
        {tt("正在打开…")}
      </div>
    );
  }

  if (loadError) {
    return (
      <div data-bay-endpoint-picker className="space-y-2">
        <SellerNotice tone="error">{loadError}</SellerNotice>
        <button type="button" className={SECONDARY_BUTTON} onClick={() => void reload()}>
          {tt("重试")}
        </button>
      </div>
    );
  }

  if (computers.length === 0) {
    return (
      <div data-bay-endpoint-picker className="space-y-2">
        <SellerEmpty>
          {tt("你还没有云电脑。带后台的应用要跑在你自己的云电脑上，OceanLeo 只给它一个公开网址，不替你运行程序。")}
        </SellerEmpty>
        <a
          href="/settings/devices"
          target="_blank"
          rel="noopener noreferrer"
          data-bay-endpoint-devices
          className="inline-flex text-[13px] font-medium text-stone-900 underline underline-offset-2"
        >
          {tt("设置 → 我的设备")}
        </a>
      </div>
    );
  }

  return (
    <div data-bay-endpoint-picker className="space-y-4">
      <div data-bay-endpoint-unused className="space-y-2">
        <p className="text-[13px] font-medium text-stone-800">{tt("还没被作品用着的公开网址")}</p>
        {pickable.length === 0 ? (
          <p className="text-[12.5px] text-stone-500">{tt("还没有闲着的公开网址。下面可以新开一个。")}</p>
        ) : (
          <ul className="space-y-2">
            {pickable.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  data-bay-endpoint-pick={item.id}
                  disabled={Boolean(disabled || busy)}
                  onClick={() => {
                    setCheckLine("");
                    setCheckHint("");
                    onSelect(item);
                  }}
                  className={`block w-full rounded-xl border px-3 py-2 text-left disabled:opacity-40 ${
                    selectedId === item.id ? "border-neutral-900 bg-neutral-50" : "border-stone-200 bg-white hover:bg-stone-50"
                  }`}
                >
                  <span className="block truncate text-[13px] font-medium text-stone-900">{item.url}</span>
                  <span className="mt-0.5 block text-[12px] text-stone-500">
                    {item.computer_name} · {item.port}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div data-bay-endpoint-create className="space-y-3 rounded-xl border border-stone-200 bg-white p-3">
        <p className="text-[13px] font-medium text-stone-800">{tt("新开一个")}</p>
        <div className="space-y-2" role="radiogroup" aria-label={tt("云电脑")}>
          {computers.map((row) => (
            <label
              key={row.id}
              data-bay-endpoint-computer={row.id}
              className={`flex items-start gap-3 rounded-xl border p-3 ${
                !row.usable ? "cursor-not-allowed opacity-50" : "cursor-pointer"
              } ${computerId === row.id ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 bg-white"}`}
            >
              <input
                type="radio"
                name="bay-endpoint-computer"
                className="mt-1"
                disabled={!row.usable || Boolean(disabled || busy)}
                checked={computerId === row.id}
                onChange={() => setComputerId(row.id)}
              />
              <span>
                <span className="block text-[13px] font-medium text-stone-900">{row.name}</span>
                <span className="mt-0.5 block text-[12px] text-stone-500">
                  {!row.online ? tt("不在线") : null}
                  {!row.usable && row.blocked_reason ? ` ${row.blocked_reason}` : null}
                </span>
              </span>
            </label>
          ))}
        </div>
        <SellerField label={tt("端口")} hint={tt("你的应用在云电脑上监听的端口，例如 3000")}>
          <input
            className={INPUT_CLASS}
            inputMode="numeric"
            value={portDraft}
            disabled={Boolean(disabled || busy)}
            onChange={(event) => {
              setPortDraft(event.target.value);
              setFormError("");
            }}
          />
        </SellerField>
        {portIssue ? <p className="text-[12.5px] text-rose-600">{tt(portIssue)}</p> : null}
        <SellerField label={tt("名字")} hint={tt("可选")}>
          <input
            className={INPUT_CLASS}
            value={slugDraft}
            disabled={Boolean(disabled || busy)}
            onChange={(event) => {
              setSlugDraft(event.target.value);
              setFormError("");
            }}
          />
        </SellerField>
        <p className="text-[12px] leading-5 text-stone-500">
          {tt("3–32 位小写字母、数字和连字符；不要以连字符开头或结尾，也不要连续两个连字符。")}
        </p>
        {slugIssue ? <p className="text-[12.5px] text-rose-600">{tt(slugIssue)}</p> : null}
        {preview ? <p className="text-[12.5px] text-stone-600">{tt("网址会是 {url}", { url: preview })}</p> : null}
        {formError ? <SellerNotice tone="error">{formError}</SellerNotice> : null}
        <button
          type="button"
          data-bay-action="create-endpoint"
          disabled={Boolean(disabled || busy) || !computerId || parsePort(portDraft) == null || Boolean(slugIssue)}
          className={PRIMARY_BUTTON}
          onClick={() => void create()}
        >
          {busy === "create" ? tt("创建中…") : tt("创建")}
        </button>
      </div>

      {selected ? (
        <div data-bay-endpoint-selected className="space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
          <p className="break-all text-[13px] font-medium text-stone-900">{selected.url}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-bay-action="copy-endpoint" className={SECONDARY_BUTTON} onClick={() => void copyUrl(selected.url)}>
              {tt("复制")}
            </button>
            <button
              type="button"
              data-bay-action="check-endpoint"
              disabled={Boolean(disabled || busy)}
              className={SECONDARY_BUTTON}
              onClick={() => void check()}
            >
              {busy === "check" ? tt("正在检测…") : tt("检测")}
            </button>
          </div>
          {copyError ? <p className="text-[12.5px] text-rose-600">{copyError}</p> : null}
          {checkLine ? (
            <p data-bay-endpoint-check className="text-[12.5px] text-stone-700">
              {checkLine}
            </p>
          ) : null}
          {checkHint ? <p className="text-[12.5px] text-stone-500">{checkHint}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

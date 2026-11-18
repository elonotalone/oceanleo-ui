"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { CloudComputerError } from "../../lib/cloud-computer-api";
import { DeviceDialog, DEVICE_BUTTON, DEVICE_PRIMARY_BUTTON } from "./DeviceDialog";

export const OWN_PROVIDER = "此设备由你自己的服务商管理，OceanLeo 无法在这里开关机、做快照或改防火墙。";
export const FIELD = "min-w-0 max-w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm";

export function serverErrorText(error: unknown, tt: ReturnType<typeof useUI>): string {
  const failure = error as Partial<CloudComputerError> | null;
  if (failure?.code === "metering_unavailable") return tt("此功能尚未在当前服务端开通");
  if (failure?.status === 404 || failure?.status === 501) return tt("此功能尚未在当前服务端开通");
  if (failure?.code === "not_managed") return tt(OWN_PROVIDER);
  if (failure?.code === "permission_missing") return [tt("缺少云端权限"), failure.message && tt(failure.message), failure.detail?.missing_action, failure.detail?.policy_hint].filter((v) => v != null && v !== "").map((v) => typeof v === "string" ? v : JSON.stringify(v)).join(" · ");
  return failure?.message ? tt(failure.message) : tt("操作未完成，请重试。");
}

export function ErrorNotice({error, retry}: {error: unknown; retry: () => void}) {
  const tt = useUI();
  if ((error as Partial<CloudComputerError> | null)?.code === "metering_unavailable") return <p role="status" className="my-3 text-sm text-neutral-500">{tt("此功能尚未在当前服务端开通")}</p>;
  return <div role="alert" className="my-3 break-words rounded-xl bg-red-50 p-3 text-sm text-red-700">{serverErrorText(error, tt)} <button type="button" className="underline" onClick={retry}>{tt("重试")}</button></div>;
}

export function useServerResource<T>(load: () => Promise<T>) {
  const [state, setState] = useState<{data: T | null; error: unknown; loading: boolean}>({data: null, error: null, loading: true});
  const [revision, setRevision] = useState(0);
  const reload = useRef<() => void>(() => {});
  useEffect(() => {
    let alive = true;
    let fetching = false;
    setState({data: null, error: null, loading: true});
    function fetchData() {
      if (fetching || !alive) return;
      fetching = true;
      Promise.resolve().then(load).then((data) => {if (alive) setState({data, error: null, loading: false});}, (error) => {if (alive) setState((current) => ({...current, error, loading: false}));}).finally(() => {fetching = false;});
    }
    reload.current = fetchData;
    fetchData();
    return () => {alive = false;};
  }, [load, revision]);
  const retry = useCallback(() => setRevision((v) => v + 1), []);
  const refresh = useCallback(() => reload.current(), []);
  return {...state, retry, refresh};
}

export function ResourceView<T>({resource, children}: {resource: ReturnType<typeof useServerResource<T>>; children: (data: T) => ReactNode}) {
  const tt = useUI();
  if (resource.loading) return <p role="status" className="text-sm text-neutral-500">{tt("正在加载…")}</p>;
  if (resource.error) return <><ErrorNotice error={resource.error} retry={resource.retry} />{resource.data !== null && children(resource.data)}</>;
  return resource.data === null ? <p>{tt("暂无数据")}</p> : <>{children(resource.data)}</>;
}

export function ServerSection({title, children, id}: {title: string; children: ReactNode; id: string}) {
  const tt = useUI();
  return <section data-server-section={id} className="min-w-0 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5"><h3 className="mb-4 text-base font-semibold">{tt(title)}</h3>{children}</section>;
}

type Request = (confirmed: boolean, dedicatedGroupConfirmed: boolean) => Promise<unknown>;
type Confirmation = {title: string; body: string; request: Request; confirmed: boolean; dedicatedGroupConfirmed: boolean};
/** Destructive endpoint challenges supply the final loss text before confirmed=true. */
export function useServerAction(done: () => void = () => {}) {
  const tt = useUI();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const retry = useRef<() => void>(() => {});
  useEffect(() => {alive.current = true; return () => {alive.current = false;};}, []);
  async function execute(request: Request, confirmed = false, dedicatedGroupConfirmed = false) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    retry.current = () => {void execute(request, confirmed, dedicatedGroupConfirmed);};
    try {await request(confirmed, dedicatedGroupConfirmed); if (alive.current) {setConfirmation(null); done();}}
    catch (cause) {
      if (!alive.current) return;
      const failure = cause as Partial<CloudComputerError>;
      if (failure.code === "needs_dedicated_group" && !dedicatedGroupConfirmed) {
        setConfirmation({title: tt("确认操作"), body: tt("将为此服务器建立独立防火墙，并保留相同规则。其他服务器不受影响。"), request, confirmed, dedicatedGroupConfirmed: true});
      } else if (!confirmed && (failure.code === "needs_confirmation" || failure.code === "unsafe_rule")) {
        const loses = failure.detail?.loses;
        const body = typeof loses === "string" ? loses : Array.isArray(loses) ? loses.map(String).join("\n") : tt("此操作可能中断连接或丢失数据，请确认后继续。");
        setConfirmation({title: tt("确认操作"), body, request, confirmed: true, dedicatedGroupConfirmed});
      } else {setConfirmation(null); setError(cause); }
    } finally {lock.current = false; if (alive.current) setBusy(false);}
  }
  function run(request: Request, confirm?: {title: string; body: string}) {
    if (lock.current) return;
    setError(null);
    if (confirm) setConfirmation({...confirm, request, confirmed: true, dedicatedGroupConfirmed: false}); else void execute(request);
  }
  const feedback = <>
    {error != null && <ErrorNotice error={error} retry={() => retry.current()} />}
    {confirmation && <DeviceDialog compact title={confirmation.title} testId="server-confirm" onClose={() => {if (!lock.current) setConfirmation(null);}}>
      <p className="whitespace-pre-wrap text-sm">{confirmation.body}</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" className={DEVICE_BUTTON} disabled={busy} onClick={() => setConfirmation(null)}>{tt("取消")}</button><button type="button" data-server-confirm className={DEVICE_PRIMARY_BUTTON} disabled={busy} onClick={() => void execute(confirmation.request, confirmation.confirmed, confirmation.dedicatedGroupConfirmed)}>{tt("确认")}</button></div>
    </DeviceDialog>}
  </>;
  return {busy, run, feedback};
}

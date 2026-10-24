"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { GATEWAY_BASE } from "../../lib/auth/config";
import { downloadLocalBrowserExtension, localBrowserApi, type LocalBrowserDevices, type LocalBrowserEvent, type LocalBrowserSession } from "../../lib/local-browser-api";

const button = "rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800";
const stateCopy = { pending_consent: "等待扩展本地授权", active: "运行中", paused: "已暂停，继续需要本地重新授权", stopped: "已停止", denied: "本地授权已拒绝", expired: "授权已过期" } as const;

export function MyBrowserPanel() {
  const tt = useUI();
  const [data, setData] = useState<LocalBrowserDevices | null>(null);
  const [sessions, setSessions] = useState<LocalBrowserSession[]>([]);
  const [events, setEvents] = useState<LocalBrowserEvent[]>([]);
  const [selected, setSelected] = useState("");
  const [pairing, setPairing] = useState<{ code: string; expires_at: string } | null>(null);
  const [error, setError] = useState("");
  const [notice, updateNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const lifetime = useRef<AbortController | null>(null);
  function setNotice(value: string) {
    if (lifetime.current && !lifetime.current.signal.aborted) updateNotice(value);
  }
  const eventGeneration = useRef(0);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const [devices, history] = await Promise.all([localBrowserApi.devices(signal), localBrowserApi.sessions(signal)]);
      if (signal?.aborted) return;
      setData(devices); setSessions(history.items); setError("");
    } catch (e) {
      if (!signal?.aborted) setData(null);
      throw e;
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { await refresh(controller.signal); } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e)); }
      if (!controller.signal.aborted) timer = setTimeout(poll, 15000);
    }
    void poll();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { controller.abort(); clearTimeout(timer); clearInterval(clock); lifetime.current = null; };
  }, [refresh]);
  useEffect(() => {
    if (!selected) { setEvents([]); return; }
    const controller = new AbortController();
    const generation = ++eventGeneration.current;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { const result = await localBrowserApi.events(selected, controller.signal); if (!controller.signal.aborted && generation === eventGeneration.current) { setEvents(result.items); setEventsLoaded(true); } }
      catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e)); }
      if (!controller.signal.aborted) timer = setTimeout(poll, 10000);
    }
    setEvents([]); setEventsLoaded(false); void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [selected]);
  async function run(action: (signal: AbortSignal) => Promise<void>) {
    const signal = lifetime.current?.signal;
    if (!signal || busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(""); setNotice("");
    try { await action(signal); } catch (e) { if (!signal.aborted) setError(e instanceof Error ? e.message : String(e)); }
    finally { busyRef.current = false; if (!signal.aborted) setBusy(false); }
  }
  const validPairing = pairing && Date.parse(pairing.expires_at) > now;
  return <section id="my-browser" data-my-browser-panel className="mb-6 space-y-4 rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800" aria-labelledby="my-browser-heading">
    <h3 id="my-browser-heading" className="text-lg font-semibold">{tt("我的浏览器")}</h3>
    <p className="text-sm text-neutral-500">{tt("可选的本机浏览器连接，独立于 MCP。每次任务都需要在 Chrome 或 Edge 扩展中本地授权；授权后，网页内容会发送给服务器和模型。")}</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={button} disabled={busy} onClick={() => void run(async signal => { const blob = await downloadLocalBrowserExtension(signal); if (signal.aborted) return; const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "oceanleo-browser-extension.zip"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); })}>{tt("下载浏览器扩展 ZIP")}</button>
      <button type="button" className={button} disabled={busy} onClick={() => void run(async signal => { const value = await localBrowserApi.pair(signal); if (!signal.aborted) setPairing(value); })}>{tt("创建配对码")}</button>
      <button type="button" className={button} disabled={busy} onClick={() => void run(refresh)}>{tt("刷新状态")}</button>
    </div>
    <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-500"><li>{tt("解压 ZIP，在 chrome://extensions 或 edge://extensions 打开开发者模式，选择“加载已解压的扩展程序”。")}</li><li>{tt("在扩展中填写当前网关地址，再粘贴此处创建的配对码。配对码十分钟后失效且只能使用一次。")}</li><li>{tt("保持浏览器在线；在扩展中确认任务及网站范围。敏感操作需要再次本地确认；验证码可能需要你手动完成。")}</li></ol>
    <label className="block text-sm">{tt("网关地址")}<input readOnly value={GATEWAY_BASE} className="mt-1 block w-full rounded border bg-transparent p-2 font-mono text-xs" /></label>
    {pairing && <div className="space-y-2 rounded-lg bg-neutral-100 p-3 dark:bg-neutral-800"><label className="block text-sm">{tt("配对码")}<input className="mt-1 block w-full rounded border bg-transparent p-2 font-mono" readOnly value={validPairing ? pairing.code : ""} /></label><p className="text-xs">{validPairing ? tt("到期时间：{time}", { time: new Date(pairing.expires_at).toLocaleString() }) : tt("配对码已过期，请重新创建")}</p><button type="button" className={button} disabled={!validPairing || busy} onClick={() => void run(async () => { await navigator.clipboard.writeText(pairing.code); setNotice(tt("已复制配对码")); })}>{tt("复制配对码")}</button></div>}
    {error && <p role="alert" className="text-sm text-red-600">{tt("浏览器连接暂不可用，请检查登录、网络或网关后重试。")}{" "}{tt(error)}</p>}
    <p role="status" aria-live="polite" className="text-sm">{notice || (busy ? tt("处理中…") : !data ? tt("正在读取浏览器连接…") : "")}</p>
    {data && <>
      <label className="block text-sm">{tt("首选浏览器")}<select className="ml-2 rounded border bg-transparent p-2" disabled={busy} value={data.preferences.preferred_device_id || ""} onChange={e => { const id = e.target.value || null; void run(async signal => { await localBrowserApi.preferences({ ...data.preferences, preferred_device_id: id }, signal); await refresh(signal); }); }}><option value="">{tt("自动选择在线浏览器")}</option>{data.items.filter(d => !d.revoked_at).map(d => <option key={d.id} value={d.id}>{d.name} · {d.browser}{d.online ? "" : ` · ${tt("离线")}`}</option>)}</select></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy} checked={data.preferences.allow_cross_browser_tasks} onChange={e => { const allowed = e.target.checked; void run(async signal => { await localBrowserApi.preferences({ ...data.preferences, allow_cross_browser_tasks: allowed }, signal); await refresh(signal); }); }} />{tt("首选浏览器离线时，允许选择其他已配对的在线浏览器（仍需本地授权）")}</label>
      {data.items.length === 0 && <p className="text-sm text-neutral-500">{tt("尚未配对浏览器。安装扩展并使用配对码连接。")}</p>}
      <ul className="space-y-2">{data.items.map(d => <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"><div><span>{d.name} · {d.browser}</span><p className="text-xs text-neutral-500">{d.revoked_at ? tt("已撤销") : d.online ? tt("在线") : tt("离线：打开浏览器和扩展后重试，不会自动改用云浏览器")}{d.last_seen_at ? ` · ${new Date(d.last_seen_at).toLocaleString()}` : ""}</p></div><button type="button" className={button} disabled={busy || Boolean(d.revoked_at)} onClick={() => void run(async signal => { await localBrowserApi.revoke(d.id, signal); await refresh(signal); setNotice(tt("连接已撤销；设备收到通知后会停止。离线时请在扩展中立即断开。")); })}>{tt("撤销连接")}</button></li>)}</ul>
    </>}
    <h4 className="font-medium">{tt("浏览器任务与记录")}</h4>
    {selected && !eventsLoaded && <p role="status" className="text-xs text-neutral-500">{tt("正在读取任务记录…")}</p>}
    {data && sessions.length === 0 && <p className="text-sm text-neutral-500">{tt("还没有浏览器任务。可在聊天中要求 Agent 使用我的浏览器。")}</p>}
    <ul className="space-y-3">{sessions.map(s => <li key={s.id} className="space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"><p className="break-words text-sm">{s.goal}</p><p className="text-xs text-neutral-500">{tt(stateCopy[s.state])} · {new Date(s.created_at).toLocaleString()}</p>{s.origins.length > 0 && <p className="break-words text-xs">{s.origins.join(", ")}</p>}<div className="flex flex-wrap gap-2"><button type="button" className={button} aria-expanded={selected === s.id} onClick={() => setSelected(selected === s.id ? "" : s.id)}>{tt("查看记录")}</button>{["active", "pending_consent", "paused"].includes(s.state) && (["takeover", "stop"] as const).map(action => <button key={action} type="button" className={button} disabled={busy} onClick={() => void run(async signal => { await localBrowserApi.control(s.id, action, signal); await refresh(signal); setNotice(tt("请求已送达服务器，等待扩展同步；需要立即停止时请使用扩展中的停止或接管按钮。")); })}>{tt(action === "stop" ? "请求停止" : "请求接管")}</button>)}</div>{selected === s.id && <ul aria-label={tt("任务记录")} className="space-y-1 text-xs text-neutral-500">{events.length === 0 ? <li>{tt("暂无记录")}</li> : events.map(e => <li key={e.id}>{new Date(e.created_at).toLocaleString()} · {e.action} · {e.status}</li>)}</ul>}</li>)}</ul>
  </section>;
}

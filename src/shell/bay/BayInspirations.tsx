"use client";
import { useEffect, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { gatewayBase } from "../../lib/auth/config";
import { fetchInspirationScopes, type InspirationScope } from "../inspirations/inspiration-api";
import { InspirationPanel } from "../inspirations/InspirationPanel";

/** Platform content only: no seller, publish, price, or checkout actions. */
export function BayInspirations({ siteKey }: { siteKey: string }) {
  return <BayInspirationBrowse key={siteKey} siteKey={siteKey} />;
}

function BayInspirationBrowse({ siteKey }: { siteKey: string }) {
  const tt = useUI();
  const [site, setSite] = useState(siteKey);
  const [app, setApp] = useState("");
  const [scopes, setScopes] = useState<InspirationScope[]>([]);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => { const controller = new AbortController();
    void fetchInspirationScopes(gatewayBase(), controller.signal).then(data => { if (!controller.signal.aborted) setScopes(data); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [reload]);
  const sites = Array.from(new Set([siteKey, ...scopes.map(scope => scope.site_key)])).sort();
  const apps = scopes.filter(scope => !site || scope.site_key === site);
  return <section data-bay-inspirations className="mt-4 flex min-h-0 flex-1 flex-col">
    <div className="flex flex-wrap items-center gap-3 px-3 text-sm">
      <label>{tt("站点")} <select aria-label={tt("站点")} value={site} onChange={event => { setSite(event.target.value); setApp(""); }}>
        <option value="">{tt("全部站点")}</option>{sites.map(key => <option key={key} value={key}>{key}</option>)}
      </select></label>
      <label>{tt("应用")} <select aria-label={tt("应用")} value={app} onChange={event => setApp(event.target.value)}>
        <option value="">{tt("全部应用")}</option>{Array.from(new Set(apps.map(scope => scope.app_id))).sort().map(id => <option key={id} value={id}>{id}</option>)}
      </select></label>
      <span className="text-xs text-stone-500">{tt("平台提供 · 只读")}</span>
    </div>
    {error ? <p role="alert" className="px-3">{tt("灵感筛选暂时无法加载。")} <button type="button" onClick={() => { setError(false); setReload(n => n + 1); }}>{tt("重试")}</button></p> : null}
    <InspirationPanel key={`${site}:${app}`} siteKey={site} appId={app} browse />
  </section>;
}

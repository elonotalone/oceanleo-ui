"use client";
import type { WebsitePanel, WebsitePanelData } from "../../api/website-panels";
import { useWebsiteUI } from "./website-preview-i18n";

export const PANEL_STATE_LABEL = { not_wired: "未接线", wired: "已接线", error: "错误" } as const;
const CATALOG_ERRORS = new Map([
  ["app_catalog_invalid_manifest", "网站看板清单格式不正确，请让 agent 修复。"],
  ["app_catalog_timeout", "读取网站看板清单超时，请重试。"],
  ["app_catalog_access_denied", "网站看板清单暂不可访问，请检查服务连接。"],
  ["app_catalog_unsafe_origin", "网站看板地址未通过安全检查。"],
  ["app_catalog_unavailable", "暂时无法读取网站看板清单，请重试。"],
]);
// Closed platform reason codes; anything else keeps the generic copy (not_wired) or the raw reason (error).
const PANEL_REASONS = new Map([
  ["analytics_collector_not_observed", "还没有收到这个环境的访问数据，网站被访问后这里会显示访问量。"],
  ["auth_connector_not_connected", "登录服务尚未连接，可在「配置」中选择登录服务。"],
  ["auth_connector_registry_unavailable", "暂时无法读取登录服务配置，请稍后重试。"],
  ["selected_auth_users_provider_not_ready", "所选登录服务尚未就绪，连接完成后会显示注册用户。"],
  ["site_runtime_not_started", "网站未运行，启动后可查看此看板。"],
  ["panel_not_declared", "网站尚未提供此看板的数据。"],
]);
/** Fractional metrics are rounded for reading; the exact value stays in the title. */
export function formatMetricValue(value: string | number): string {
  if (typeof value !== "number" || !Number.isFinite(value) || Number.isInteger(value)) return String(value);
  const size = Math.abs(value);
  const options: Intl.NumberFormatOptions = size >= 100 ? { maximumFractionDigits: 0 }
    : size >= 1 ? { maximumFractionDigits: 2 } : { maximumSignificantDigits: 3 };
  return new Intl.NumberFormat("en-US", options).format(value);
}
const colors = ["#2563eb", "#16a34a", "#d97706", "#9333ea", "#dc2626"];
const cell = (value: unknown) => value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);

export function WebsitePanelView({ panel, data, loading, error, pending, onWire }: {
  panel: WebsitePanel; data?: WebsitePanelData | null; loading?: boolean; error?: string;
  pending?: boolean; onWire: () => void;
}) {
  const tt = useWebsiteUI();
  const catalogError = panel.source === "app" && panel.id === "catalog" && panel.state === "error"
    ? CATALOG_ERRORS.get(panel.error || "") : undefined;
  const reason = PANEL_REASONS.get(panel.error || "");
  return <section className="overflow-auto p-4" data-testid="website-panel" data-panel-source={panel.source}>
    <h2 className="mb-3 text-sm font-semibold">{catalogError ? tt("应用看板清单") : panel.title} · {tt(PANEL_STATE_LABEL[panel.state])}</h2>
    {panel.state === "error" || error ? <p role="alert">{catalogError ? tt(catalogError) : reason ? tt(reason) : panel.error || error || tt("看板数据暂不可用。")}</p>
      : panel.state === "not_wired" ? <div data-testid="website-panel-not-wired">
        <p>{tt(reason || "该看板尚未接线。")}</p>
        {panel.source === "app" && <button type="button" disabled={pending} onClick={onWire}>{tt("让 agent 配置此看板")}</button>}
      </div>
      : loading ? <p role="status">{tt("加载中…")}</p>
      : data ? <WebsitePanelDataView data={data} /> : <p>{tt("看板数据暂不可用。")}</p>}
  </section>;
}

export function WebsitePanelDataView({ data }: { data: WebsitePanelData }) {
  const tt = useWebsiteUI();
  if (data.kind === "table") return <div data-testid="website-panel-table">
    <table className="w-full text-left text-sm"><thead><tr>{data.columns.map(col => <th key={col.key} className="border-b p-2">{col.label}</th>)}</tr></thead>
      <tbody>{data.rows.map((row, i) => <tr key={i}>{data.columns.map(col => <td key={col.key} className="border-b p-2">{cell(row[col.key])}</td>)}</tr>)}</tbody></table>
    <p className="mt-2 text-xs">{tt("共 {total} 条", { total: data.total })}</p>
  </div>;
  if (data.kind === "metric") return <dl className="flex flex-wrap gap-6" data-testid="website-panel-metric">
    {data.items.map((item, i) => <div key={i}><dt>{item.label}</dt><dd className="text-2xl" title={String(item.value)}>{formatMetricValue(item.value)} {item.unit}</dd>{item.hint && <dd className="text-xs opacity-70">{item.hint}</dd>}</div>)}
  </dl>;
  const series = data.series.map(s => ({ ...s, points: s.points.filter(p => Number.isFinite(p.y)) }));
  const values = series.flatMap(s => s.points.map(p => p.y));
  if (!values.length) return <p>{tt("无数据")}</p>;
  const min = Math.min(0, ...values), max = Math.max(1, ...values);
  const y = (value: number) => 180 - (value - min) / (max - min) * 160;
  const count = Math.max(1, ...series.map(s => s.points.length));
  let angle = 0;
  const sum = values.reduce((n, v) => n + Math.max(0, v), 0);
  return <figure data-testid="website-panel-chart">
    <svg viewBox="0 0 500 220" role="img" aria-label={series.map(s => s.name).join(", ")} className="w-full">
      {data.chart !== "pie" && <line x1="20" x2="480" y1={y(0)} y2={y(0)} stroke="currentColor" opacity=".3" />}
      {series.map((s, si) => <g key={si} fill={colors[si % colors.length]}>
        {data.chart === "line" ? <polyline fill="none" stroke={colors[si % colors.length]} strokeWidth="2" points={s.points.map((p, i) => (30 + i / Math.max(1, count - 1) * 430) + "," + y(p.y)).join(" ")} />
          : s.points.map((p, i) => {
            if (data.chart === "bar") return <rect key={i} x={25 + i * 450 / count + si * 400 / count / series.length}
              y={Math.min(y(p.y), y(0))} width={Math.max(1, 380 / count / series.length)} height={Math.abs(y(p.y) - y(0))}><title>{s.name}: {p.x}: {p.y}</title></rect>;
            const start = angle, size = sum ? Math.max(0, p.y) / sum * Math.PI * 2 : 0;
            angle += size;
            if (size >= Math.PI * 2 - 1e-8) return <circle key={i} cx="250" cy="105" r="85" fill={colors[(si + i) % colors.length]}><title>{p.x}: {p.y}</title></circle>;
            return <path key={i} fill={colors[(si + i) % colors.length]} d={"M250 105 L" + (250 + 85 * Math.cos(start)) + " " + (105 + 85 * Math.sin(start)) + " A85 85 0 " + (size > Math.PI ? 1 : 0) + " 1 " + (250 + 85 * Math.cos(angle)) + " " + (105 + 85 * Math.sin(angle)) + " Z"}><title>{p.x}: {p.y}</title></path>;
          })}
      </g>)}
    </svg>
    <figcaption className="flex flex-wrap gap-3 text-xs">{series.map((s, si) => <span key={si} style={{ color: colors[si % colors.length] }}>{s.name}: {s.points.map(p => p.x + ": " + p.y).join(" · ")}</span>)}</figcaption>
  </figure>;
}

"use client";

import { currentDomainProfile } from "../../../contracts";
import { useUI } from "../../../i18n/ui/useUI";

// 产权与出处块。回答用户的三个问题：这东西是谁的、我能不能拿走、拿去用要背什么义务。

export type AssetOrigin = "first-party" | "external";

export interface ProvenanceFacts {
  origin: AssetOrigin;
  redistributeOk: boolean;
  sourceUrl: string;
  sourceLabel: string;
  /** undefined = 未标注，不是 false。 */
  downloadable?: boolean;
  licenseCode: string;
  licenseName: string;
  licenseUrl: string;
  commercialOk: boolean;
  modifyOk: boolean;
  attributionRequired: boolean;
  attributionText: string;
  /** undefined = 该 code 未登记完整条款，按最严文案渲染。 */
  noticeRequired?: boolean;
  shareAlike?: boolean;
}

const LICENSE_OBLIGATIONS: Record<
  string,
  { notice: boolean; shareAlike: boolean; family: string }
> = {
  CC0: { notice: false, shareAlike: false, family: "public-domain" },
  "CC0-1.0": { notice: false, shareAlike: false, family: "public-domain" },
  PDM: { notice: false, shareAlike: false, family: "public-domain" },
  PEXELS: { notice: false, shareAlike: false, family: "platform-terms" },
  PIXABAY: { notice: false, shareAlike: false, family: "platform-terms" },
  "CC-BY": { notice: false, shareAlike: false, family: "attribution" },
  "CC-BY-SA": { notice: false, shareAlike: true, family: "share-alike" },
  "CC-BY-ND": { notice: false, shareAlike: false, family: "attribution" },
  "CC-BY-NC": { notice: false, shareAlike: false, family: "attribution" },
  "CC-BY-NC-SA": { notice: false, shareAlike: true, family: "share-alike" },
  "CC-BY-NC-ND": { notice: false, shareAlike: false, family: "attribution" },
  MIT: { notice: true, shareAlike: false, family: "permissive-notice" },
  ISC: { notice: true, shareAlike: false, family: "permissive-notice" },
  "APACHE-2.0": { notice: true, shareAlike: false, family: "permissive-notice" },
  OFL: { notice: true, shareAlike: false, family: "permissive-notice" },
  "CDLA-PERMISSIVE-2.0": { notice: true, shareAlike: false, family: "permissive-notice" },
  "ODBL-1.0": { notice: true, shareAlike: true, family: "share-alike" },
  "OCEANLEO-AIGEN": { notice: false, shareAlike: false, family: "first-party" },
  "OCEANLEO-FIRST-PARTY": { notice: false, shareAlike: false, family: "first-party" },
  "OCEANLEO-OWNED": { notice: false, shareAlike: false, family: "first-party" },
  "FREE-COMMERCIAL": { notice: false, shareAlike: false, family: "first-party" },
  "ARXIV-PERPETUAL-1.0": { notice: false, shareAlike: false, family: "unknown" },
  "WB-MICRODATA": { notice: false, shareAlike: false, family: "unknown" },
  UNKNOWN: { notice: false, shareAlike: false, family: "unknown" },
};

const FIRST_PARTY_SOURCES = new Set([
  "oceanleo",
  "oceanleo-aigen",
  "oceanleo-chart",
  "oceanleo-curated",
  "oceanleo-design",
  "oceanleo-design-template",
]);

const SOURCE_LABELS: Record<string, string> = {
  openverse: "Openverse",
  pexels: "Pexels",
  pixabay: "Pixabay",
  polyhaven: "Poly Haven",
  freesound: "Freesound",
  jamendo: "Jamendo",
  officeplus: "OfficePLUS",
  svgrepo: "SVG Repo",
  kenney: "Kenney",
};

export function sourceLabelOf(source: string): string {
  const key = (source || "").trim();
  return SOURCE_LABELS[key.toLowerCase()] || key;
}

function obligationsOf(
  code: string,
  serverNotice?: boolean,
  serverShareAlike?: boolean,
): { noticeRequired?: boolean; shareAlike?: boolean } {
  if (typeof serverNotice === "boolean" || typeof serverShareAlike === "boolean") {
    return { noticeRequired: serverNotice, shareAlike: serverShareAlike };
  }
  const row = LICENSE_OBLIGATIONS[(code || "").trim().toUpperCase()];
  if (!row || row.family === "unknown") return {};
  return { noticeRequired: row.notice, shareAlike: row.shareAlike };
}

function isFirstPartyCode(code: string): boolean {
  return (code || "").trim().toUpperCase().startsWith("OCEANLEO");
}

/** 只放行 http/https。javascript: / data: 之类一律当作没有出处，不渲染链接。 */
export function safeHttpUrl(url: string): string {
  const raw = (url || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? raw : "";
  } catch {
    return "";
  }
}

function readableHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export interface ProvenanceAssetLike {
  source?: string;
  source_url?: string;
  origin?: string;
  redistribute_ok?: boolean;
  supply_tier?: string;
  download_url?: string;
  license?: {
    code?: string;
    name?: string;
    url?: string;
    commercial_ok?: boolean;
    modify_ok?: boolean;
    attribution_required?: boolean;
    attribution_text?: string;
    notice_required?: boolean;
    share_alike?: boolean;
    redistribute_ok?: boolean;
  };
}

export function deriveProvenance(asset: ProvenanceAssetLike): ProvenanceFacts {
  const license = asset.license || {};
  const code = (license.code || "").trim();
  const source = (asset.source || "").trim();

  const serverOrigin = (asset.origin || "").trim().toLowerCase();
  const origin: AssetOrigin =
    serverOrigin === "first-party" || serverOrigin === "external"
      ? (serverOrigin as AssetOrigin)
      : FIRST_PARTY_SOURCES.has(source.toLowerCase()) || isFirstPartyCode(code)
        ? "first-party"
        : "external";

  const serverRedistribute =
    typeof asset.redistribute_ok === "boolean"
      ? asset.redistribute_ok
      : typeof license.redistribute_ok === "boolean"
        ? license.redistribute_ok
        : undefined;
  const redistributeOk =
    origin === "first-party" ? false : serverRedistribute === true;

  const tier = (asset.supply_tier || "").trim().toLowerCase();
  const downloadable =
    tier === "byte-portable"
      ? true
      : tier === "link-only"
        ? false
        : asset.download_url
          ? true
          : undefined;

  const sourceUrl = origin === "first-party" ? "" : safeHttpUrl(asset.source_url || "");

  return {
    origin,
    redistributeOk,
    sourceUrl,
    sourceLabel: origin === "first-party" ? "OceanLeo" : sourceLabelOf(source),
    downloadable,
    licenseCode: code,
    licenseName: license.name || code,
    licenseUrl: safeHttpUrl(license.url || ""),
    commercialOk: license.commercial_ok !== false,
    modifyOk: license.modify_ok !== false,
    attributionRequired: license.attribution_required === true,
    attributionText: license.attribution_text || "",
    ...obligationsOf(code, license.notice_required, license.share_alike),
  };
}

export const FIRST_PARTY_TERMS_URL = `${currentDomainProfile().portalOrigin}/legal/first-party-assets`;

function Divider() {
  return <div className="my-2.5 h-px bg-stone-200" />;
}

/** 卡片角标：一眼分清自产与外部。 */
export function BayAssetOriginChip({ asset }: { asset: ProvenanceAssetLike }) {
  const tt = useUI();
  const origin = deriveProvenance(asset).origin;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
        origin === "first-party"
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-stone-200 bg-white/90 text-stone-600"
      }`}
      title={
        origin === "first-party"
          ? tt("OceanLeo 自产：可免费下载、可商用，但禁止再分发")
          : tt("外部素材：请按其原始授权使用")
      }
    >
      {origin === "first-party" ? tt("自产") : tt("外部")}
    </span>
  );
}

export function BayAssetProvenance({
  asset,
  facts,
}: {
  asset?: ProvenanceAssetLike;
  facts?: ProvenanceFacts;
}) {
  const tt = useUI();
  const f = facts || (asset ? deriveProvenance(asset) : null);
  if (!f) return null;

  const isFirstParty = f.origin === "first-party";
  const hasNoObligation =
    f.noticeRequired === false && f.shareAlike === false && !f.attributionRequired;
  const unregistered = f.noticeRequired === undefined && f.shareAlike === undefined;

  return (
    <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50/70 px-3.5 py-3">
      {isFirstParty ? (
        <div>
          <p className="text-sm font-semibold text-stone-900">
            {tt("OceanLeo 自产")}
            <span className="mx-1.5 font-normal text-stone-400">·</span>
            <span className="font-medium text-stone-700">{tt("免费下载")}</span>
            <span className="mx-1.5 font-normal text-stone-400">·</span>
            <span className="font-medium text-stone-700">{tt("可商用")}</span>
            <span className="mx-1.5 font-normal text-stone-400">·</span>
            <span className="font-semibold text-rose-600">{tt("禁止再分发")}</span>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">
            {tt(
              "这件素材由 OceanLeo 自己制作。你可以免费下载、用在你的商业作品里，不必署名。但不可以把文件本身当作素材再转手、转售或打包分发给第三方。",
            )}
          </p>
          <a
            href={FIRST_PARTY_TERMS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-xs text-sky-600 hover:underline"
          >
            {tt("完整条款")} ↗
          </a>
        </div>
      ) : (
        <div>
          <p className="text-sm font-semibold text-stone-900">
            {tt("外部素材")}
            {f.sourceLabel ? (
              <>
                <span className="mx-1.5 font-normal text-stone-400">·</span>
                <span className="font-medium text-stone-700">
                  {tt("来自 {source}", { source: f.sourceLabel })}
                </span>
              </>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-stone-600">
            {tt("出处：")}
            {f.sourceUrl ? (
              <a
                href={f.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-600 hover:underline"
              >
                {readableHost(f.sourceUrl)} ↗
              </a>
            ) : (
              <span className="text-stone-500">{tt("该来源未提供可跳转的原始页面")}</span>
            )}
          </p>
        </div>
      )}

      <Divider />

      <p className="text-xs text-stone-700">
        {f.downloadable === true
          ? tt("可免费下载原文件。")
          : f.downloadable === false
            ? tt("不提供文件下载，只能到出处获取。")
            : tt("下载资格未标注，以下载时的提示为准。")}
        {!isFirstParty && !f.redistributeOk ? (
          <span className="text-stone-500">
            {" "}
            {tt("下载后可自己使用，但不要把文件本身再转手分发给第三方。")}
          </span>
        ) : null}
      </p>

      {!isFirstParty && (
        <>
          <Divider />
          <div className="flex flex-col gap-1.5">
            {f.noticeRequired === true && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs leading-relaxed text-amber-800">
                <span className="font-semibold">
                  {tt("用在成品里必须附带许可证原文")}
                </span>
                {tt(
                  "：把这个授权的完整条文与版权声明一并放进你的作品（常见做法是附一个 NOTICE 或第三方声明文件）。只给一个链接不算。",
                )}
              </p>
            )}
            {unregistered && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs leading-relaxed text-amber-800">
                {tt(
                  "这件素材的授权我们没有登记完整条款，用前请自行核对原始许可证。",
                )}
              </p>
            )}
            {f.shareAlike === true && (
              <p className="text-xs leading-relaxed text-stone-700">
                <span className="font-semibold">{tt("改过之后要用同一个授权发布")}</span>
                {tt("：基于它做出来的衍生作品必须沿用相同授权条款。")}
              </p>
            )}
            {f.attributionRequired && (
              <p className="text-xs text-stone-700">
                {tt("需要署名（下方提供可一键复制的署名文本）。")}
              </p>
            )}
            {hasNoObligation && (
              <p className="text-xs text-stone-600">
                {tt("可直接用于商业作品，无附加义务。")}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export const PROVENANCE_FIXTURES: Record<string, ProvenanceAssetLike> = {
  firstParty: {
    source: "oceanleo-design-template",
    source_url: "https://example.invalid/internal/mc-logo-02.json",
    supply_tier: "byte-portable",
    license: {
      code: "OceanLeo-owned",
      name: "OceanLeo-owned",
      url: "",
      commercial_ok: true,
      modify_ok: true,
      attribution_required: false,
      attribution_text: "",
    },
  },
  externalCc0: {
    source: "polyhaven",
    source_url: "https://polyhaven.com/a/rock_boulder_dry",
    supply_tier: "byte-portable",
    license: {
      code: "CC0",
      name: "Creative Commons Zero (Public Domain)",
      url: "https://creativecommons.org/publicdomain/zero/1.0/",
      commercial_ok: true,
      modify_ok: true,
      attribution_required: false,
      attribution_text: "",
    },
  },
  externalApache: {
    source: "svgrepo",
    source_url: "https://www.svgrepo.com/svg/303108/apache-logo",
    supply_tier: "byte-portable",
    license: {
      code: "Apache-2.0",
      name: "Apache License 2.0",
      url: "https://www.apache.org/licenses/LICENSE-2.0",
      commercial_ok: true,
      modify_ok: true,
      attribution_required: true,
      attribution_text: '"apache-logo" (Apache-2.0)',
    },
  },
};

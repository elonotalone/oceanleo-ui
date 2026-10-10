"use client";

import { useUI } from "../../../i18n/ui/useUI";
import type { BayAssetLicense } from "./library-client";
import {
  deriveProvenance,
  type ProvenanceAssetLike,
} from "./BayAssetProvenance";

function readFacts(license: BayAssetLicense, asset?: ProvenanceAssetLike) {
  return deriveProvenance({
    ...(asset || {}),
    license: { ...license, ...(asset?.license || {}) },
  });
}

export function BayLicenseBadge({
  license,
  size = "sm",
  asset,
}: {
  license: BayAssetLicense;
  size?: "sm" | "md";
  asset?: ProvenanceAssetLike;
}) {
  const tt = useUI();
  const f = readFacts(license, asset);
  const pad = size === "md" ? "px-2.5 py-1 text-xs" : "px-1.5 py-0.5 text-[10px]";

  if (f.origin === "first-party") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 font-medium text-emerald-700 ${pad}`}
        title={tt("OceanLeo 自产：可免费下载、可商用、不必署名，但禁止再分发")}
      >
        {tt("免费商用")}
      </span>
    );
  }

  const unregistered = f.noticeRequired === undefined && f.shareAlike === undefined;
  const tone = !f.commercialOk
    ? "bg-rose-50 text-rose-700 border-rose-200"
    : unregistered ||
        f.noticeRequired === true ||
        f.shareAlike === true ||
        f.attributionRequired ||
        !f.modifyOk
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-emerald-50 text-emerald-700 border-emerald-200";

  const title = !f.commercialOk
    ? tt("{name}：不可用于商业用途", { name: f.licenseName })
    : f.noticeRequired === true
      ? tt("{name}：可商用，但成品里必须附带许可证原文与版权声明", { name: f.licenseName })
      : unregistered
        ? tt("{name}：条款未登记完整，用前请自行核对", { name: f.licenseName })
        : f.licenseName;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${tone} ${pad}`}
      title={title}
    >
      {f.licenseCode || tt("未标注")}
      {f.noticeRequired === true && <span aria-hidden>©</span>}
    </span>
  );
}

function LicenseFlag({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${ok ? "text-emerald-600" : "text-rose-500"}`}>
      <span aria-hidden>{ok ? "✓" : "✕"}</span>
      {ok ? yes : no}
    </span>
  );
}

export function BayLicenseFlags({
  license,
  asset,
}: {
  license: BayAssetLicense;
  asset?: ProvenanceAssetLike;
}) {
  const tt = useUI();
  const f = readFacts(license, asset);

  if (f.origin === "first-party") {
    return (
      <div className="flex flex-col gap-1 text-xs">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <LicenseFlag ok yes={tt("可商用")} no={tt("仅非商用")} />
          <LicenseFlag ok yes={tt("可修改")} no={tt("禁止改编")} />
          <LicenseFlag ok yes={tt("免署名")} no={tt("需署名")} />
          <LicenseFlag ok={false} yes={tt("可再分发")} no={tt("禁止再分发")} />
        </div>
        <p className="text-stone-500">
          {tt("OceanLeo 自产，可免费下载并用于商业作品，但不要把文件本身转手分发给第三方。")}
        </p>
      </div>
    );
  }

  const unregistered = f.noticeRequired === undefined && f.shareAlike === undefined;

  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <LicenseFlag ok={f.commercialOk} yes={tt("可商用")} no={tt("仅非商用")} />
        <LicenseFlag ok={f.modifyOk} yes={tt("可修改")} no={tt("禁止改编")} />
        <LicenseFlag ok={!f.attributionRequired} yes={tt("免署名")} no={tt("需署名")} />
      </div>
      {f.noticeRequired === true && (
        <p className="text-amber-700">
          <span className="font-medium">{tt("用在成品里必须附带许可证原文")}</span>
          {tt("：把完整授权条文与版权声明一并放进你的作品，只给一个链接不算。")}
        </p>
      )}
      {unregistered && (
        <p className="text-amber-700">
          {tt("这件素材的授权我们没有登记完整条款，用前请自行核对原始许可证。")}
        </p>
      )}
      {f.shareAlike === true && (
        <p className="text-stone-600">
          <span className="font-medium">{tt("衍生作品必须沿用同一授权")}</span>
          {tt("：基于它改出来的东西要用相同条款发布。")}
        </p>
      )}
    </div>
  );
}

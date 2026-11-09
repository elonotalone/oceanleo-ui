"use client";

import { useEffect, useMemo, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { PURCHASE_COPY } from "../../../i18n/ui/messages/purchase-copy";
import { getCnCloudAccount, saveCnCloudAccount, verifyCnCloudAccount } from "./api";

const TRUST_POLICY = {
  Version: "1",
  Statement: [
    {
      Action: "sts:AssumeRole",
      Effect: "Allow",
      Principal: { RAM: ["acs:ram::OCEANLEO_PLATFORM_ACCOUNT:root"] },
      Condition: { StringEquals: { "sts:ExternalId": "<EXTERNAL_ID>" } },
    },
  ],
};

const PERMISSION_POLICY = {
  Version: "1",
  Statement: [
    {
      Effect: "Allow",
      Action: [
        "ecs:DescribeRegions",
        "ecs:DescribeAvailableResource",
        "ecs:DescribeInstanceTypes",
        "ecs:DescribePrice",
        "ecs:DescribeImages",
        "ecs:DescribeInstances",
        "ecs:DescribeInstanceStatus",
        "ecs:DescribeInstanceMonitorData",
        "ecs:RunInstances",
        "ecs:StartInstance",
        "ecs:StopInstance",
        "ecs:DeleteInstance",
        "vpc:CreateVpc",
        "vpc:DescribeVpcs",
        "vpc:CreateVSwitch",
        "ecs:CreateSecurityGroup",
      ],
      Resource: ["*"],
    },
  ],
};

function externalIdSeed(): string {
  try {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return `oceanleo-${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return "oceanleo-account-link";
  }
}

export function CnAccountStep({
  onVerified,
  onBack,
}: {
  onVerified: () => void;
  onBack: () => void;
}) {
  const tt = useUI();
  const [roleArn, setRoleArn] = useState("");
  const [externalId, setExternalId] = useState(() => externalIdSeed());
  const [defaultRegion, setDefaultRegion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let alive = true;
    void getCnCloudAccount()
      .then((account) => {
        if (!alive) return;
        setRoleArn(account.role_arn || "");
        setExternalId(account.external_id || externalIdSeed());
        setDefaultRegion(account.default_region || "");
      })
      .catch(() => {
        // An unbound account is the normal first visit; the save call gives the
        // user the actionable validation message.
      });
    return () => {
      alive = false;
    };
  }, []);

  const policyText = useMemo(() => JSON.stringify(TRUST_POLICY, null, 2), []);
  const permissionText = useMemo(() => JSON.stringify(PERMISSION_POLICY, null, 2), []);

  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1200);
    } catch {
      setCopied("");
    }
  }

  async function verify() {
    setBusy(true);
    setError("");
    try {
      await saveCnCloudAccount({ role_arn: roleArn.trim(), external_id: externalId.trim(), default_region: defaultRegion.trim() });
      await verifyCnCloudAccount();
      onVerified();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-4" data-oceanleo-cc-cn-account>
      <div>
        <h3 className="text-[14px] font-semibold text-neutral-900">{tt(PURCHASE_COPY.cnAccountTitle)}</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-neutral-600">{tt(PURCHASE_COPY.cnAccountIntro)}</p>
      </div>
      <label className="block text-[12px] text-neutral-600">
        {tt(PURCHASE_COPY.cnRoleArn)}
        <input value={roleArn} onChange={(event) => setRoleArn(event.target.value)} aria-label={tt(PURCHASE_COPY.cnRoleArn)} className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-[13px] text-neutral-900 outline-none" placeholder="acs:ram::123456789012:role/OceanLeoServer" />
      </label>
      <label className="block text-[12px] text-neutral-600">
        {tt(PURCHASE_COPY.cnExternalId)}
        <input value={externalId} onChange={(event) => setExternalId(event.target.value)} aria-label={tt(PURCHASE_COPY.cnExternalId)} className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-[13px] text-neutral-900 outline-none" />
      </label>
      <label className="block text-[12px] text-neutral-600">
        {tt(PURCHASE_COPY.cnDefaultRegion)}
        <input value={defaultRegion} onChange={(event) => setDefaultRegion(event.target.value)} aria-label={tt(PURCHASE_COPY.cnDefaultRegion)} className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-[13px] text-neutral-900 outline-none" placeholder="cn-hangzhou" />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        {[[PURCHASE_COPY.cnTrustPolicy, policyText], [PURCHASE_COPY.cnPermissionPolicy, permissionText]].map(([label, text]) => (
          <div key={label} className="rounded-xl border border-neutral-200 bg-neutral-50 p-2">
            <div className="flex items-center justify-between gap-2 text-[11px] text-neutral-600">
              <span>{tt(label)}</span>
              <button type="button" onClick={() => void copy(label, text)} className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px]">{copied === label ? tt("已复制") : tt("复制")}</button>
            </div>
            <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-relaxed text-neutral-700">{text}</pre>
          </div>
        ))}
      </div>
      {error ? <p className="text-[12px] text-rose-600">{tt(error)}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onBack} className="rounded-lg border border-neutral-200 px-3.5 py-1.5 text-[13px]">{tt("返回")}</button>
        <button type="button" disabled={busy || !roleArn.trim() || !externalId.trim()} onClick={() => void verify()} data-oceanleo-cc-cn-account-verify className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-[13px] font-medium text-white disabled:opacity-50">{busy ? tt("验证中…") : tt(PURCHASE_COPY.cnSaveAndVerify)}</button>
      </div>
    </div>
  );
}

export { PERMISSION_POLICY, TRUST_POLICY };

"use client";

import { useEffect, useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { listMyOrgs, type OrgSummary } from "../../lib/org-api";
import {
  PAYER_LAST_KEY,
  PERSONAL_PAYER,
  persistPayerOrgId,
  persistedPayerOrgId,
} from "../../lib/payer";
import { FloatingMenu, FloatingMenuItem, FloatingMenuSeparator } from "../../ui/menu/FloatingMenu";

function IdentitySwitchChevrons() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className="block overflow-visible">
      <path d="M3.4 6.2 8 2.6 12.6 6.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.4 9.8 8 13.4 12.6 9.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SettingsIdentityCard({
  displayName,
  avatarUrl,
  userEmail,
  onCreateOrganization,
}: {
  displayName?: string | null;
  avatarUrl?: string | null;
  userEmail: string | null;
  onCreateOrganization?: () => void;
}) {
  const tt = useUI();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [payer, setPayer] = useState(PERSONAL_PAYER);

  const emailLocal = userEmail ? userEmail.split("@")[0] : "";
  const name = (displayName && displayName.trim()) || emailLocal;
  const initial = (name || userEmail || "?").trim().charAt(0).toUpperCase() || "?";

  useEffect(() => {
    let cancelled = false;
    setPayer(persistedPayerOrgId());
    listMyOrgs()
      .then((rows) => {
        if (!cancelled) setOrgs(rows);
      })
      .catch(() => {
        if (!cancelled) {
          setOrgs([]);
          setPayer(PERSONAL_PAYER);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    function onStore(event: StorageEvent) {
      if (event.key === PAYER_LAST_KEY) setPayer(event.newValue || PERSONAL_PAYER);
    }
    window.addEventListener("storage", onStore);
    return () => window.removeEventListener("storage", onStore);
  }, []);

  const roleLabel = (role: OrgSummary["role"]) =>
    role === "owner" ? tt("所有者") : role === "admin" ? tt("管理员") : tt("团队成员");
  const selected = orgs.find((org) => org.id === payer);
  const identity = selected ? selected.name : tt("个人");

  const select = (id: string) => {
    persistPayerOrgId(id);
    setPayer(id);
    window.dispatchEvent(new StorageEvent("storage", { key: PAYER_LAST_KEY, newValue: id || null }));
    setOpen(false);
  };

  return (
    <div className="w-fit max-w-full overflow-visible">
      <button
        ref={anchorRef}
        type="button"
        data-settings-identity=""
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex w-auto max-w-full items-center gap-2.5 overflow-visible rounded-lg py-1 pr-5 text-left transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-100"
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-medium text-white"
          style={{ backgroundColor: "#c2185b" }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </div>
        <div className="min-w-0">
          <p data-settings-nav-name="" className="truncate text-[14px] font-semibold text-neutral-900">
            {name || "—"}
          </p>
          <p data-settings-identity-kind="" className="truncate text-[12px] text-neutral-500">
            {identity}
          </p>
        </div>
        <span data-settings-identity-switch="" className="ml-4.5 flex size-5 shrink-0 items-center justify-center overflow-visible text-neutral-400">
          <IdentitySwitchChevrons />
        </span>
      </button>
      <FloatingMenu
        open={open}
        anchorRef={anchorRef}
        onClose={() => setOpen(false)}
        preferredPlacement="below"
        align="start"
        width={260}
        zClassName="z-[180]"
        ariaLabel={tt("个人")}
      >
        <FloatingMenuItem
          label={tt("个人")}
          selected={!selected}
          onSelect={() => select(PERSONAL_PAYER)}
        />
        {orgs.map((org) => (
          <FloatingMenuItem
            key={org.id}
            label={org.name}
            description={roleLabel(org.role)}
            selected={payer === org.id}
            onSelect={() => select(org.id)}
          />
        ))}
        <FloatingMenuSeparator />
        <FloatingMenuItem
          icon="+"
          label={tt("创建团队")}
          onSelect={() => {
            setOpen(false);
            onCreateOrganization?.();
          }}
        />
      </FloatingMenu>
    </div>
  );
}

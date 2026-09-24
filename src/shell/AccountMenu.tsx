"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";
import { listMyOrgs, type OrgSummary } from "../lib/org-api";
import { PAYER_LAST_KEY, PERSONAL_PAYER, persistPayerOrgId, persistedPayerOrgId } from "../lib/payer";
import { FloatingMenu, FloatingMenuItem, FloatingMenuSeparator } from "../ui/menu/FloatingMenu";

export type AccountMenuProps = {
  name: string;
  email?: string | null;
  avatar?: ReactNode;
  balanceText: string;
  orgHref: string;
  homeHref: string;
  /** `null` omits 获取帮助. */
  helpHref: string | null;
  docsHref: string;
  /** Settings tab behind 个性化; defaults to `"personalization"`, `null` omits the entry. */
  personalizationTab?: string | null;
  onOpenSettings: (tab: string) => void;
  onSignOut: () => void;
  /** When false, Sign out is omitted. Defaults to signed in so other shells stay unchanged. */
  signedIn?: boolean;
  compact?: boolean;
};

function IdentitySwitchChevrons() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className="shrink-0 text-neutral-400">
      <path d="M4.75 6.25 8 3.4l3.25 2.85" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.75 9.75 8 12.6l3.25-2.85" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AccountMenu(props: AccountMenuProps) {
  const tt = useUI();
  const signedIn = props.signedIn !== false;
  const anchorRef = useRef<HTMLButtonElement>(null);
  const identityRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [identitiesOpen, setIdentitiesOpen] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [payer, setPayer] = useState(PERSONAL_PAYER);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPayer(persistedPayerOrgId());
    listMyOrgs().then((rows) => { if (!cancelled) setOrgs(rows); }).catch(() => {
      if (!cancelled) { setOrgs([]); setPayer(PERSONAL_PAYER); }
    });
    const resize = () => setNarrow(window.innerWidth < 640);
    resize();
    window.addEventListener("resize", resize);
    return () => { cancelled = true; window.removeEventListener("resize", resize); };
  }, [open]);
  const close = () => { setIdentitiesOpen(false); setOpen(false); };
  const select = (id: string) => {
    persistPayerOrgId(id);
    setPayer(id);
    window.dispatchEvent(new StorageEvent("storage", { key: PAYER_LAST_KEY, newValue: id || null }));
    setIdentitiesOpen(false);
  };
  const roleLabel = (role: OrgSummary["role"]) => role === "owner" ? tt("所有者") : role === "admin" ? tt("管理员") : tt("组织成员");
  const selected = orgs.find((org) => org.id === payer);
  const identity = selected ? `${selected.name} · ${roleLabel(selected.role)}` : tt("个人");
  const avatar = props.avatar ?? <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-800 text-[11px] text-white">{(props.name || props.email || "?")[0].toUpperCase()}</span>;
  const identities = <>
    <FloatingMenuItem label={tt("个人")} selected={!selected} trailing={!selected ? "✓" : undefined} onSelect={() => select(PERSONAL_PAYER)} />
    {orgs.map((org) => <FloatingMenuItem key={org.id} label={org.name} description={roleLabel(org.role)} selected={payer === org.id} trailing={payer === org.id ? "✓" : undefined} onSelect={() => select(org.id)} />)}
    <FloatingMenuSeparator />
    <FloatingMenuItem icon="+" label={tt("创建团队")} href={props.orgHref} onSelect={close} />
  </>;
  const settings = (tab: string) => { close(); props.onOpenSettings(tab); };
  const personalizationTab = props.personalizationTab === undefined ? "personalization" : props.personalizationTab;
  return <>
    <button ref={anchorRef} type="button" data-account-trigger aria-haspopup="menu" aria-expanded={open} aria-label={props.name} title={props.name} onClick={() => { setOpen(!open); setIdentitiesOpen(false); }} className={`leo-tap-row flex min-w-0 items-center gap-2.5 rounded-lg p-1.5 text-neutral-800 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-200/50 dark:text-neutral-100 dark:hover:bg-neutral-800 ${props.compact ? "w-full justify-center" : "flex-1"}`}>
      {avatar}{!props.compact && <span className="truncate text-[13px] font-medium">{props.name}</span>}
    </button>
    <FloatingMenu open={open} anchorRef={anchorRef} onClose={close} preferredPlacement="above" align="start" width={280} ariaLabel={tt("账户")}>
      <button ref={identityRef} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={identitiesOpen} onClick={() => setIdentitiesOpen(!identitiesOpen)} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-3 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800">
        {avatar}<span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{props.name}</span><span data-account-identity className="block truncate text-[12px] text-neutral-500 dark:text-neutral-400">{identity}</span></span><span data-identity-switch aria-hidden="true"><IdentitySwitchChevrons /></span>
      </button>
      {identitiesOpen && narrow && <div role="menu" aria-label={tt("个人")} className="mx-1 rounded-lg bg-neutral-50 p-1 dark:bg-neutral-900">{identities}</div>}
      <FloatingMenu open={identitiesOpen && !narrow} anchorRef={identityRef} onClose={() => setIdentitiesOpen(false)} side="right" align="start" width={260} ariaLabel={tt("个人")}>{identities}</FloatingMenu>
      <FloatingMenuItem label={tt("余额")} trailing={<>{props.balanceText} ›</>} onSelect={() => settings("billing")} />
      <FloatingMenuSeparator />
      <FloatingMenuItem icon="♙" label={tt("账户")} onSelect={() => settings("account")} />
      {personalizationTab ? <FloatingMenuItem icon="✦" label={tt("个性化")} onSelect={() => settings(personalizationTab)} /> : null}
      <FloatingMenuItem icon="☷" label={tt("设置")} onSelect={() => settings("general")} />
      <FloatingMenuItem icon="⧉" label={tt("插件")} onSelect={() => settings("plugins")} />
      <FloatingMenuSeparator />
      <FloatingMenuItem label={tt("主页")} href={props.homeHref} external onSelect={close} />
      {props.helpHref ? <FloatingMenuItem label={tt("获取帮助")} href={props.helpHref} external onSelect={close} /> : null}
      <FloatingMenuItem label={tt("使用文档")} href={props.docsHref} external onSelect={close} />
      {signedIn ? <>
        <FloatingMenuSeparator />
        <FloatingMenuItem label={tt("退出登录")} danger onSelect={() => { close(); props.onSignOut(); }} />
      </> : null}
    </FloatingMenu>
  </>;
}

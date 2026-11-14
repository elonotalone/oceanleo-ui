"use client";

import { AccountMenu } from "../AccountMenu";
import { portalHref } from "../../contracts/domain-family";
import { signOutEverywhere } from "../../lib/auth/client";
import { DeviceStatusPopover } from "./DeviceStatusPopover";
import { LeoChatButton } from "../leochat/LeoChatButton";
import { openSettingsModal } from "./SettingsModalHost";

export interface SidebarAccountClusterProps {
  name: string;
  email?: string | null;
  balanceText: string;
  compact?: boolean;
  signedIn?: boolean;
  accountDot?: boolean;
  orgHref?: string;
  homeHref?: string;
  /** `null` omits 获取帮助; omitted = the portal's /help. */
  helpHref?: string | null;
  docsHref?: string;
  personalizationTab?: string | null;
  onOpenSettings?: (tab: string) => void;
  onSignOut?: () => void;
}

export function SidebarAccountCluster(props: SidebarAccountClusterProps) {
  const href = (path: string) => portalHref(path);
  const signOut = props.onSignOut ?? (() => { void signOutEverywhere().then(() => window.location.assign(href("/"))); });
  return <div data-sidebar-account-cluster className={`flex min-w-0 items-center ${props.compact ? "w-full flex-col gap-2" : "justify-between gap-3"}`}>
    <div style={{ position: "relative", minWidth: 0, flex: props.compact ? undefined : 1 }}>
    <AccountMenu name={props.name} email={props.email} balanceText={props.balanceText}
      compact={props.compact} signedIn={props.signedIn}
      orgHref={props.orgHref ?? href("/settings/team")}
      homeHref={props.homeHref ?? href("/")}
      helpHref={props.helpHref === null ? null : props.helpHref ?? href("/help")}
      docsHref={props.docsHref ?? href("/help")}
      personalizationTab={props.personalizationTab}
      onOpenSettings={props.onOpenSettings ?? openSettingsModal}
      onSignOut={signOut} />
    {props.signedIn && props.accountDot && <span data-account-badge aria-hidden="true" style={{ position: "absolute", top: 0, right: 0, width: 8, height: 8, borderRadius: "50%", backgroundColor: "#e11d48", pointerEvents: "none" }} />}
    </div>
    <div data-sidebar-account-actions className={`flex shrink-0 items-center ${props.compact ? "flex-col gap-2" : "gap-3"}`}>
      <DeviceStatusPopover className="leo-tap-target-inner" />
      <LeoChatButton className="leo-tap-target-inner" />
    </div>
  </div>;
}

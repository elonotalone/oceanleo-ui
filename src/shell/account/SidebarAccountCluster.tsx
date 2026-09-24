"use client";

import { AccountMenu } from "../AccountMenu";
import { currentDomainProfile } from "../../contracts/domain-family";
import { signOutEverywhere } from "../../lib/auth/client";
import { DeviceStatusPopover } from "./DeviceStatusPopover";
import { NotificationBell } from "./NotificationBell";
import { openSettingsModal } from "./SettingsModalHost";

export interface SidebarAccountClusterProps {
  name: string;
  email?: string | null;
  balanceText: string;
  compact?: boolean;
  signedIn?: boolean;
  orgHref?: string;
  homeHref?: string;
  helpHref?: string;
  docsHref?: string;
  personalizationTab?: string | null;
  onOpenSettings?: (tab: string) => void;
  onSignOut?: () => void;
}

export function SidebarAccountCluster(props: SidebarAccountClusterProps) {
  const portal = currentDomainProfile().portalOrigin;
  const local = typeof window !== "undefined" && window.location.origin === portal;
  const href = (path: string) => local ? path : `${portal}${path}`;
  const signOut = props.onSignOut ?? (() => { void signOutEverywhere().then(() => window.location.assign(href("/"))); });
  return <div data-sidebar-account-cluster className={`flex min-w-0 items-center gap-1 ${props.compact ? "w-full flex-col" : ""}`}>
    <AccountMenu name={props.name} email={props.email} balanceText={props.balanceText}
      compact={props.compact} signedIn={props.signedIn}
      orgHref={props.orgHref ?? href("/org")}
      homeHref={props.homeHref ?? href("/")}
      helpHref={props.helpHref ?? href("/help")}
      docsHref={props.docsHref ?? href("/help")}
      personalizationTab={props.personalizationTab}
      onOpenSettings={props.onOpenSettings ?? openSettingsModal}
      onSignOut={signOut} />
    <DeviceStatusPopover className="leo-tap-target-inner" />
    <NotificationBell className="leo-tap-target-inner" />
  </div>;
}

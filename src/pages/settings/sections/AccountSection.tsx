"use client";

import type { LedgerCurrency } from "../../../lib/money";
import { AccountSecurityPage } from "../../AccountSecurityPage";
import AccountHome from "../account/AccountHome";
import LoginDevicesPage from "../account/LoginDevicesPage";
import SignInMethodsPage from "../account/SignInMethodsPage";
import type { AccountSettingsView } from "../settings-tabs";

/** 与 W1 `AccountProfile` 对齐的最小形状。 */
export type AccountSectionProfile = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  sessionContact: {
    kind: "email" | "phone" | "wechat" | "none";
    value: string;
    provider: string;
  };
  identities: unknown[];
  deviceLabels?: Record<string, string>;
};

export function AccountSection({
  email,
  onSignedOut,
  view = "home",
  profile,
  credits,
  currency,
  onOpenSignInMethods,
  onOpenDevices,
  onOpenTopup,
  onProfileChange,
}: {
  email: string | null;
  onSignedOut?: () => void;
  view?: AccountSettingsView;
  profile?: AccountSectionProfile | null;
  credits?: number | null;
  currency?: LedgerCurrency;
  onOpenSignInMethods?: () => void;
  onOpenDevices?: () => void;
  onOpenTopup?: () => void;
  onProfileChange?: (profile: AccountSectionProfile) => void;
}) {
  const resolved = profile ?? fallbackProfile(email);

  if (view === "sign-in-methods") {
    return (
      <div data-settings-pane="account" data-account-view="sign-in-methods" className="space-y-6">
        <SignInMethodsPage />
        <div
          data-account-credentials=""
          className="border-t border-neutral-200 pt-6"
        >
          <AccountSecurityPage embedded blocks="credentials" onSignedOutAll={onSignedOut} />
        </div>
      </div>
    );
  }

  if (view === "login-devices") {
    return (
      <div data-settings-pane="account" data-account-view="login-devices">
        <LoginDevicesPage
          deviceLabels={resolved.deviceLabels}
          onDeviceLabelsChange={(labels) =>
            onProfileChange?.({ ...resolved, deviceLabels: labels })
          }
        />
      </div>
    );
  }

  if (view === "security") {
    return (
      <div data-settings-pane="account" data-account-view="security">
        <AccountSecurityPage embedded onSignedOutAll={onSignedOut} />
      </div>
    );
  }

  return (
    <AccountHome
      profile={resolved}
      credits={credits}
      currency={currency}
      onOpenSignInMethods={onOpenSignInMethods}
      onOpenDevices={onOpenDevices}
      onOpenTopup={onOpenTopup}
      onSignedOut={onSignedOut}
      onProfileChange={onProfileChange}
    />
  );
}

function fallbackProfile(email: string | null): AccountSectionProfile {
  return {
    userId: "",
    displayName: "",
    avatarUrl: "",
    sessionContact: {
      kind: email ? "email" : "none",
      value: email || "",
      provider: email ? "email" : "",
    },
    identities: [],
    deviceLabels: {},
  };
}

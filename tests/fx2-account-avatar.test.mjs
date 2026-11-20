import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const stubs = {
  "../i18n/ui/useUI": dataModule('export function useUI() { return key => key; }'),
  "../lib/auth/account-identity": dataModule('export function useAccountSession() { return { userId: "account-id", displayName: "Elon Lee", avatarUrl: "https://example.invalid/N.png" }; }'),
  "../lib/org-api": dataModule('export async function listMyOrgs() { return []; }'),
  "../lib/auth/client": dataModule('export async function signOutEverywhere() {}'),
  "../ui/menu/FloatingMenu": dataModule('export function FloatingMenu() { return null; } export function FloatingMenuItem() { return null; } export function FloatingMenuSeparator() { return null; }'),
  "./DeviceStatusPopover": dataModule('export function DeviceStatusPopover() { return null; }'),
  "../leochat/LeoChatButton": dataModule('export function LeoChatButton() { return null; }'),
  "./SettingsModalHost": dataModule('export function openSettingsModal() {}'),
};
const { SidebarAccountCluster } = await import(await compileModule("src/shell/account/SidebarAccountCluster.tsx", stubs));

test("portal account avatar derives E from the same Elon Lee name, regardless of email or auth avatar", () => {
  const markup = renderToStaticMarkup(React.createElement(SidebarAccountCluster, {
    name: "Elon Lee", email: "not-the-name@example.invalid", signedIn: true,
    balanceText: "…", onOpenSettings() {}, onSignOut() {},
  }));
  assert.match(markup, /aria-label="Elon Lee"/);
  assert.match(markup, />E<\/span>/);
  assert.match(markup, />Elon Lee<\/span>/);
  assert.doesNotMatch(markup, /<img|>N<\/span>/);
});

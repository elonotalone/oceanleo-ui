/**
 * Website editor faces (native-editors wave, W09).
 *
 * Both faces are one Puck instance over the same Puck data object:
 *   normal = OceanLeo-composed layout (Puck.Preview / Puck.Fields / Puck.Outline /
 *            Puck.Components inside <Puck>), no Puck header, no Puck sidebars;
 *   pro    = Puck's own default full UI (components drawer, outline, canvas, fields).
 * Switching is a children swap on the same <Puck>; nothing is converted.
 *
 * Save / publish / undo only live in the OceanLeo top bar, so Puck's header
 * (title, Publish, undo/redo, sidebar toggles) is replaced by an empty fragment
 * in BOTH faces and no `onPublish` is ever passed.
 */
import { createElement, Fragment, type ReactElement } from "react";
import type { Overrides } from "@puckeditor/core";

export type WebsiteFace = "normal" | "pro";

export function websiteFaceForMode(mode: string | null | undefined): WebsiteFace {
  return mode === "pro" ? "pro" : "normal";
}

function EmptyOverride(): ReactElement {
  return createElement(Fragment);
}

export const WEBSITE_PUCK_OVERRIDES: Partial<Overrides> = Object.freeze({
  header: EmptyOverride,
  headerActions: EmptyOverride,
});

/** Puck palette mapped onto OceanLeo tokens (host theme, no Puck branding colours). */
export const WEBSITE_PUCK_THEME_VARS: Readonly<Record<string, string>> = Object.freeze({
  "--puck-font-family": "inherit",
  "--puck-color-azure-04": "var(--accent, #1F6FEB)",
  "--puck-color-azure-05": "var(--accent, #1F6FEB)",
  "--puck-color-azure-06": "var(--accent, #1F6FEB)",
  "--puck-color-interactive": "var(--accent, #1F6FEB)",
});

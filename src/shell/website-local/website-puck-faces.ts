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

/**
 * Puck palette mapped onto OceanLeo tokens (host theme, no Puck branding colours).
 *
 * D6/D7 (2026-10-23, W14): Puck's panels, fields and outlines follow the site's
 * light / dark theme through the shell's `--awb-*` tokens. Puck declares its
 * tokens on `:root` inside `@layer puck-tokens`, so these inline values win for
 * everything under the stage. The website preview itself paints with the
 * site's own colours (see `website-site-render.tsx`), not with these.
 */
export const WEBSITE_PUCK_THEME_VARS: Readonly<Record<string, string>> = Object.freeze({
  "--puck-font-family": "inherit",
  "--puck-color-azure-04": "var(--awb-accent, var(--accent, #1F6FEB))",
  "--puck-color-azure-05": "var(--awb-accent, var(--accent, #1F6FEB))",
  "--puck-color-azure-06": "var(--awb-accent, var(--accent, #1F6FEB))",
  "--puck-color-azure-07": "var(--awb-accent-soft, #cfdff0)",
  "--puck-color-azure-09": "var(--awb-accent-soft, #cfdff0)",
  "--puck-color-interactive": "var(--awb-accent, var(--accent, #1F6FEB))",
  "--puck-color-interactive-hover": "var(--awb-accent, #1F6FEB)",
  "--puck-color-interactive-active": "var(--awb-accent, #1F6FEB)",
  "--puck-color-interactive-soft": "var(--awb-accent-soft, #e7eef7)",
  "--puck-color-interactive-soft-hover": "var(--awb-accent-soft, #e7eef7)",
  "--puck-color-interactive-subtle": "var(--awb-hover, #f5f5f5)",
  "--puck-color-interactive-neutral-hover": "var(--awb-hover, #f5f5f5)",
  "--puck-color-focus-ring": "var(--awb-accent, #1F6FEB)",
  "--puck-color-selection-border": "var(--awb-accent, #1F6FEB)",
  "--puck-color-selection-bg": "var(--awb-accent-soft, #e7eef7)",
  "--puck-color-surface": "var(--awb-chrome-bg, #ffffff)",
  "--puck-color-surface-subtle": "var(--awb-stage-bg, #fafafa)",
  "--puck-color-surface-muted": "var(--awb-hover, #f5f5f5)",
  "--puck-color-surface-inverse": "var(--awb-text, #181818)",
  "--puck-color-text": "var(--awb-text, #181818)",
  "--puck-color-text-secondary": "var(--awb-muted, #5a5a5a)",
  "--puck-color-text-muted": "var(--awb-muted, #767676)",
  "--puck-color-text-subtle": "var(--awb-muted, #767676)",
  "--puck-color-text-inverse": "var(--awb-chrome-bg, #ffffff)",
  "--puck-color-text-disabled": "var(--awb-muted, #ababab)",
  "--puck-color-border": "var(--awb-border, #dcdcdc)",
  "--puck-color-border-hover": "var(--awb-muted, #767676)",
  "--puck-color-border-muted": "var(--awb-border, #efefef)",
  "--puck-color-border-inverse": "var(--awb-chrome-bg, #ffffff)",
  "--puck-color-white": "var(--awb-chrome-bg, #ffffff)",
  "--puck-color-black": "var(--awb-text, #000000)",
  "--puck-color-grey-05": "var(--awb-muted, #767676)",
  "--puck-color-grey-07": "var(--awb-muted, #ababab)",
  "--puck-color-grey-09": "var(--awb-border, #dcdcdc)",
  "--puck-color-grey-10": "var(--awb-border, #efefef)",
  "--puck-color-grey-11": "var(--awb-hover, #f5f5f5)",
  "--puck-color-grey-12": "var(--awb-stage-bg, #fafafa)",
  "--puck-color-line-placeholder": "var(--awb-accent, #1F6FEB)",
  "--puck-color-overlay-backdrop": "color-mix(in srgb, var(--awb-text, #000) 30%, transparent)",
});

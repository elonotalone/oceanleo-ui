// Logged-in Chromium on the LeoDev portal slot, for editor acceptance.
// The token arrives on stdin (see run.mjs); it is never printed or written to disk.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire("/root/.npm/_npx/a50edfa03303c0a4/node_modules/");
const { chromium } = require("playwright");

export const BASE =
  process.env.LEODEV_BASE || "https://p-511af16886fbb22b5ab2367528b458ba.dev.oceanleo.com";
const CHROME = "/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome";
const AUTH_KEY = "sb-kvrtcumcmhyqhmawpzyc-auth-token";
const CHUNK = 3180;

function sessionCookies(token) {
  const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  const session = {
    access_token: token,
    refresh_token: "acceptance-no-refresh",
    token_type: "bearer",
    expires_in: claims.exp - Math.floor(Date.now() / 1000),
    expires_at: claims.exp,
    user: {
      id: claims.sub,
      aud: claims.aud || "authenticated",
      role: claims.role || "authenticated",
      email: claims.email || "",
      app_metadata: claims.app_metadata || {},
      user_metadata: claims.user_metadata || {},
    },
  };
  const encoded = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const parts = [];
  for (let i = 0; i < encoded.length; i += CHUNK) parts.push(encoded.slice(i, i + CHUNK));
  return {
    userId: claims.sub,
    expiresAt: claims.exp,
    cookies: parts.map((value, index) => ({
      name: parts.length === 1 ? AUTH_KEY : `${AUTH_KEY}.${index}`,
      value,
      domain: ".oceanleo.com",
      path: "/",
      expires: claims.exp,
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
    })),
  };
}

/**
 * theme: "light" | "dark" (host theme cookie; editors must follow it).
 * Returns { browser, context, page, userId, log, shot }.
 */
export async function launch({
  token,
  theme = "light",
  viewport = { width: 1440, height: 900 },
  outDir = process.env.OUT_DIR || "/tmp/editor-acceptance",
  headless = true,
} = {}) {
  if (!token) throw new Error("no token on stdin");
  fs.mkdirSync(outDir, { recursive: true });
  const { cookies, userId } = sessionCookies(token);
  const browser = await chromium.launch({ headless, executablePath: CHROME });
  const context = await browser.newContext({
    viewport,
    colorScheme: theme === "dark" ? "dark" : "light",
  });
  await context.addCookies([
    ...cookies,
    {
      name: "oceanleo-theme",
      value: theme,
      domain: ".oceanleo.com",
      path: "/",
      expires: Math.floor(Date.now() / 1000) + 86400,
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
    },
  ]);
  const overlay = cookies.map((c) => ({ name: c.name, value: c.value }));
  await context.addInitScript(
    ({ entries, mode }) => {
      try {
        localStorage.setItem("oceanleo-leodev-auth-overlay", JSON.stringify(entries));
        localStorage.setItem("oceanleo-theme", mode);
      } catch {}
    },
    { entries: overlay, mode: theme },
  );
  const page = await context.newPage();
  const t0 = Date.now();
  const lines = [];
  const log = (...parts) => {
    const line = `[${((Date.now() - t0) / 1000).toFixed(1)}s] ${parts.join(" ")}`;
    lines.push(line);
    console.log(line);
  };
  page.on("pageerror", (error) => log("pageerror", String(error).slice(0, 400)));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/Fast Refresh|HMR|Download the React DevTools/.test(text)) return;
    log("console.error", text.slice(0, 400));
  });
  const shot = async (name) => {
    const file = path.join(outDir, `${name}.png`);
    await page.screenshot({ path: file });
    log("screenshot", file);
    return file;
  };
  const flushLog = (name = "run") =>
    fs.writeFileSync(path.join(outDir, `${name}.log`), lines.join("\n") + "\n");
  return { browser, context, page, userId, log, shot, flushLog, outDir };
}

/** Navigate inside the slot and wait until the app shell (not a sign-in wall) is up. */
export async function gotoApp(page, route = "/library", { timeout = 150000 } = {}) {
  await page.goto(new URL(route, BASE).toString(), { waitUntil: "domcontentloaded", timeout });
  // Dev compiles on first hit; the sidebar's Library entry is the stable marker.
  await page
    .locator("a[href*='/library'], [data-sidebar-item='library']")
    .first()
    .waitFor({ timeout })
    .catch(() => {});
}

/**
 * Upload files through My library → Upload file and wait until the button is idle again.
 * Copy fixtures to "[Wxx] name.ext" first so other owners can tell items apart.
 */
export async function uploadFiles(page, files, { timeout = 180000 } = {}) {
  await gotoApp(page, "/library");
  const input = page.locator("input[type=file]").first();
  await input.waitFor({ state: "attached", timeout: 60000 });
  // The input stays disabled until the library knows the owner; files set before that are dropped.
  const ready = Date.now();
  while (await input.isDisabled().catch(() => true)) {
    if (Date.now() - ready > 60000) throw new Error("upload input never enabled");
    await page.waitForTimeout(500);
  }
  await input.setInputFiles(files);
  const started = Date.now();
  await page.waitForTimeout(1000);
  while (Date.now() - started < timeout) {
    const busy = await page
      .getByText(/上传中…|Uploading…/)
      .first()
      .isVisible()
      .catch(() => false);
    if (!busy) return;
    await page.waitForTimeout(1000);
  }
  throw new Error("upload did not finish");
}

/** Current top-bar save state of the open editor ("saved" | "saving" | "error" | "unconfirmed" | null). */
export async function saveState(page) {
  return page
    .locator("[data-workspace-save-launcher]")
    .first()
    .getAttribute("data-save-state", { timeout: 2000 })
    .catch(() => null);
}

/** Wait until the editor reports saved (fails loudly on error/timeout). */
export async function waitSaved(page, { timeout = 60000 } = {}) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    last = await saveState(page);
    if (last === "saved") return last;
    if (last === "error") throw new Error("save reported error");
    await page.waitForTimeout(500);
  }
  throw new Error(`save did not settle (last state ${last})`);
}

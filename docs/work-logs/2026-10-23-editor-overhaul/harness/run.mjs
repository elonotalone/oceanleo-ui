// Usage (token never touches the terminal):
//   bash harness/mint.sh | OUT_DIR=/tmp/x node harness/run.mjs <scenario.mjs> [args…]
// A scenario module default-exports async ({ page, context, browser, log, shot, args, helpers }) => void.
// Env: THEME=light|dark, LEODEV_BASE, VIEWPORT=1440x900, HEADFUL=1.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as helpers from "./session.mjs";

const token = fs.readFileSync(0, "utf8").trim();
const [, , scenarioPath, ...args] = process.argv;
if (!scenarioPath) {
  console.error("usage: mint.sh | node run.mjs <scenario.mjs> [args…]");
  process.exit(2);
}
const [w, h] = String(process.env.VIEWPORT || "1440x900").split("x").map(Number);
const session = await helpers.launch({
  token,
  theme: process.env.THEME === "dark" ? "dark" : "light",
  viewport: { width: w || 1440, height: h || 900 },
  headless: process.env.HEADFUL !== "1",
});
let exitCode = 0;
try {
  const scenario = await import(pathToFileURL(path.resolve(scenarioPath)).href);
  await scenario.default({ ...session, args, helpers });
} catch (error) {
  exitCode = 1;
  session.log("FAILED", error?.stack || String(error));
  await session.shot("failure").catch(() => {});
} finally {
  session.flushLog(path.basename(scenarioPath, ".mjs"));
  await session.browser.close();
}
process.exit(exitCode);

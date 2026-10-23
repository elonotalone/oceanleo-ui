// W16 debug: reproduce 「加节点」 → crash and capture the full console stack.
import { OWN_FORK, canvasInfo, openCanvas } from "./_w16-lib.mjs";

export default async function ({ page, log, shot, helpers, args }) {
  await openCanvas(page, helpers, log, args[0] || OWN_FORK);
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/Maximum update|crashed/.test(text)) log("FULL", text.slice(0, 6000).replace(/https:\/\/[^ )]*chunks\//g, ""));
  });
  const mode = args[1] || "drawer";
  if (mode === "drawer") {
    await page.locator(".react-flow__pane").click({ position: { x: 40, y: 300 } });
    await page.getByRole("button", { name: /^(加节点|Add node)$/ }).first().click();
    await page.waitForTimeout(800);
    await page.locator('[data-testid=video-canvas-add-node][data-node-kind="video"]').click();
  } else if (mode === "drawer-then-select") {
    await page.locator(".react-flow__pane").click({ position: { x: 40, y: 300 } });
    await page.getByRole("button", { name: /^(加节点|Add node)$/ }).first().click();
    await page.waitForTimeout(800);
    await page.locator('[data-testid=video-canvas-node][data-node-id="shot-4"]').click();
  } else {
    await page.locator('[data-testid=video-canvas-node][data-node-id="shot-4"]').click();
    await page.getByRole("button", { name: /^(复制一份|Duplicate)$/ }).first().click();
  }
  await page.waitForTimeout(3000);
  log("after", JSON.stringify((await canvasInfo(page)).nodes.length));
  await shot(`s6-${mode}`);
}

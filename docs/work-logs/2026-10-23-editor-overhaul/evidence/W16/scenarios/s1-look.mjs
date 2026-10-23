// W16: open own video canvas, record theme/nodes, select a node (edit bar), open 「加节点」 drawer. Screenshots only.
import { OWN_FORK, canvasInfo, editBarButtons, openCanvas } from "./_w16-lib.mjs";

export default async function ({ page, log, shot, helpers, args }) {
  const theme = process.env.THEME === "dark" ? "dark" : "light";
  await openCanvas(page, helpers, log, args[0] || OWN_FORK);
  log("info", JSON.stringify(await canvasInfo(page)));
  log("bar-empty", JSON.stringify(await editBarButtons(page)));
  await shot(`s1-${theme}-01-canvas`);
  await page.locator(".react-flow__node").nth(1).click();
  await page.waitForTimeout(1200);
  log("bar-node", JSON.stringify(await editBarButtons(page)));
  await shot(`s1-${theme}-02-node-selected`);
  const params = page.getByRole("button", { name: /节点参数|Node settings/ }).first();
  if (await params.count()) {
    await params.click();
    await page.waitForTimeout(1000);
    await shot(`s1-${theme}-03-node-params`);
    await page.keyboard.press("Escape");
  } else log("params", "no params button");
  await page.locator(".react-flow__pane").click({ position: { x: 30, y: 30 } });
  await page.waitForTimeout(800);
  const add = page.getByRole("button", { name: /加节点|Add node/ }).first();
  log("add-node-button", String(await add.count()));
  if (await add.count()) {
    await add.click();
    await page.waitForTimeout(1000);
    await shot(`s1-${theme}-04-add-node-drawer`);
  }
}

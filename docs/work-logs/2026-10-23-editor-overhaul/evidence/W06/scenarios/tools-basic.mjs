import { openPdf, pageBox, tool, editBar, saveTrace } from "./_w06-lib.mjs";
// args: <artifactId>
export default async function ({ page, log, shot, helpers, args }) {
  await openPdf(page, helpers, log, args[0]);
  log("editbar empty", JSON.stringify(await editBar(page)));
  let box = await pageBox(page, 0);
  log("page box", JSON.stringify(box));
  const at = (x, y) => [box.x + x * box.scale, box.y + y * box.scale];
  // 1) highlight: tool first, then drag across the paragraph line
  await tool(page, "pdf-tool-highlight");
  log("editbar highlight tool", JSON.stringify(await editBar(page)));
  let [x1, y1] = at(74, 221);
  let [x2, y2] = at(400, 221);
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(1200);
  await shot("t1-highlight");
  log("editbar after highlight", JSON.stringify(await editBar(page)));
  await tool(page, "pdf-tool-highlight");
  await saveTrace(page, helpers, log, "after highlight");
  // 2) check mark at the first "[ ]"
  await tool(page, "pdf-tool-check");
  [x1, y1] = at(77, 191);
  await page.mouse.click(x1, y1);
  await page.waitForTimeout(800);
  await page.keyboard.press("Escape");
  await tool(page, "pdf-tool-check");
  // 3) add text after "Name:"
  await tool(page, "pdf-tool-text");
  [x1, y1] = at(120, 132);
  await page.mouse.click(x1, y1);
  await page.waitForTimeout(800);
  await page.keyboard.type("Zhang San 张三");
  await page.waitForTimeout(500);
  [x1, y1] = at(400, 500);
  await page.mouse.click(x1, y1);
  await page.waitForTimeout(800);
  await shot("t2-check-text");
  log("editbar after text", JSON.stringify(await editBar(page)));
  await saveTrace(page, helpers, log, "after check+text");
  log("tool active?", JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("[data-workspace-action-id^=pdf-tool]")].filter((b) => b.getAttribute("aria-pressed") === "true" || /selected|primary/.test(b.className)).map((b) => b.getAttribute("data-workspace-action-id")))));
}

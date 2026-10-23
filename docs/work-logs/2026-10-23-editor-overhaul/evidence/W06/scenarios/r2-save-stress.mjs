// R2: N quick change→save cycles; logs every 4xx/5xx API response with its body. args: <artifactId> [cycles]
import { openPdf, pageBox, tool, saveTrace } from "./_w06-lib.mjs";
export default async function ({ page, log, shot, helpers, args }) {
  page.on("response", async (response) => {
    if (response.status() < 400 || !/api\.dev\.oceanleo\.com|\/v1\//.test(response.url())) return;
    const body = await response.text().catch(() => "");
    log("HTTP", response.status(), response.request().method(), response.url().replace(/\?.*$/, "").slice(0, 140), body.slice(0, 600));
  });
  page.on("request", (request) => {
    if (request.method() !== "GET" && /\/v1\/(artifacts|database|creations)/.test(request.url())) {
      log("REQ", request.method(), request.url().replace(/\?.*$/, "").slice(0, 140), (request.postData() || "").slice(0, 300));
    }
  });
  await openPdf(page, helpers, log, args[0]);
  const box = await pageBox(page, 0);
  const at = (x, y) => [box.x + x * box.scale, box.y + y * box.scale];
  const cycles = Number(args[1] || 4);
  for (let index = 0; index < cycles; index += 1) {
    const tools = ["pdf-tool-check", "pdf-tool-cross", "pdf-tool-ink", "pdf-tool-note"];
    const id = tools[index % tools.length];
    await tool(page, id);
    if (id === "pdf-tool-ink") {
      await page.mouse.move(...at(100 + index * 20, 600));
      await page.mouse.down();
      await page.mouse.move(...at(220 + index * 20, 650), { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(1500);
    } else {
      await page.mouse.click(...at(300 + index * 30, 450 + index * 10));
      await page.waitForTimeout(700);
    }
    await page.keyboard.press("Escape");
    await tool(page, id);
    log("cycle", index, id, "→", await saveTrace(page, helpers, log, `cycle ${index}`, 60000));
  }
  await shot("stress");
}

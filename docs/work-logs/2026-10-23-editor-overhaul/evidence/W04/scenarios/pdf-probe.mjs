// Why does the PDF stage stay empty? Open, wait, list the large elements in the stage area.
// args: id:<artifactId>
import { guardProduction, openFromLibrary, sleep, writeJson } from "./_w04-lib.mjs";

export default async function ({ page, context, log, shot, helpers, args, outDir }) {
  await guardProduction(context, log);
  page.on("response", (response) => {
    if (response.status() >= 400) log("HTTP", response.status(), response.request().method(), new URL(response.url()).pathname.slice(0, 120));
  });
  await openFromLibrary(page, helpers, args[0], log);
  await sleep(30000);
  await shot("pdf-probe");
  const nodes = await page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { tag: el.tagName, cls: String(el.className?.baseVal ?? el.className).slice(0, 80), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), text: (el.childElementCount ? "" : el.textContent || "").trim().slice(0, 40) };
      })
      .filter((n) => n.x > 390 && n.y > 100 && n.w > 150 && n.h > 150),
  );
  writeJson(outDir, "pdf-probe", nodes);
  log("nodes", JSON.stringify(nodes.slice(0, 40)));
}

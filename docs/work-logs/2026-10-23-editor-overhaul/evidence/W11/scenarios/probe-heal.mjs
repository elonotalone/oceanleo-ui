// W11 debug: trace grant refresh / import / media GETs while the editor opens a stored project.
import { openVideoEditor } from "./w11-lib.mjs";

export default async function ({ page, log, shot, helpers, args }) {
  page.on("response", async (response) => {
    const url = response.url();
    const method = response.request().method();
    if (/renditions\/[a-z_]+\/url|media\/import/.test(url)) {
      const body = await response.text().catch(() => "");
      log(method, response.status(), url.replace(/\?.*$/, "").slice(-80), body.replace(/eyJ[A-Za-z0-9._-]+/g, "<grant>").slice(0, 300));
    } else if (/artifact-renditions\/access\//.test(url)) {
      log(method, response.status(), "access", url.split("/access/")[1].slice(0, 12), response.headers()["content-type"] || "");
    }
  });
  page.on("requestfailed", (request) => {
    if (/artifact-renditions|storage\/v1/.test(request.url())) log("requestfailed", request.url().slice(0, 120), request.failure()?.errorText);
  });
  await openVideoEditor(page, helpers, log, args[0], { timeout: 90000 });
  await shot("heal");
}

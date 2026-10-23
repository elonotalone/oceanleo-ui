// W07 §5.3: open a public deck template → first edit lands in ONE fork → later saves go to the same fork.
// Logs each revision POST's CAS base so a stale baseline is visible.
// args: <templateArtifactId> [tag]
export default async function ({ page, log, shot, helpers, args }) {
  await page.addInitScript(() => { window.__W07_DEBUG__ = true; });
  page.on("console", (message) => {
    if (message.text().startsWith("[w07-debug]")) log("debug", message.text().slice(0, 1500));
  });
  const [artifactId, tag = "fork"] = args;
  if (!artifactId) throw new Error("template artifact id required");
  const text = () => page.locator("[data-deck-canvas] [data-deck-element][data-element-type=text]").first();
  page.on("request", (request) => {
    const url = request.url();
    if (request.method() !== "POST" || !/\/v1\/artifacts\//.test(url)) return;
    let body = {};
    try {
      body = JSON.parse(request.postData() || "{}");
    } catch {}
    const path = url.replace(/^https?:\/\/[^/]+/, "").slice(0, 100);
    if (/\/revisions$/.test(path)) {
      log("req revisions", path, "expected=", body.expectedRevisionId, "editorRevision=", body.provenance?.editorRevision, "editor=", body.provenance?.editor);
    } else if (/:fork$/.test(path)) {
      log("req fork", path);
    }
  });
  page.on("response", async (response) => {
    const url = response.url();
    const method = response.request().method();
    if (method === "GET" || method === "HEAD" || /agent_tasks|agent\/sessions|agent_console/.test(url)) return;
    if (!/\/v1\/artifacts\//.test(url)) {
      log("res-other", method, response.status(), url.replace(/^https?:\/\/[^/]+/, "").slice(0, 100));
      return;
    }
    let note = "";
    if (/\/revisions$|:fork$/.test(url)) {
      const body = await response.json().catch(() => null);
      note = JSON.stringify({ code: body?.code, rev: body?.revisionId || body?.revision_id || body?.data?.revisionId, id: body?.artifactId || body?.id }).slice(0, 200);
    }
    log("res", response.status(), url.replace(/^https?:\/\/[^/]+/, "").slice(0, 100), note);
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) log("nav", frame.url().replace(/^https?:\/\/[^/]+/, ""));
  });
  const states = [];
  const watch = setInterval(async () => {
    const state = await helpers.saveState(page);
    const loading = await page.getByText(/Loading presentation|正在载入演示文稿/).first().isVisible().catch(() => false);
    const key = `${state}${loading ? "+loading" : ""}`;
    if (states[states.length - 1] !== key) {
      states.push(key);
      log("state", key, await page.evaluate(() => location.search));
    }
  }, 250);
  const waitCycle = async (label) => {
    // A click leaves the launcher on "saved" for a moment; wait for it to leave, then come back.
    const start = Date.now();
    while (Date.now() - start < 8000 && (await helpers.saveState(page)) === "saved") await page.waitForTimeout(200);
    await helpers.waitSaved(page, { timeout: 120000 });
    log(label, "saved", await page.evaluate(() => location.search));
  };
  try {
    await helpers.gotoApp(page, `/library?item=${artifactId}`);
    await page.locator("[data-deck-thumbnail-rail], [data-workspace-save-launcher]").first().waitFor({ timeout: 150000 });
    await page.waitForTimeout(1500);
    if (!(await page.locator("[data-workspace-save-launcher]").count())) {
      const name = await page.evaluate(() =>
        [...document.querySelectorAll("button")]
          .map((b) => b.getAttribute("aria-label") || b.title || "")
          .find((label) => /^编辑「|^Edit /.test(label)),
      );
      log("edit button", name || "(none)");
      if (name) await page.getByRole("button", { name, exact: true }).first().click();
    }
    await page.locator("[data-workspace-save-launcher]").first().waitFor({ timeout: 150000 });
    await page.locator("[data-deck-canvas]").first().waitFor({ timeout: 150000 });
    await page.getByText(/Loading presentation|正在载入演示文稿/).first().waitFor({ state: "hidden", timeout: 150000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await shot(`${tag}-open`);
    for (const [index, control] of ["bold", "strike", "italic"].entries()) {
      await text().click({ force: true });
      await page.waitForTimeout(600);
      await page.locator(`[data-selection-control-id="${control}"] button, button[data-selection-control-id="${control}"]`).first().click();
      await page.waitForTimeout(400);
      await waitCycle(`edit-${index + 1}-${control}`);
    }
    await shot(`${tag}-after-edits`);
  } finally {
    clearInterval(watch);
    log("states", JSON.stringify(states));
  }
}

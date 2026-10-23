// R2: every basic tool once, the selection bar, the page rail, pro edit, and the save
// protocol (§5 items 1, 2, 5) on one of my own PDFs. args: <artifactId> [skip-tools]
// Writes `<OUT_DIR>/download.pdf` (the editor's own download) for an outside-reader check.
import fs from "node:fs";
import path from "node:path";
import { openPdf, pageBox, tool, editBar, saveTrace, viewerChrome } from "./_w06-lib.mjs";

const revision = (page) =>
  page.evaluate(() => Number(document.querySelector("[data-pdf-revision]")?.getAttribute("data-pdf-revision") || -1));

export default async function ({ page, log, shot, helpers, args, outDir }) {
  const id = args[0];
  await openPdf(page, helpers, log, id);
  const instance = await page.locator("[data-pdf-viewer-instance]").getAttribute("data-pdf-viewer-instance");
  log("instance", instance, "editbar", JSON.stringify(await editBar(page)));
  let box = await pageBox(page, 0);
  log("page box", JSON.stringify(box));
  const at = (x, y) => [box.x + x * box.scale, box.y + y * box.scale];
  const drag = async ([x1, y1], [x2, y2]) => {
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move(x2, y2, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(1000);
  };
  const step = async (label, run) => {
    const before = await revision(page);
    try {
      await run();
    } catch (error) {
      log("STEP FAILED", label, String(error).slice(0, 300));
    }
    await page.waitForTimeout(600);
    log("step", label, "revision", before, "→", await revision(page));
  };

  // §5.1 first change → saved
  await step("highlight (tool then drag)", async () => {
    await tool(page, "pdf-tool-highlight");
    log("palette", await page.locator("[data-pdf-tool-palette]").count());
    await drag(at(74, 221), at(400, 221));
    await tool(page, "pdf-tool-highlight");
  });
  await shot("p1-highlight");
  log("save#1", await saveTrace(page, helpers, log, "after highlight"));

  // §5.1 second change → saved
  await step("check ✓", async () => {
    await tool(page, "pdf-tool-check");
    await page.mouse.click(...at(77, 191));
    await page.waitForTimeout(600);
    await tool(page, "pdf-tool-check");
  });
  log("save#2", await saveTrace(page, helpers, log, "after check"));

  if (args[1] !== "skip-tools") {
    await step("cross ✗", async () => {
      await tool(page, "pdf-tool-cross");
      await page.mouse.click(...at(209, 191));
      await page.waitForTimeout(600);
      await tool(page, "pdf-tool-cross");
    });
    await step("underline", async () => {
      await tool(page, "pdf-tool-underline");
      await drag(at(74, 249), at(200, 249));
      await tool(page, "pdf-tool-underline");
    });
    await step("strikeout (red from palette)", async () => {
      await tool(page, "pdf-tool-strikeout");
      await page.locator("[data-pdf-tool-palette] [aria-label='#E44234']").click().catch(() => log("no red swatch"));
      await drag(at(250, 249), at(400, 249));
      await tool(page, "pdf-tool-strikeout");
    });
    await step("add text", async () => {
      await tool(page, "pdf-tool-text");
      await page.mouse.click(...at(125, 128));
      await page.waitForTimeout(800);
      await page.keyboard.type("Zhang San 张三");
      await page.waitForTimeout(400);
      await page.mouse.click(...at(450, 420));
      await page.waitForTimeout(600);
      await page.keyboard.press("Escape");
    });
    log("editbar after text", JSON.stringify(await editBar(page)));
    await step("brush (ink)", async () => {
      await tool(page, "pdf-tool-ink");
      await drag(at(100, 600), at(260, 640));
      await page.waitForTimeout(1500);
      await tool(page, "pdf-tool-ink");
    });
    await step("note", async () => {
      await tool(page, "pdf-tool-note");
      await page.mouse.click(...at(470, 400));
      await page.waitForTimeout(800);
      await page.keyboard.press("Escape");
      await tool(page, "pdf-tool-note");
    });
    await step("signature (typed, saved, placed)", async () => {
      await tool(page, "pdf-tool-signature");
      await page.waitForTimeout(500);
      await page.getByRole("button", { name: /^(打字|Type)$/ }).first().click();
      await page.locator("input").last().fill("Zhang San");
      await page.getByRole("button", { name: /存下并放到页面|Save and place/ }).first().click();
      await page.waitForTimeout(1500);
      await page.keyboard.press("Escape");
    });
    await shot("p2-all-tools");
    await step("find", async () => {
      await tool(page, "pdf-tool-find");
      const input = page.getByRole("textbox", { name: /在文档里查找|Find in document/ });
      await input.fill("paragraph");
      await input.press("Enter");
      await page.waitForTimeout(1500);
      log("find count", await page.locator("[aria-live=polite]").first().textContent().catch(() => "?"));
      await shot("p3-find");
      await input.press("Escape");
    });
    // selection bar: select the highlight, read the bar, change opacity via keyboard-free path: delete the note instead
    await step("select highlight → bar shows its properties", async () => {
      await page.mouse.click(...at(150, 221));
      await page.waitForTimeout(800);
      log("editbar highlight selected", JSON.stringify(await editBar(page)));
      await shot("p4-selected-highlight");
      await page.keyboard.press("Escape");
    });
    await step("select note → delete from the bar", async () => {
      await page.mouse.click(...at(476, 406));
      await page.waitForTimeout(800);
      log("editbar note selected", JSON.stringify(await editBar(page)));
      const del = page.locator("[data-workspace-edit-bar] button[aria-label='Delete'], [data-workspace-edit-bar] button[aria-label='删除']").first();
      log("delete button", await del.count());
      if (await del.count()) await del.click();
      await page.waitForTimeout(800);
    });
    await step("undo (top bar)", async () => {
      await page.locator("button[aria-label='Undo'], button[aria-label='撤销']").first().click();
      await page.waitForTimeout(1200);
    });
    await shot("p5-after-undo");
    await step("redo (top bar)", async () => {
      await page.locator("button[aria-label='Redo'], button[aria-label='重做']").first().click();
      await page.waitForTimeout(1200);
    });
    log("save#3", await saveTrace(page, helpers, log, "after all tools"));

    // page rail: rotate page 2, move page 3 before page 1, delete page 2, undo the delete
    const thumb = (n) => page.locator(`[data-pdf-page-thumb="${n}"]`);
    await step("rail rotate p2", async () => {
      await thumb(2).hover();
      await page.locator('[data-pdf-page-rotate="2"]').click();
      await page.waitForTimeout(2500);
    });
    await step("rail drag p3 → p1", async () => {
      await thumb(3).dragTo(thumb(1));
      await page.waitForTimeout(2500);
    });
    await shot("p6-rail");
    await step("rail delete p2", async () => {
      await thumb(2).hover();
      await page.locator('[data-pdf-page-delete="2"]').click();
      await page.waitForTimeout(2500);
    });
    log("pages after delete", await page.locator("[data-pdf-page-thumb]").count());
    await step("undo the delete", async () => {
      await page.locator("button[aria-label='Undo'], button[aria-label='撤销']").first().click();
      await page.waitForTimeout(2500);
    });
    log("pages after undo", await page.locator("[data-pdf-page-thumb]").count());
    await shot("p7-rail-undo");
    log("save#4", await saveTrace(page, helpers, log, "after page rail"));
  }

  // pro edit: same instance, add a rectangle from the official Shapes toolbar
  await page.locator("button, [role=tab]").filter({ hasText: /^(专业编辑|Pro edit)$/ }).first().click();
  await page.waitForTimeout(300);
  log("pending after switch", await page.locator("[data-mode-switch-pending]").count());
  await page.waitForTimeout(1500);
  log("pro same instance", (await page.locator("[data-pdf-viewer-instance]").getAttribute("data-pdf-viewer-instance")) === instance);
  log("pro save launcher", await helpers.saveState(page));
  await step("pro: shapes → rectangle", async () => {
    await page.locator('[data-epdf-i="shapes-mode"]').first().click();
    await page.waitForTimeout(800);
    log("pro shapes chrome", JSON.stringify((await viewerChrome(page)).items));
    const square = page.locator('[data-epdf-i*="square"], [data-epdf-i*="rect"]').first();
    log("square count", await square.count());
    await square.click();
    box = await pageBox(page, 0);
    await drag(at(330, 300), at(480, 380));
    await page.waitForTimeout(800);
  });
  await shot("p8-pro-shape");
  log("save#5", await saveTrace(page, helpers, log, "after pro shape"));
  await page.locator("button, [role=tab]").filter({ hasText: /^(编辑|Edit)$/ }).first().click();
  await page.waitForTimeout(1500);

  // download through the ··· menu (the bytes another reader would get)
  try {
    await page.locator("button[aria-label*='More'], button[aria-label*='更多']").first().click();
    await page.waitForTimeout(500);
    await page.getByRole("menuitem", { name: /^(Download|下载)/ }).first().hover();
    await page.waitForTimeout(500);
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 20000 }),
      page.getByText(/Download PDF|直接下载 PDF/).first().click(),
    ]);
    const file = path.join(outDir, "download.pdf");
    await download.saveAs(file);
    log("downloaded", file, fs.statSync(file).size, "bytes");
  } catch (error) {
    log("download failed", String(error).slice(0, 300));
  }

  // close and reopen
  await page.locator("button[aria-label='Close'], button[aria-label='关闭']").last().click().catch(() => {});
  await page.waitForTimeout(2000);
  await openPdf(page, helpers, log, id);
  await shot("p9-reopened");
  await page.reload({ waitUntil: "domcontentloaded" });
  await openPdf(page, helpers, log, id);
  await shot("p10-refreshed");
  log("reopen save state", await helpers.saveState(page));
}

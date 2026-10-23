// W11: upload the W11-tagged video / image / audio fixtures into the acceptance account.
// Usage: bash harness/mint.sh | OUT_DIR=/tmp/w11-up node harness/run.mjs evidence/W11/scenarios/upload-fixtures.mjs [mp4|png|mp3 ...]
const ALL = {
  mp4: "/tmp/w11/[W11] sample.mp4",
  png: "/tmp/w11/[W11] sample.png",
  mp3: "/tmp/w11/[W11] sample.mp3",
  save: "/tmp/w11/[W11] save.mp4",
};

async function libraryReady(page, log, timeout = 240000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const state = await page.evaluate(() => ({
      loading: /Loading My Library|正在加载我的库/.test(document.body.innerText || ""),
      failed: /暂时无法加载我的库|Couldn.t load/.test(document.body.innerText || ""),
      compiling: /Compiling/.test(document.body.innerText || ""),
      inputs: [...document.querySelectorAll("input[type=file]")].map((el) => el.disabled),
    }));
    if (state.failed) {
      log("library load failed; pressing Retry");
      await page.getByRole("button", { name: /Retry|重试/ }).first().click().catch(() => {});
      await page.waitForTimeout(3000);
      continue;
    }
    if (!state.loading && !state.compiling && state.inputs.some((disabled) => !disabled)) return true;
    await page.waitForTimeout(1000);
  }
  log("library never became ready");
  return false;
}

export default async function ({ page, log, shot, helpers, args }) {
  page.on("response", (response) => {
    const url = response.url();
    if (response.status() >= 400 && /\/v1\/|\/api\//.test(url)) {
      log("http", response.status(), url.replace(/\?.*$/, "").slice(0, 160));
    }
  });
  const wanted = (args.length ? args : ["mp4"]).map((key) => ALL[key]).filter(Boolean);
  await helpers.gotoApp(page, "/library");
  if (!(await libraryReady(page, log))) {
    await shot("library-not-ready");
    throw new Error("library not ready");
  }
  log("uploading", wanted.join(", "));
  await helpers.uploadFiles(page, wanted);
  const titles = wanted.map((file) => file.split("/").pop());
  const started = Date.now();
  while (Date.now() - started < 120000) {
    const text = await page.evaluate(() => document.body.innerText || "");
    const missing = titles.filter((title) => !text.includes(title.replace(/\.[a-z0-9]+$/i, "")));
    if (!missing.length) break;
    await page.waitForTimeout(2000);
  }
  await shot("after-upload");
  log("done");
}

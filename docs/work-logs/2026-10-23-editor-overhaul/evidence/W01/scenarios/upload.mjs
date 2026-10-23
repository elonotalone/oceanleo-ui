// W01: upload own fixtures for chrome acceptance writes (favorite/download).
export default async ({ page, log, helpers, args }) => {
  await helpers.uploadFiles(page, args);
  log("uploaded", args.join(" | "));
};

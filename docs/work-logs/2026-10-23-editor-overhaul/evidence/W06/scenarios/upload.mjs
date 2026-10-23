// W06: upload fixtures named "[W06] …" into the acceptance account. args: <file…>
export default async function ({ page, log, helpers, args }) {
  await helpers.uploadFiles(page, args);
  log("uploaded", args.join(", "));
}

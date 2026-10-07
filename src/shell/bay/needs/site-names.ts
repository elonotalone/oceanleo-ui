// 过渡用：W03 的 `baySiteName`（`../shell/bay-links`）提交后整份删掉，改从那里 import。不再扩表。

/** 产品名不翻译；与门户 `lib/sites.tsx` 的 SITES 名字一致。 */
const SITE_NAMES: Record<string, string> = {
  oceanleo: "OceanLeo",
  agent: "LeoAgent",
  website: "Website",
  prompt: "LeoPrompt",
  aitools: "AI 工具导航",
  ecommerce: "LeoStudio",
  ppt: "LeoSlides",
  excel: "LeoSheet",
  word: "LeoDoc",
  converter: "LeoConvert",
  aihuman: "LeoHuman",
  image: "LeoImage",
  video: "LeoVideo",
  resume: "LeoResume",
  bizdev: "LeoBizDev",
  logo: "LeoLogo",
  interior: "LeoInterior",
  chat: "LeoChat",
  threed: "Leo3D",
  music: "LeoMusic",
  meeting: "LeoMeeting",
  paper: "LeoPaper",
  notebook: "LeoNote",
  law: "LeoLaw",
  study: "LeoStudy",
  edu: "LeoEdu",
  novel: "LeoNovel",
  script: "LeoScript",
  design: "LeoDesign",
  make: "LeoMake",
  search: "LeoSearch",
  finance: "LeoFinance",
  med: "LeoMed",
  travel: "LeoTravel",
  game: "LeoPlay",
  asset: "LeoAsset",
};

export function baySiteName(siteKey: string | null | undefined): string | null {
  const key = typeof siteKey === "string" ? siteKey.trim().toLowerCase() : "";
  return key ? SITE_NAMES[key] ?? null : null;
}

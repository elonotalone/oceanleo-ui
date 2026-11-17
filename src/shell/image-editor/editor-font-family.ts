/** Names used by desktop Noto/Source Han files and the hosted Google Noto faces. */
export function editorFontFamily(family: string): string {
  return family.split(",").map(part => {
    const name = part.trim().replace(/^["']|["']$/g, "");
    const compact = name.replace(/\s+/g, "");
    const match = /^(?:Noto(Sans|Serif)CJK|SourceHan(Sans|Serif))(SC|CN|TC|TW|HK|JP|KR)?(?:[- ]?(?:Regular|Light|Medium|Bold|Heavy))?$/i.exec(compact);
    const chinese = /^(思源黑体|思源宋体)(?:\s*(SC|CN|TC|TW|HK|JP|KR))?$/i.exec(name);
    if (!match && !chinese) return part.trim();
    const serif = match ? (match[1] || match[2]).toLowerCase() === "serif" : chinese![1] === "思源宋体";
    const region = (match?.[3] || chinese?.[2] || "SC").toUpperCase();
    const locale = /^(TC|TW|HK)$/.test(region) ? "TC" : /^(JP|KR)$/.test(region) ? region : "SC";
    return `Noto ${serif ? "Serif" : "Sans"} ${locale}`;
  }).join(", ");
}

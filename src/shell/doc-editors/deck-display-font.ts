/** Browser aliases only. The stored face is still used by PPTX save/export. */
export function deckDisplayFontFamily(family: string | undefined): string | undefined {
  if (!family) return family;
  let generic = "";
  const faces = family.split(",").map((part) => {
    const face = part.trim().replace(/^["']|["']$/g, "");
    const compact = face.replace(/\s+/g, "");
    const web = /^Noto(Sans|Serif)(SC|TC|JP|KR)$/i.exec(compact);
    if (web) {
      generic ||= web[1].toLowerCase() === "serif" ? "serif" : "sans-serif";
      return face;
    }
    const match = /^(?:Noto(Sans|Serif)CJK|SourceHan(Sans|Serif))(SC|CN|TC|TW|HK|JP|KR)?(?:[- ]?(?:Regular|Light|Medium|Bold|Heavy))?$/i.exec(compact);
    const chinese = /^(思源黑体|思源宋体)(?:\s*(SC|CN|TC|TW|HK|JP|KR))?$/i.exec(face);
    if (!match && !chinese) return part.trim();
    const serif = match ? (match[1] || match[2]).toLowerCase() === "serif" : chinese![1] === "思源宋体";
    const region = (match?.[3] || chinese?.[2] || "SC").toUpperCase();
    const locale = /^(?:TC|TW|HK)$/.test(region) ? "TC" : region === "JP" ? "JP" : region === "KR" ? "KR" : "SC";
    generic ||= serif ? "serif" : "sans-serif";
    return `Noto ${serif ? "Serif" : "Sans"} ${locale}`;
  });
  if (generic && !faces.includes(generic)) faces.push(generic);
  return faces.join(", ");
}

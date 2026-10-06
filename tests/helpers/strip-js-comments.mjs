// 去掉行注释与块注释，保留字符串与模板字符串里的字面量。扫描回放模板时用，避免把注释里的举例 tt("中文模板 {n}") 当成真模板。
export function stripJsComments(source) {
  let out = "";
  for (let i = 0; i < source.length; ) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < source.length) {
        const cur = source[i];
        out += cur;
        if (cur === "\\") {
          if (i + 1 < source.length) {
            out += source[i + 1];
            i += 2;
            continue;
          }
        }
        if (cur === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (ch === "/" && next === "/") {
      i += 2;
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i + 1 < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") out += "\n";
        i += 1;
      }
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

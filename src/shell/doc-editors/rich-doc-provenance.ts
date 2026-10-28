import type { LibraryItem } from "../library-data";
import { aigcLabelActive, AIGC_TEXT_NOTICE, withAigcTextNotice } from "../../contracts/aigc-label";

/** Only the server's typed provenance is authoritative; titles/body/upload flags are not. */
export function richDocIsGenerated(item: LibraryItem): boolean {
  const provenance = item.artifact?.provenance;
  if (typeof provenance?.generatedOrigin === "boolean") return provenance.generatedOrigin;
  return provenance?.sourceKind === "generated";
}

export function richDocLabeledText(text: string, generated: boolean): string {
  return generated ? withAigcTextNotice(text) : text;
}

export function richDocLabeledHtml(html: string, generated: boolean): string {
  if (!generated || !aigcLabelActive()) return html;
  const notice = `<p>${AIGC_TEXT_NOTICE}</p>`;
  const body = html.match(/<body(?:\s[^>]*)?>([\s\S]*)/i)?.[1] ?? html;
  if (body.trimStart().startsWith(notice)) return html;
  return /<body(?:\s[^>]*)?>/i.test(html)
    ? html.replace(/(<body(?:\s[^>]*)?>)/i, `$1${notice}`)
    : notice + html;
}

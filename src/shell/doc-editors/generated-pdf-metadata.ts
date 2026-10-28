import { aigcLabelActive, aigcMetadata } from "../../contracts/aigc-label";

/** The DOCX conversion already carries the visible notice. Preserve all page streams/fonts. */
export async function labelGeneratedPdf(blob: Blob, generated: boolean): Promise<Blob> {
  if (!generated || !aigcLabelActive()) return blob;
  const { PDFDocument, PDFName, PDFDict, PDFRawStream, PDFRef, decodePDFRawStream } = await import("pdf-lib");
  const pdf = await PDFDocument.load(await blob.arrayBuffer());
  const payload = aigcMetadata(`OL-${crypto.randomUUID()}`).AIGC;
  // GB 45438-2025 6.1(c) requires ONE copy, held in XMP, not Info + XMP.
  const info = pdf.context.lookup(pdf.context.trailerInfo.Info, PDFDict);
  for (const key of info.keys()) {
    if (key.decodeText().toUpperCase().includes("AIGC")) info.delete(key);
  }
  const xml = payload.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const description = `<rdf:Description rdf:about="" xmlns:AIGC="http://www.ai-gc.com/1.0/"><AIGC:AIGC>${xml}</AIGC:AIGC></rdf:Description>`;
  const previousObject = pdf.catalog.lookup(PDFName.of("Metadata"));
  const previous = previousObject instanceof PDFRawStream ? previousObject : undefined;
  const previousXml = previous ? new TextDecoder().decode(decodePDFRawStream(previous).decode())
    .replace(/<((?:[\w.-]+:)?AIGC)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/\s+((?:(?!xmlns:)[\w.-]+:)?AIGC)\s*=\s*(["'])[\s\S]*?\2/gi, "") : "";
  const xmp = previousXml.includes("</rdf:RDF>")
    ? previousXml.replace("</rdf:RDF>", description + "</rdf:RDF>")
    : `<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">${description}</rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
  const replacement = pdf.context.stream(new TextEncoder().encode(xmp), { Type: "Metadata", Subtype: "XML" });
  const metadataRef = pdf.catalog.get(PDFName.of("Metadata"));
  if (metadataRef instanceof PDFRef) {
    // Replace the existing object as well as the catalog view, so repeated
    // exports cannot leave stale AIGC packets in unreferenced PDF objects.
    pdf.context.assign(metadataRef, replacement);
  } else {
    pdf.catalog.set(PDFName.of("Metadata"), pdf.context.register(replacement));
  }
  const bytes = await pdf.save();
  return new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" });
}

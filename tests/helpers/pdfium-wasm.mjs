import http from "node:http";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

/**
 * Serve the self-hosted PDFium wasm over loopback so the EmbedPDF engine can run
 * under node (the engine fetches its wasm by URL; node's fetch has no file://).
 */
export async function servePdfiumWasm() {
  const require = createRequire(import.meta.url);
  const wasm = readFileSync(require.resolve("@embedpdf/pdfium/pdfium.wasm"));
  const server = http.createServer((_request, response) => {
    response.setHeader("content-type", "application/wasm");
    response.end(wasm);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/pdfium.wasm`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

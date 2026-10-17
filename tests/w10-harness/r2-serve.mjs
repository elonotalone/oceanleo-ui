import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
};

function safeFile(root, pathname) {
  let rel = decodeURIComponent(pathname.split("?")[0]);
  if (rel.endsWith("/")) rel += "index.html";
  if (rel === "/") rel = "/index.html";
  const full = normalize(join(root, rel.replace(/^\/+/, "")));
  if (full !== root && !full.startsWith(`${root}/`)) return null;
  return full;
}

export function startRootServer(root) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const file = safeFile(root, url.pathname);
      if (!file) {
        res.writeHead(403);
        res.end("forbidden");
        return;
      }
      const body = await readFile(file);
      res.writeHead(200, {
        "content-type": TYPES[extname(file)] || "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        server,
        port,
        origin: `http://127.0.0.1:${port}`,
        root,
        async close() {
          await new Promise((done) => server.close(done));
        },
      });
    });
  });
}

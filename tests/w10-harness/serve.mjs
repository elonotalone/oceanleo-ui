import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const UI_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const HARNESS = resolve(fileURLToPath(new URL(".", import.meta.url)));
const APP_RUNTIME = "/root/projects/oceanleo-app/editor-runtime";
const UI_NM = join(UI_ROOT, "node_modules");

const VENDOR = {
  "/vendor/fabric.min.mjs": join(UI_NM, "fabric/dist/index.min.mjs"),
};

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function safeJoin(root, requestPath) {
  const decoded = decodeURIComponent(requestPath.split("?")[0]);
  const full = normalize(join(root, decoded.replace(/^\/+/, "")));
  if (full !== root && !full.startsWith(`${root}/`)) return null;
  return full;
}

export function startW10HarnessServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      let file = VENDOR[url.pathname];
      if (!file && url.pathname.startsWith("/w10-harness/")) {
        file = safeJoin(HARNESS, url.pathname.slice("/w10-harness".length));
      }
      if (!file && url.pathname.startsWith("/root/projects/oceanleo-app/editor-runtime/")) {
        file = safeJoin(APP_RUNTIME, url.pathname.slice("/root/projects/oceanleo-app/editor-runtime".length));
      }
      if (!file) {
        res.writeHead(404);
        res.end("not found");
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
        async close() {
          await new Promise((done) => server.close(done));
        },
      });
    });
  });
}

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UI = path.resolve(HERE, "../..");
const CLIENT_WEB = "/root/projects/oceanleo-app/client-web";
const require = createRequire(path.join(CLIENT_WEB, "package.json"));
const reactPlugin = require("@vitejs/plugin-react");
const react = typeof reactPlugin === "function" ? reactPlugin : reactPlugin.default;

export default {
  root: HERE,
  plugins: [react()],
  resolve: {
    alias: {
      react: path.join(UI, "node_modules/react"),
      "react-dom": path.join(UI, "node_modules/react-dom"),
      "react/jsx-runtime": path.join(UI, "node_modules/react/jsx-runtime.js"),
      "react/jsx-dev-runtime": path.join(UI, "node_modules/react/jsx-dev-runtime.js"),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: "127.0.0.1",
    strictPort: false,
    fs: {
      allow: [UI, HERE, "/root/projects/oceanleo-app"],
    },
  },
};

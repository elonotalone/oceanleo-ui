// This repository shares its installed lint tools with the portal (no installs).
import { createRequire } from "node:module";
import { siblingRepoUrl } from "./helpers/sibling-repo-url.mjs";
const require = createRequire(siblingRepoUrl("oceanleo", "package.json"));
export default [{
  files: ["**/*.ts", "**/*.tsx"],
  languageOptions: { parser: require("@typescript-eslint/parser"), parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } } },
  plugins: { "react-hooks": require("eslint-plugin-react-hooks") },
  rules: { "react-hooks/rules-of-hooks": "error", "react-hooks/exhaustive-deps": "warn" },
}];

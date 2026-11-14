import { createRequire } from "node:module";

const require = createRequire("/root/projects/oceanleo/package.json");
const fromNext = createRequire(require.resolve("eslint-config-next"));
export default [{
  files: ["**/*.ts", "**/*.tsx"],
  languageOptions: { parser: fromNext("@typescript-eslint/parser"), parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } } },
  plugins: { "react-hooks": fromNext("eslint-plugin-react-hooks"), "@next/next": fromNext("@next/eslint-plugin-next") },
  rules: { "react-hooks/rules-of-hooks": "error", "react-hooks/exhaustive-deps": "warn", "@next/next/no-img-element": "warn" },
}];

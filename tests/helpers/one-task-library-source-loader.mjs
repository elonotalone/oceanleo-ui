import { readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TS_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function packageModuleFormat(path) {
  if (path.endsWith(".mjs")) return "module";
  if (path.endsWith(".cjs")) return "commonjs";
  if (!path.endsWith(".js") || !path.includes("/node_modules/")) return null;
  let directory = dirname(path);
  while (directory && directory !== dirname(directory)) {
    const manifest = resolve(directory, "package.json");
    if (isFile(manifest)) {
      try {
        return JSON.parse(readFileSync(manifest, "utf8")).type === "module"
          ? "module"
          : "commonjs";
      } catch {
        return null;
      }
    }
    if (directory.endsWith("/node_modules")) break;
    directory = dirname(directory);
  }
  return "commonjs";
}

function candidates(base) {
  const suffix = extname(base);
  if (suffix) {
    const withoutSuffix = base.slice(0, -suffix.length);
    return [base, ...TS_EXTENSIONS.map((extension) => `${withoutSuffix}${extension}`)];
  }
  return [
    base,
    ...TS_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...TS_EXTENSIONS.map((extension) => resolve(base, `index${extension}`)),
  ];
}

/**
 * Register a dedicated native ESM TSX loader for the real Library composition.
 * Modules keep their original `file:` URLs, which preserves native ESM cycle
 * semantics and shared React/context singletons; unlike the module bench, this
 * does not inline or separately compile each dependency graph branch.
 */
export function installOneTaskLibrarySourceLoader({
  replacements = {},
  fileReplacements = {},
} = {}) {
  const replacementUrls = new Map(
    Object.entries(replacements).map(([specifier, fixturePath]) => [
      specifier,
      pathToFileURL(resolve(REPO_ROOT, fixturePath)).href,
    ]),
  );
  const replacedFiles = new Map(
    Object.entries(fileReplacements).map(([sourcePath, fixturePath]) => [
      resolve(REPO_ROOT, sourcePath),
      pathToFileURL(resolve(REPO_ROOT, fixturePath)).href,
    ]),
  );

  function replaceResolvedFile(url) {
    if (!url?.startsWith("file:")) return null;
    if (new URL(url).search) return null;
    const path = fileURLToPath(url);
    return replacedFiles.get(path) || null;
  }

  return registerHooks({
    resolve(specifier, context, nextResolve) {
      const replacement = replacementUrls.get(specifier);
      if (replacement) return { url: replacement, shortCircuit: true };

      try {
        const result = nextResolve(specifier, context);
        const mapped = replaceResolvedFile(result.url);
        return mapped ? { url: mapped, shortCircuit: true } : result;
      } catch (error) {
        if (
          !["ERR_MODULE_NOT_FOUND", "ERR_UNSUPPORTED_DIR_IMPORT"].includes(error?.code) ||
          (!specifier.startsWith(".") && !specifier.startsWith("/")) ||
          specifier.startsWith("file:")
        ) {
          throw error;
        }
        const parentPath = context.parentURL?.startsWith("file:")
          ? dirname(fileURLToPath(context.parentURL))
          : REPO_ROOT;
        const base = specifier.startsWith("/")
          ? specifier
          : resolve(parentPath, specifier);
        for (const candidate of candidates(base)) {
          if (isFile(candidate)) {
            const mapped = replacedFiles.get(candidate);
            if (mapped) return { url: mapped, shortCircuit: true };
            return { url: pathToFileURL(candidate).href, shortCircuit: true };
          }
        }
        throw error;
      }
    },
    load(url, context, nextLoad) {
      if (!url.startsWith("file:")) return nextLoad(url, context);
      const path = fileURLToPath(url);
      if (!path.startsWith(`${REPO_ROOT}/src/`) || !/\.tsx?$/.test(path)) {
        try {
          return nextLoad(url, context);
        } catch (error) {
          // Node 22 returns source:null for CommonJS when an async custom
          // loader is layered under this sync test hook. Preserve package
          // semantics while providing the source explicitly for that case.
          const format = packageModuleFormat(path);
          if (
            error?.code === "ERR_INVALID_RETURN_PROPERTY_VALUE" &&
            format
          ) {
            return { format, source: readFileSync(path, "utf8"), shortCircuit: true };
          }
          throw error;
        }
      }
      const source = readFileSync(path, "utf8");
      const output = ts.transpileModule(source, {
        fileName: path,
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          verbatimModuleSyntax: false,
        },
      }).outputText;
      return { format: "module", source: output, shortCircuit: true };
    },
  });
}

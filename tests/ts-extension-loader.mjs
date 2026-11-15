const EXTENSIONS = [".ts", ".tsx", ".mjs"];
// Dotted source basenames (e.g. remote-metrics.generated) still need a suffix.
const HAS_EXTENSION = /\.(?:[cm]?[jt]sx?|json|node|css|wasm)$/i;

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    // Next's legacy package subpaths resolve in bundlers but need .js in Node
    // ESM. Keep this fallback limited to Next and to a missing original path.
    if (error?.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith("next/") && !HAS_EXTENSION.test(specifier)) {
      try { return await nextResolve(`${specifier}.js`, context); }
      catch (candidateError) { if (candidateError?.code !== "ERR_MODULE_NOT_FOUND") throw candidateError; }
    }
    if (
      error?.code !== "ERR_MODULE_NOT_FOUND" ||
      (!specifier.startsWith(".") && !specifier.startsWith("/")) ||
      HAS_EXTENSION.test(specifier)
    ) {
      throw error;
    }
    for (const extension of EXTENSIONS) {
      try {
        return await nextResolve(`${specifier}${extension}`, context);
      } catch (candidateError) {
        if (candidateError?.code !== "ERR_MODULE_NOT_FOUND") {
          throw candidateError;
        }
      }
    }
    throw error;
  }
}

const EXTENSIONS = [".ts", ".tsx", ".mjs"];

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    // Next's legacy package subpaths resolve in bundlers but need .js in Node
    // ESM. Keep this fallback limited to Next and to a missing original path.
    if (error?.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith("next/") && !/\.[a-z0-9]+$/i.test(specifier)) {
      try { return await nextResolve(`${specifier}.js`, context); }
      catch (candidateError) { if (candidateError?.code !== "ERR_MODULE_NOT_FOUND") throw candidateError; }
    }
    if (
      error?.code !== "ERR_MODULE_NOT_FOUND" ||
      (!specifier.startsWith(".") && !specifier.startsWith("/")) ||
      /\.[a-z0-9]+$/i.test(specifier)
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

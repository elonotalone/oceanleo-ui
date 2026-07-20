export const DOMAIN_FACADES = [
  "artifact",
  "library",
  "workspace",
  "session",
  "workbench",
  "browser",
] as const;

export type DomainFacadeName = (typeof DOMAIN_FACADES)[number];

export interface DomainImportEdge {
  importer: string;
  specifier: string;
}

export interface DomainDependencyViolation extends DomainImportEdge {
  reason: string;
}

/**
 * Facades expose existing implementations; they do not form a second runtime
 * layer. Implementations therefore never import facades, and facades never
 * import one another. Contracts are dependency roots.
 */
export const DOMAIN_DEPENDENCY_RULES = Object.freeze({
  contractRoot: "src/contracts/",
  facadeRoot: "src/facades/",
  implementationRoots: Object.freeze(["src/lib/", "src/shell/"]),
  contractsMayImportImplementations: false,
  facadesMayImportFacades: false,
  implementationsMayImportFacades: false,
});

function normalizedPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^.*\/src\//, "src/");
}

export function validateDomainDependencyGraph(
  edges: readonly DomainImportEdge[],
): DomainDependencyViolation[] {
  const violations: DomainDependencyViolation[] = [];
  for (const edge of edges) {
    const importer = normalizedPath(edge.importer);
    const specifier = edge.specifier.replaceAll("\\", "/");
    const importerIsFacade = importer.startsWith(
      DOMAIN_DEPENDENCY_RULES.facadeRoot,
    );
    const importerIsContract = importer.startsWith(
      DOMAIN_DEPENDENCY_RULES.contractRoot,
    );
    const importerIsImplementation =
      DOMAIN_DEPENDENCY_RULES.implementationRoots.some((root) =>
        importer.startsWith(root),
      );
    const importsFacade =
      specifier.includes("/facades/") ||
      specifier.startsWith("../facades/") ||
      specifier.startsWith("./facades/") ||
      (importerIsFacade && specifier.startsWith("./"));
    const importsImplementation =
      specifier.includes("/shell/") ||
      specifier.includes("/lib/") ||
      specifier.startsWith("../shell/") ||
      specifier.startsWith("../lib/") ||
      specifier.startsWith("./shell/") ||
      specifier.startsWith("./lib/");
    if (importerIsContract && importsImplementation) {
      violations.push({
        ...edge,
        reason: "contracts are dependency roots and cannot import implementations",
      });
    } else if (importerIsFacade && importsFacade) {
      violations.push({
        ...edge,
        reason: "domain facades must not import another facade",
      });
    } else if (importerIsImplementation && importsFacade) {
      violations.push({
        ...edge,
        reason: "implementation modules must not depend on public facades",
      });
    }
  }
  return violations;
}

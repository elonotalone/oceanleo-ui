export interface HostCouplingFile {
  path: string;
  source: string;
}

export type HostCouplingKind =
  | "next-import"
  | "window"
  | "document"
  | "localStorage"
  | "hostname-guess";

export interface HostCouplingHit {
  path: string;
  kind: HostCouplingKind;
  line: number;
  text: string;
}

const COMMENT_BLOCK = /\/\*[\s\S]*?\*\//g;
const COMMENT_LINE = /^\s*\/\/.*$/gm;

const KIND_PATTERNS: ReadonlyArray<{ kind: HostCouplingKind; pattern: RegExp }> = [
  { kind: "next-import", pattern: /\bfrom\s+['"]next(?:\/[^'"]*)?['"]/ },
  { kind: "window", pattern: /\bwindow\./ },
  { kind: "document", pattern: /\bdocument\./ },
  { kind: "localStorage", pattern: /\blocalStorage\b/ },
  { kind: "hostname-guess", pattern: /\blocation\.hostname\b|\blocation\.host\b/ },
];

export function stripSourceComments(source: string): string {
  return source.replace(COMMENT_BLOCK, "").replace(COMMENT_LINE, "");
}

export function inventoryHostCoupling(files: readonly HostCouplingFile[]): HostCouplingHit[] {
  const hits: HostCouplingHit[] = [];
  for (const file of files) {
    const body = stripSourceComments(file.source);
    const lines = body.split(/\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const text = lines[index];
      for (const { kind, pattern } of KIND_PATTERNS) {
        if (pattern.test(text)) {
          hits.push({ path: file.path, kind, line: index + 1, text: text.trim() });
        }
      }
    }
  }
  return hits;
}

export function hitsInPaths(
  hits: readonly HostCouplingHit[],
  predicate: (path: string) => boolean,
): HostCouplingHit[] {
  return hits.filter((hit) => predicate(hit.path));
}

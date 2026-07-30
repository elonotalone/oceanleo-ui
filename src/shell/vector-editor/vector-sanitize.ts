/**
 * `oceanleo.vector.v1` SVG sanitizer — vector.md §3.2 / §5.3.
 *
 * SVG is the only carrier whose `source` bytes are themselves executable, so
 * this module is the carrier's highest-priority requirement. Two properties are
 * non-negotiable and both are asserted by tests/vector-carrier-sanitize.test.mjs:
 *
 * 1. All eight dangerous constructs from §3.2 are removed at ingest. §3.3 makes
 *    `parsed → tokenized` an illegal transition precisely so that nothing can
 *    reach the tokenizer without passing through here, and §5.3 forbids relying
 *    on render-time filtering.
 * 2. The output still renders. Stripping the danger MUST NOT strip the drawing:
 *    a sanitizer that returns a blank canvas trades an injection path for a
 *    hollow artifact.
 *
 * The implementation is a self-contained XML scanner rather than DOMPurify:
 * §3.2 requires sanitization in the ingest path, which has no DOM, and a pure
 * string→string function is deterministic and testable offline. It also never
 * touches iframe `sandbox`, CORS or `postMessage` (§5.3).
 */

/** §3.2, one entry per spec table row. C28 = 8 classes. */
export const SVG_SANITIZE_RULES = Object.freeze([
  Object.freeze({
    id: "script-element",
    spec: "§3.2 `<script>` 元素",
    disposition: "MUST 移除",
  }),
  Object.freeze({
    id: "event-attribute",
    spec: "§3.2 `on*` 事件属性",
    disposition: "MUST 移除",
  }),
  Object.freeze({
    id: "foreign-object",
    spec: "§3.2 `<foreignObject>`",
    disposition: "MUST 移除",
  }),
  Object.freeze({
    id: "external-href",
    spec: "§3.2 `href` / `xlink:href` 指向外部 URL",
    disposition: "MUST 移除或改为内部引用",
  }),
  Object.freeze({
    id: "dangerous-scheme",
    spec: "§3.2 `javascript:` / `data:text/html` 方案",
    disposition: "MUST 移除",
  }),
  Object.freeze({
    id: "external-image",
    spec: "§3.2 `<image>` 引用外部资源",
    disposition: "MUST 内联为依赖件或移除",
  }),
  Object.freeze({
    id: "style-import",
    spec: "§3.2 `<style>` 中的 `@import`",
    disposition: "MUST 移除",
  }),
  Object.freeze({
    id: "external-entity",
    spec: "§3.2 XML 外部实体（DTD / ENTITY）",
    disposition: "MUST 移除",
  }),
]);

export type SvgSanitizeRuleId = (typeof SVG_SANITIZE_RULES)[number]["id"];

/** C28: the number of dangerous construct classes that MUST reach zero. */
export const SVG_DANGEROUS_CONSTRUCT_CLASSES = SVG_SANITIZE_RULES.length;

export interface SvgSanitizeRemoval {
  rule: SvgSanitizeRuleId;
  target: string;
  detail: string;
}

export interface SvgSanitizeReport {
  /** Sanitized SVG text; still renderable when `renderable` is true. */
  svg: string;
  removals: SvgSanitizeRemoval[];
  /** §8.2: residual dangerous constructs MUST be 0. */
  residual: SvgSanitizeRuleId[];
  renderable: boolean;
  /** Elements that still draw something after sanitization. */
  graphicElementCount: number;
  hasViewBox: boolean;
}

const GRAPHIC_ELEMENTS = new Set([
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "use",
  "image",
]);

const HREF_ATTRIBUTES = new Set(["href", "xlink:href", "xml:href"]);

const URL_BEARING_ATTRIBUTES = new Set([
  ...HREF_ATTRIBUTES,
  "src",
  "from",
  "to",
  "values",
  "fill",
  "stroke",
  "style",
  "filter",
  "mask",
  "clip-path",
  "marker-start",
  "marker-mid",
  "marker-end",
]);

interface XmlAttribute {
  name: string;
  value: string;
  quote: string;
}

type XmlNode =
  | { kind: "text"; text: string }
  | { kind: "comment"; text: string }
  | { kind: "declaration"; text: string }
  | { kind: "doctype"; text: string }
  | { kind: "cdata"; text: string }
  | {
      kind: "element";
      name: string;
      attributes: XmlAttribute[];
      selfClosing: boolean;
      children: XmlNode[];
    };

class SvgParseError extends Error {}

function localName(name: string): string {
  const colon = name.indexOf(":");
  return (colon === -1 ? name : name.slice(colon + 1)).toLowerCase();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);?/g, (_match, digits: string) =>
      String.fromCodePoint(Number.parseInt(digits, 10)),
    );
}

/**
 * Scheme detection runs on a form that has had entities decoded and all
 * whitespace, NUL bytes and control characters squeezed out, so
 * `java\nscript:` and `&#106;avascript:` are recognised as the same attack.
 */
function schemeProbe(value: string): string {
  return decodeEntities(value)
    .replace(/[\u0000-\u0020\u007f\u00a0]/g, "")
    .toLowerCase();
}

function parseXml(input: string): XmlNode[] {
  const nodes: XmlNode[] = [];
  const stack: { name: string; children: XmlNode[] }[] = [];
  let cursor = 0;
  const push = (node: XmlNode) => {
    const top = stack[stack.length - 1];
    (top ? top.children : nodes).push(node);
  };

  while (cursor < input.length) {
    const open = input.indexOf("<", cursor);
    if (open === -1) {
      const text = input.slice(cursor);
      if (text) push({ kind: "text", text });
      break;
    }
    if (open > cursor) {
      push({ kind: "text", text: input.slice(cursor, open) });
    }
    if (input.startsWith("<!--", open)) {
      const end = input.indexOf("-->", open + 4);
      if (end === -1) throw new SvgParseError("未闭合的注释");
      push({ kind: "comment", text: input.slice(open, end + 3) });
      cursor = end + 3;
      continue;
    }
    if (input.startsWith("<![CDATA[", open)) {
      const end = input.indexOf("]]>", open + 9);
      if (end === -1) throw new SvgParseError("未闭合的 CDATA");
      push({ kind: "cdata", text: input.slice(open, end + 3) });
      cursor = end + 3;
      continue;
    }
    if (input.startsWith("<?", open)) {
      const end = input.indexOf("?>", open + 2);
      if (end === -1) throw new SvgParseError("未闭合的 XML 声明");
      push({ kind: "declaration", text: input.slice(open, end + 2) });
      cursor = end + 2;
      continue;
    }
    if (input.startsWith("<!", open)) {
      // DOCTYPE, possibly with an internal subset carrying ENTITY decls.
      let depth = 0;
      let index = open + 2;
      while (index < input.length) {
        const character = input[index];
        if (character === "[") depth += 1;
        else if (character === "]") depth -= 1;
        else if (character === ">" && depth <= 0) break;
        index += 1;
      }
      if (index >= input.length) throw new SvgParseError("未闭合的 DOCTYPE");
      push({ kind: "doctype", text: input.slice(open, index + 1) });
      cursor = index + 1;
      continue;
    }
    if (input.startsWith("</", open)) {
      const end = input.indexOf(">", open);
      if (end === -1) throw new SvgParseError("未闭合的结束标签");
      const name = input.slice(open + 2, end).trim();
      const top = stack[stack.length - 1];
      if (!top || top.name !== name) {
        throw new SvgParseError(`结束标签 ${name} 与开始标签不匹配`);
      }
      stack.pop();
      cursor = end + 1;
      continue;
    }

    // Start tag. Attribute values may contain ">" inside quotes.
    let index = open + 1;
    let quote = "";
    while (index < input.length) {
      const character = input[index];
      if (quote) {
        if (character === quote) quote = "";
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        break;
      }
      index += 1;
    }
    if (index >= input.length) throw new SvgParseError("未闭合的开始标签");
    const raw = input.slice(open + 1, index);
    const selfClosing = raw.trimEnd().endsWith("/");
    const body = selfClosing ? raw.trimEnd().slice(0, -1) : raw;
    const nameMatch = /^[^\s/>]+/.exec(body.trimStart());
    if (!nameMatch) throw new SvgParseError("标签缺少名字");
    const name = nameMatch[0];
    const attributes: XmlAttribute[] = [];
    const attributePattern =
      /([^\s=/>]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let attributeCursor = body.indexOf(name) + name.length;
    attributePattern.lastIndex = 0;
    const attributeSection = body.slice(attributeCursor);
    let match: RegExpExecArray | null;
    while ((match = attributePattern.exec(attributeSection)) !== null) {
      const attributeName = match[1];
      if (!attributeName) continue;
      const value = match[2] ?? match[3] ?? match[4] ?? "";
      const quoteCharacter =
        match[2] !== undefined ? '"' : match[3] !== undefined ? "'" : '"';
      attributes.push({
        name: attributeName,
        value,
        quote: quoteCharacter,
      });
    }
    const element: XmlNode = {
      kind: "element",
      name,
      attributes,
      selfClosing,
      children: [],
    };
    push(element);
    if (!selfClosing) {
      stack.push({ name, children: element.children });
    }
    cursor = index + 1;
  }

  if (stack.length > 0) {
    throw new SvgParseError(`未闭合的元素 ${stack[stack.length - 1].name}`);
  }
  return nodes;
}

function escapeAttribute(value: string, quote: string): string {
  // Only bare ampersands are escaped: values keep the entity references they
  // arrived with, which is what makes sanitizeSvg idempotent.
  const escaped = value
    .replace(/&(?!#?[a-zA-Z0-9]+;)/g, "&amp;")
    .replace(/</g, "&lt;");
  return quote === "'"
    ? escaped.replace(/'/g, "&apos;")
    : escaped.replace(/"/g, "&quot;");
}

function serialize(nodes: readonly XmlNode[]): string {
  let out = "";
  for (const node of nodes) {
    switch (node.kind) {
      case "text":
      case "comment":
      case "declaration":
      case "doctype":
      case "cdata":
        out += node.text;
        break;
      case "element": {
        const attributes = node.attributes
          .map(
            (attribute) =>
              ` ${attribute.name}=${attribute.quote}${escapeAttribute(
                attribute.value,
                attribute.quote,
              )}${attribute.quote}`,
          )
          .join("");
        if (node.selfClosing && node.children.length === 0) {
          out += `<${node.name}${attributes}/>`;
        } else {
          out += `<${node.name}${attributes}>${serialize(node.children)}</${node.name}>`;
        }
        break;
      }
    }
  }
  return out;
}

function isInternalReference(value: string): boolean {
  const probe = decodeEntities(value).trim();
  return probe.startsWith("#") && probe.length > 1;
}

function inlineDataImage(value: string): boolean {
  const probe = schemeProbe(value);
  return probe.startsWith("data:image/") && !probe.startsWith("data:image/svg");
}

function dangerousScheme(value: string): boolean {
  const probe = schemeProbe(value);
  return (
    probe.includes("javascript:") ||
    probe.includes("vbscript:") ||
    probe.startsWith("data:text/html") ||
    probe.includes("data:text/html") ||
    probe.startsWith("data:image/svg+xml") ||
    probe.includes("data:application/xhtml")
  );
}

function externalReference(value: string): boolean {
  const probe = schemeProbe(value);
  if (!probe) return false;
  if (probe.startsWith("#")) return false;
  if (probe.startsWith("data:")) return false;
  return (
    /^[a-z][a-z0-9+.-]*:/.test(probe) ||
    probe.startsWith("//") ||
    probe.startsWith("/") ||
    probe.startsWith("../") ||
    probe.startsWith("./") ||
    /^url\((?:'|")?(?:[a-z][a-z0-9+.-]*:|\/\/)/.test(probe)
  );
}

function stripCssImports(css: string): { css: string; removed: number } {
  let removed = 0;
  const cleaned = css.replace(
    /@import[^;}]*(;|(?=\})|$)/gi,
    () => {
      removed += 1;
      return "";
    },
  );
  return { css: cleaned, removed };
}

/**
 * Pure, deterministic, idempotent: `sanitizeSvg(sanitizeSvg(x).svg)` reports no
 * further removals and returns byte-identical output.
 */
export function sanitizeSvg(input: string): SvgSanitizeReport {
  const removals: SvgSanitizeRemoval[] = [];
  const record = (
    rule: SvgSanitizeRuleId,
    target: string,
    detail: string,
  ) => {
    removals.push({ rule, target, detail });
  };

  let nodes: XmlNode[];
  try {
    nodes = parseXml(input);
  } catch {
    return {
      svg: "",
      removals,
      residual: [],
      renderable: false,
      graphicElementCount: 0,
      hasViewBox: false,
    };
  }

  // Rule 8 first: an internal DTD subset can declare entities that the rest of
  // the document expands, so the declarations and their references both go.
  const declaredEntities = new Set<string>();
  const withoutDoctype: XmlNode[] = [];
  for (const node of nodes) {
    if (node.kind === "doctype") {
      for (const match of node.text.matchAll(
        /<!ENTITY\s+(?:%\s*)?([A-Za-z_][\w.-]*)/g,
      )) {
        declaredEntities.add(match[1]);
      }
      record(
        "external-entity",
        "DOCTYPE",
        `移除 DTD${declaredEntities.size > 0 ? `（含 ENTITY ${[...declaredEntities].join(", ")}）` : ""}`,
      );
      continue;
    }
    withoutDoctype.push(node);
  }

  const stripEntityReferences = (value: string): string => {
    if (declaredEntities.size === 0) return value;
    let out = value;
    for (const name of declaredEntities) {
      out = out.split(`&${name};`).join("").split(`%${name};`).join("");
    }
    return out;
  };

  let graphicElementCount = 0;
  let hasViewBox = false;

  const walk = (list: readonly XmlNode[]): XmlNode[] => {
    const out: XmlNode[] = [];
    for (const node of list) {
      if (node.kind === "text" || node.kind === "cdata") {
        out.push({ ...node, text: stripEntityReferences(node.text) });
        continue;
      }
      if (node.kind !== "element") {
        out.push(node);
        continue;
      }
      const tag = localName(node.name);

      if (tag === "script") {
        record("script-element", node.name, "移除元素与其全部内容");
        continue;
      }
      if (tag === "foreignobject") {
        record("foreign-object", node.name, "移除元素与其全部内容");
        continue;
      }

      const attributes: XmlAttribute[] = [];
      let dropElement = false;
      for (const attribute of node.attributes) {
        const attributeName = attribute.name.toLowerCase();
        const attributeLocal = localName(attribute.name);
        const value = stripEntityReferences(attribute.value);

        if (/^on/.test(attributeLocal)) {
          record(
            "event-attribute",
            `${node.name}@${attribute.name}`,
            "移除事件属性",
          );
          continue;
        }
        if (
          URL_BEARING_ATTRIBUTES.has(attributeName) ||
          URL_BEARING_ATTRIBUTES.has(attributeLocal)
        ) {
          if (dangerousScheme(value)) {
            record(
              "dangerous-scheme",
              `${node.name}@${attribute.name}`,
              "移除携带可执行方案的属性",
            );
            continue;
          }
          if (
            (HREF_ATTRIBUTES.has(attributeName) ||
              HREF_ATTRIBUTES.has(attributeLocal)) &&
            !isInternalReference(value)
          ) {
            if (tag === "image" && inlineDataImage(value)) {
              attributes.push({ ...attribute, value });
              continue;
            }
            if (tag === "image") {
              record(
                "external-image",
                `${node.name}@${attribute.name}`,
                "外部资源未内联，移除整个 <image>",
              );
              dropElement = true;
              continue;
            }
            record(
              "external-href",
              `${node.name}@${attribute.name}`,
              "移除指向外部 URL 的引用",
            );
            continue;
          }
          if (externalReference(value)) {
            record(
              "external-href",
              `${node.name}@${attribute.name}`,
              "移除指向外部 URL 的引用",
            );
            continue;
          }
        } else if (dangerousScheme(value)) {
          record(
            "dangerous-scheme",
            `${node.name}@${attribute.name}`,
            "移除携带可执行方案的属性",
          );
          continue;
        }
        if (attributeLocal === "viewbox") hasViewBox = true;
        attributes.push({ ...attribute, value });
      }
      if (dropElement) continue;

      let children = walk(node.children);
      if (tag === "style") {
        children = children.map((child) => {
          if (child.kind !== "text" && child.kind !== "cdata") return child;
          const { css, removed } = stripCssImports(child.text);
          if (removed > 0) {
            record(
              "style-import",
              `${node.name}`,
              `移除 ${removed} 条 @import 规则`,
            );
          }
          return { ...child, text: css };
        });
      }
      if (GRAPHIC_ELEMENTS.has(tag)) graphicElementCount += 1;
      out.push({ ...node, attributes, children });
    }
    return out;
  };

  const sanitizedNodes = walk(withoutDoctype);
  const svg = serialize(sanitizedNodes);
  const residual = residualDangerousConstructs(svg);

  return {
    svg,
    removals,
    residual,
    renderable: hasViewBox && graphicElementCount > 0 && residual.length === 0,
    graphicElementCount,
    hasViewBox,
  };
}

/**
 * §8.2 "§3.2 的 8 类危险构造残留数 = 0". Scans the *output* text, so it doubles
 * as an independent check on the sanitizer itself rather than trusting its own
 * bookkeeping.
 */
export function residualDangerousConstructs(svg: string): SvgSanitizeRuleId[] {
  const found = new Set<SvgSanitizeRuleId>();
  const compact = schemeProbe(svg);
  if (compact.includes("<!doctype") || compact.includes("<!entity")) {
    found.add("external-entity");
  }
  if (compact.includes("@import")) found.add("style-import");
  if (
    compact.includes("javascript:") ||
    compact.includes("vbscript:") ||
    compact.includes("data:text/html")
  ) {
    found.add("dangerous-scheme");
  }

  let nodes: XmlNode[];
  try {
    nodes = parseXml(svg);
  } catch {
    // Non-wellformed input cannot be judged clean; §3.3 sends it to `invalid`.
    for (const rule of SVG_SANITIZE_RULES) found.add(rule.id);
    return orderedRules(found);
  }

  const walk = (list: readonly XmlNode[]) => {
    for (const node of list) {
      if (node.kind !== "element") continue;
      const tag = localName(node.name);
      if (tag === "script") found.add("script-element");
      if (tag === "foreignobject") found.add("foreign-object");
      for (const attribute of node.attributes) {
        const name = localName(attribute.name);
        if (/^on./.test(name)) found.add("event-attribute");
        if (dangerousScheme(attribute.value)) found.add("dangerous-scheme");
        if (
          (HREF_ATTRIBUTES.has(attribute.name.toLowerCase()) ||
            HREF_ATTRIBUTES.has(name) ||
            name === "src") &&
          externalReference(attribute.value)
        ) {
          found.add(tag === "image" ? "external-image" : "external-href");
        }
      }
      walk(node.children);
    }
  };
  walk(nodes);
  return orderedRules(found);
}

function orderedRules(found: ReadonlySet<SvgSanitizeRuleId>): SvgSanitizeRuleId[] {
  return SVG_SANITIZE_RULES.filter((rule) => found.has(rule.id)).map(
    (rule) => rule.id,
  );
}

/** Throws unless the text is clean; used as the `parsed → sanitized` gate. */
export function assertSvgSanitized(svg: string): void {
  const residual = residualDangerousConstructs(svg);
  if (residual.length > 0) {
    throw new Error(
      `SVG 仍残留 §3.2 危险构造：${residual.join(", ")}；MUST NOT 进入 tokenized。`,
    );
  }
}

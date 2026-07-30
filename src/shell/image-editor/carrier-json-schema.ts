/**
 * Draft 2020-12 subset evaluator for the L1 carrier contracts served by the
 * `design-canvas` adapter (`oceanleo.design-document.v1` and
 * `oceanleo.vector.v1`).
 *
 * The carriers keep their schema as the literal JSON from the contract instead
 * of a hand-written field walker, so "field-by-field against the spec" is a
 * structural property rather than a review promise. Only the keywords the two
 * contracts actually use are implemented; an unknown keyword is a programming
 * error and reported as such rather than silently ignored.
 */

export interface CarrierSchemaViolation {
  path: string;
  keyword: string;
  message: string;
}

type JsonSchema = Record<string, unknown>;

const METADATA_KEYWORDS = new Set([
  "$schema",
  "$id",
  "title",
  "description",
  "default",
  "examples",
]);

const SUPPORTED_KEYWORDS = new Set([
  "type",
  "const",
  "enum",
  "required",
  "properties",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "pattern",
  "format",
  "allOf",
  "if",
  "then",
  "else",
  "$ref",
  "$defs",
]);

const patternCache = new Map<string, RegExp>();

function compiled(pattern: string): RegExp {
  const cached = patternCache.get(pattern);
  if (cached) return cached;
  const expression = new RegExp(pattern, "u");
  patternCache.set(pattern, expression);
  return expression;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function codePointLength(value: string): number {
  return [...value].length;
}

function typeMatches(type: string, value: unknown): boolean {
  switch (type) {
    case "object":
      return isRecord(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "null":
      return value === null;
    default:
      throw new Error(`carrier schema uses unsupported type ${type}`);
  }
}

function absoluteUri(value: string): boolean {
  try {
    return Boolean(new URL(value).protocol);
  } catch {
    return false;
  }
}

function resolveRef(root: JsonSchema, ref: string): JsonSchema {
  const prefix = "#/$defs/";
  if (!ref.startsWith(prefix)) {
    throw new Error(`carrier schema uses unsupported $ref ${ref}`);
  }
  const defs = root.$defs;
  const target = isRecord(defs) ? defs[ref.slice(prefix.length)] : undefined;
  if (!isRecord(target)) {
    throw new Error(`carrier schema $ref ${ref} is unresolvable`);
  }
  return target;
}

function evaluate(
  root: JsonSchema,
  schema: JsonSchema,
  value: unknown,
  path: string,
  out: CarrierSchemaViolation[],
): void {
  for (const keyword of Object.keys(schema)) {
    if (METADATA_KEYWORDS.has(keyword)) continue;
    if (!SUPPORTED_KEYWORDS.has(keyword)) {
      throw new Error(`carrier schema uses unsupported keyword ${keyword}`);
    }
  }

  if (typeof schema.$ref === "string") {
    evaluate(root, resolveRef(root, schema.$ref), value, path, out);
    return;
  }

  if (typeof schema.type === "string" && !typeMatches(schema.type, value)) {
    out.push({
      path,
      keyword: "type",
      message: `expected ${schema.type}`,
    });
    return;
  }

  if ("const" in schema && value !== schema.const) {
    out.push({
      path,
      keyword: "const",
      message: `expected ${JSON.stringify(schema.const)}`,
    });
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    out.push({
      path,
      keyword: "enum",
      message: `expected one of ${JSON.stringify(schema.enum)}`,
    });
  }

  if (typeof value === "string") {
    if (
      typeof schema.minLength === "number" &&
      codePointLength(value) < schema.minLength
    ) {
      out.push({
        path,
        keyword: "minLength",
        message: `shorter than ${schema.minLength}`,
      });
    }
    if (
      typeof schema.maxLength === "number" &&
      codePointLength(value) > schema.maxLength
    ) {
      out.push({
        path,
        keyword: "maxLength",
        message: `longer than ${schema.maxLength}`,
      });
    }
    if (
      typeof schema.pattern === "string" &&
      !compiled(schema.pattern).test(value)
    ) {
      out.push({
        path,
        keyword: "pattern",
        message: `does not match ${schema.pattern}`,
      });
    }
    if (schema.format === "uri" && !absoluteUri(value)) {
      out.push({ path, keyword: "format", message: "not an absolute uri" });
    }
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      out.push({
        path,
        keyword: "minimum",
        message: `below ${schema.minimum}`,
      });
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      out.push({
        path,
        keyword: "maximum",
        message: `above ${schema.maximum}`,
      });
    }
    if (
      typeof schema.exclusiveMinimum === "number" &&
      value <= schema.exclusiveMinimum
    ) {
      out.push({
        path,
        keyword: "exclusiveMinimum",
        message: `not above ${schema.exclusiveMinimum}`,
      });
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      out.push({
        path,
        keyword: "minItems",
        message: `fewer than ${schema.minItems} items`,
      });
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      out.push({
        path,
        keyword: "maxItems",
        message: `more than ${schema.maxItems} items`,
      });
    }
    if (isRecord(schema.items)) {
      for (const [index, entry] of value.entries()) {
        evaluate(root, schema.items, entry, `${path}[${index}]`, out);
      }
    }
  }

  if (isRecord(value)) {
    const properties = isRecord(schema.properties) ? schema.properties : {};
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (typeof key === "string" && !(key in value)) {
          out.push({
            path,
            keyword: "required",
            message: `missing ${key}`,
          });
        }
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          out.push({
            path,
            keyword: "additionalProperties",
            message: `unknown property ${key}`,
          });
        }
      }
    }
    for (const key of Object.keys(properties)) {
      const child = properties[key];
      if (!(key in value) || !isRecord(child)) continue;
      evaluate(root, child, value[key], path ? `${path}.${key}` : key, out);
    }
  }

  if (Array.isArray(schema.allOf)) {
    for (const branch of schema.allOf) {
      if (isRecord(branch)) evaluate(root, branch, value, path, out);
    }
  }

  if (isRecord(schema.if)) {
    const probe: CarrierSchemaViolation[] = [];
    evaluate(root, schema.if, value, path, probe);
    const matched = probe.length === 0;
    const branch = matched ? schema.then : schema.else;
    if (isRecord(branch)) evaluate(root, branch, value, path, out);
  }
}

/**
 * Deterministic: violations come back in schema declaration order for the same
 * input, so callers may compare reports byte for byte across runs.
 */
export function evaluateCarrierSchema(
  schema: JsonSchema,
  value: unknown,
): CarrierSchemaViolation[] {
  const out: CarrierSchemaViolation[] = [];
  evaluate(schema, schema, value, "", out);
  return out;
}

/** Numeric/enumeration bound lookup used by the carriers' constant tables. */
export function carrierSchemaBound(
  schema: JsonSchema,
  pointer: string,
  keyword: string,
): unknown {
  let node: JsonSchema = schema;
  for (const segment of pointer.split("/").filter(Boolean)) {
    const next = node[segment];
    if (!isRecord(next)) {
      throw new Error(`carrier schema pointer ${pointer} is unresolvable`);
    }
    node = next;
  }
  return node[keyword];
}

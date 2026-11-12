/** Standard OOXML metadata helpers used by the PPTX editor. */
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
export const DECK_RELATIONSHIP_TYPES = {
  coreProperties: "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties",
  customProperties: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties",
};
export const DECK_CONTENT_TYPES = {
  coreProperties: "application/vnd.openxmlformats-package.core-properties+xml",
  customProperties: "application/vnd.openxmlformats-officedocument.custom-properties+xml",
};
export const DECK_CUSTOM_PROPERTY_FMTID =
  "{D5CDD505-2E9C-101B-9397-08002B2CF9AE}";
/** §3.2a.2 — the property name carrying the credits string. */
export const DECK_CREDITS_PROPERTY = "OceanLeoCredits";
/** §5 C50 — `pid` 0 and 1 are reserved. */
export const DECK_CUSTOM_PROPERTY_FIRST_PID = 2;

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // OOXML forbids C0 control characters other than tab / LF / CR.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

export function deckCustomPropertiesXml(
  credits: string,
  license: Readonly<Record<string, string>> = {},
): string {
  const entries: [string, string][] = [[DECK_CREDITS_PROPERTY, credits]];
  for (const key of ["usage_scope", "license_family", "supply_tier"] as const) {
    const value = license[key];
    if (value) entries.push([key, value]);
  }
  const body = entries
    .map(
      ([name, value], index) =>
        `<property fmtid="${DECK_CUSTOM_PROPERTY_FMTID}" ` +
        `pid="${DECK_CUSTOM_PROPERTY_FIRST_PID + index}" name="${escapeXml(name)}">` +
        `<vt:lpwstr>${escapeXml(value)}</vt:lpwstr></property>`,
    )
    .join("");
  return (
    `${XML_DECLARATION}\n` +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" ' +
    'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    `${body}</Properties>`
  );
}


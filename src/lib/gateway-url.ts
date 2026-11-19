import { GATEWAY_BASE } from "./auth/config";

/** Resolve gateway API paths before handing them to browser media or downloads. */
export function resolveGatewayUrl(value: string): string {
  return value.startsWith("/v1/")
    ? new URL(value, `${GATEWAY_BASE.replace(/\/+$/, "")}/`).toString()
    : value;
}

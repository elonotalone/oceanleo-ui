/** Path helpers shared by web and local hosts. No DOM, no Next. */

export function pathKey(path: string): string {
  return (path.split("?")[0] || "/").replace(/\/+$/, "") || "/";
}

export function isActivePath(activePath: string, href: string, exact = false): boolean {
  const path = pathKey(activePath);
  const target = pathKey(href);
  if (!target.startsWith("/")) return false;
  if (exact || target === "/") return path === target;
  return path === target || path.startsWith(`${target}/`);
}

export function isModifiedClick(event: {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

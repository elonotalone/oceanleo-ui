export type ServerPageCard = "acp" | "cli" | "terminal";

export type ServerPageHrefOptions = {
  card?: ServerPageCard;
  program?: string;
  session?: string;
};

export function serverPageHref(
  computerId: string,
  options: ServerPageHrefOptions = {},
): string {
  const path = `/computers/${encodeURIComponent(computerId)}`;
  const query = new URLSearchParams();
  if (options.card) query.set("card", options.card);
  if (options.program) query.set("program", options.program);
  if (options.session) query.set("session", options.session);
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export function appendFinalUserTranscript(rows: string[], text: string): string[] {
  return [...rows.slice(-99), `我：${text}`];
}

/** Provider's final transcript may echo the same assistant text already shown
 * via text.delta. Replace that response line instead of duplicating it. */
export function upsertFinalAssistantTranscript(rows: string[], text: string): string[] {
  const finalLine = `Leo：${text}`;
  return rows.at(-1)?.startsWith("Leo：")
    ? [...rows.slice(0, -1), finalLine]
    : [...rows.slice(-99), finalLine];
}

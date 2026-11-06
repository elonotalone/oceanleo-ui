import type { NativeFramePosition } from "../../native-agent-core/index";

/** Stored sequence is authoritative; local/snapshot-only rows sit between those anchors. */
export function orderNativeFrames<T>(rows: readonly T[], position: (row: T) => NativeFramePosition): T[] {
  const sources = new Map<string, T[]>();
  for (const row of rows) {
    const own = position(row);
    if (own.arrivalSource && own.arrival !== undefined) {
      const source = sources.get(own.arrivalSource) ?? [];
      source.push(row); sources.set(own.arrivalSource, source);
    }
  }
  for (const source of sources.values()) source.sort((a, b) => position(a).arrival! - position(b).arrival!);
  const cursors = new Map<string, number>();
  const arrived = rows.map((row) => {
    const own = position(row);
    if (!own.arrivalSource || own.arrival === undefined) return row;
    const index = cursors.get(own.arrivalSource) ?? 0;
    cursors.set(own.arrivalSource, index + 1);
    return sources.get(own.arrivalSource)![index];
  });
  const sequenced = arrived.map((row, index) => ({ row, index, ...position(row) }))
    .filter((entry): entry is typeof entry & { seq: number } => Number.isFinite(entry.seq))
    .sort((a, b) => a.seq - b.seq || a.index - b.index);
  if (!sequenced.length) return arrived;
  const buckets: T[][] = Array.from({ length: sequenced.length + 1 }, () => []);
  const anchors = new Map(sequenced.map((entry, index) => [entry.index, index]));
  let preceding = -1;
  arrived.forEach((row, index) => {
    const anchor = anchors.get(index);
    if (anchor !== undefined) { preceding = anchor; return; }
    const own = position(row);
    let before = -1;
    if (own.arrivalSource && own.arrival !== undefined) {
      before = sequenced.findIndex((entry) => entry.arrivalSource === own.arrivalSource && entry.arrival !== undefined && entry.arrival > own.arrival!);
      const previous = sequenced.findLastIndex((entry) => entry.arrivalSource === own.arrivalSource && entry.arrival !== undefined && entry.arrival < own.arrival!);
      if (before < 0 && previous >= 0) { buckets[previous + 1].push(row); return; }
    }
    if (before < 0 && Number.isFinite(own.at)) before = sequenced.findIndex((entry) => Number.isFinite(entry.at) && entry.at! >= own.at!);
    // Untimed live rows preserve arrival order after the preceding archived row.
    // Snapshot-only users have their original send time, so older ones are inserted above newer work.
    const bucket = before >= 0 ? before : Number.isFinite(own.at) ? sequenced.length : preceding + 1;
    buckets[bucket].push(row);
  });
  return buckets.flatMap((bucket, index) => index < sequenced.length ? [...bucket, sequenced[index].row] : bucket);
}

export function mergeNativePosition(older: NativeFramePosition, newer: NativeFramePosition): NativeFramePosition {
  const seqs = [older.seq, newer.seq].filter((value): value is number => Number.isFinite(value));
  const updates = [older.updatedSeq, newer.updatedSeq].filter((value): value is number => Number.isFinite(value));
  const times = [older.updatedAt, newer.updatedAt].filter((value): value is number => Number.isFinite(value));
  return {
    ...(seqs.length ? { seq: Math.min(...seqs) } : {}),
    ...(older.at !== undefined || newer.at !== undefined ? { at: older.seq === undefined && newer.seq !== undefined ? newer.at ?? older.at : older.at ?? newer.at } : {}),
    ...(updates.length ? { updatedSeq: Math.max(...updates) } : {}),
    ...(times.length ? { updatedAt: Math.max(...times) } : {}),
    ...(older.arrivalSource || newer.arrivalSource ? {
      arrivalSource: older.arrivalSource ?? newer.arrivalSource,
      arrival: older.arrival ?? newer.arrival,
      updatedArrival: older.arrivalSource && newer.arrivalSource && older.arrivalSource !== newer.arrivalSource
        ? older.updatedArrival : newer.updatedArrival ?? older.updatedArrival,
    } : {}),
  };
}

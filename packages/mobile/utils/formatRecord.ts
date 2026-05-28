type RecordLike = {
  wins?: number | null;
  losses?: number | null;
  draws?: number | null;
  noContests?: number | null;
};

/** A fighter has a real record only if some bout is logged; default rows are all-zero. */
export function hasRecord(f: RecordLike): boolean {
  return (f.wins ?? 0) + (f.losses ?? 0) + (f.draws ?? 0) + (f.noContests ?? 0) > 0;
}

/** "W-L-D" when a record exists, otherwise null so callers can omit the line. */
export function formatRecord(f: RecordLike): string | null {
  return hasRecord(f) ? `${f.wins ?? 0}-${f.losses ?? 0}-${f.draws ?? 0}` : null;
}

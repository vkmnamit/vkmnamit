/**
 * Fetch ALL rows of a Supabase query by walking `.range()` pages.
 *
 * WHY THIS EXISTS:
 * Supabase / PostgREST caps every query at `db-max-rows` (default: 1000 rows)
 * unless you page with `.range(start, end)`. Any bulk operation that reads more
 * than 1000 rows — bulk fee push, fee generation, dedup map, exemptions —
 * silently truncates to the FIRST 1000 rows without this helper. That is why
 * "push fee to all" used to stop at exactly 1000 students for large schools.
 *
 * The passed query must NOT already contain `.limit()` / `.range()` — they are
 * added here per page. The builder is reused between pages (supabase-js v2
 * builders are immutable, so chaining `.range()` each iteration is safe).
 */
export async function fetchAllRows<T = any>(
  baseQuery: any,
  chunkSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await baseQuery.range(offset, offset + chunkSize - 1);
    if (error) {
      // Don't throw — callers use this for bulk ops where partial data + log
      // is better than killing a 10,000-student job. Error is visible in logs.
      console.error(`[PAGINATE] Failed at offset ${offset} (chunk ${chunkSize}):`, error.message);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < chunkSize) break;
    offset += data.length;
  }

  return all;
}

/**
 * Chunk an array into slices of the given size (used to keep Supabase
 * `.in()` clauses small enough for URL/header limits).
 */
export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
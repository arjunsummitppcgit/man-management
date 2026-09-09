import type { PostgrestError } from '@supabase/supabase-js';

/**
 * PostgREST never returns more than `max-rows` (1000 on Supabase) in one
 * response, and it does it silently — a three-month report just comes back
 * short, with no error and no clue that anything is missing.
 */
export const PAGE_SIZE = 1000;

type Page<T> = { data: T[] | null; error: PostgrestError | null };

/**
 * Run a query in 1000-row pages and return every row.
 *
 * `page` is called once per page and must apply `.range(from, to)` to a freshly
 * built query. Order the query by something unique (the `id` primary key is the
 * usual tiebreaker) — paging an ambiguous sort can repeat or skip rows.
 *
 *   const rows = await fetchAllRows((from, to) =>
 *     supabase.from('hl_va_entries').select('*')
 *       .gte('work_date', fromDate)
 *       .order('work_date').order('id')
 *       .range(from, to)
 *   );
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<Page<T>>
): Promise<T[]> {
  const rows: T[] = [];

  for (;;) {
    const { data, error } = await page(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw error;

    const batch = data ?? [];
    rows.push(...batch);

    // A short page is the last page.
    if (batch.length < PAGE_SIZE) return rows;
  }
}

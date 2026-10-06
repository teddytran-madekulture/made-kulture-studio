// Read EVERY row of a query, not just the first 1,000.
//
// PostgREST caps any single select at 1,000 rows (Supabase's default
// max-rows) and returns them with NO error — so a query that outgrows the
// cap looks exactly like one that fit. Found 2026-10-06 in the security
// pass: the Creative Directory loads all portfolio_images in one select, so
// past 1,000 photos the members whose pictures fell off the end would have
// silently failed "has a photo" and dropped out of the directory, lost
// Founding eligibility, and become unmessageable. Same class as the 50-login
// listUsers bug of 2026-10-04.
//
// `build` must return a FRESH builder each time (a PostgREST builder is
// single-use); pass the same select/filters you would have written inline.
// A page error is returned, never swallowed — a partial result that reads as
// complete is the whole problem.
export async function selectAll<T = any>(
  build: () => any,
  pageSize = 1000,
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const out: T[] = []
  for (let from = 0; from < 200_000; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1)
    if (error) return { data: null, error }
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < pageSize) break
  }
  return { data: out, error: null }
}

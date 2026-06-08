// Date helpers shared across the order mappers.

/**
 * Normalize any parseable date string to a UTC ISO-8601 string (…Z).
 *
 * Order sources hand us timestamps in three different shapes — UTC `Z` (Etsy,
 * Amazon), a fixed UTC offset (Shopify), and naive local time with no offset
 * (ShipStation). The analytics queries in lib/db.ts compare `created_at`
 * lexicographically against `Date#toISOString()` bounds, so every row must be
 * stored in the same UTC `Z` form. Run source timestamps through this at the
 * mapper boundary to guarantee that.
 *
 * Naive (offset-less) strings are interpreted in the server's local timezone —
 * correct as long as the server runs in the same TZ as the source account.
 * Unparseable input is returned unchanged rather than dropped.
 */
export function toUtcIso(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return raw;
  return new Date(ms).toISOString();
}

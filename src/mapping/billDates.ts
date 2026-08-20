/**
 * The real Razorpay production/staging BBPS REST API's `bill_date`/
 * `due_date` fields (on a successful `GET /bill_requests/:id` poll) come
 * back as Unix-epoch SECONDS (e.g. `1788652800` -> 2026-09-06), not the ISO
 * `"YYYY-MM-DD"` date string `types/npci.ts`'s `dueDate`/`billDate` doc
 * comments assume ("ISO date, \"9999-01-01\" if unavailable") and that
 * `MockBbpcuClient` actually produces. Confirmed by hand: a real production
 * bill fetch rendered "Due 1788652800" verbatim in the widget because the
 * raw epoch value was passed straight through every mapping layer
 * unconverted.
 *
 * `epochSecondsToIsoDate()` normalizes that: a purely-numeric value is
 * treated as epoch seconds and converted to `"YYYY-MM-DD"`; anything else
 * (already-ISO strings, or the `"0001-01-01"`/`"9999-01-01"` placeholders
 * used when a date is genuinely unavailable) is left untouched rather than
 * guessed at.
 *
 * Used by both `gateway/productionBbpcuClient.ts` and
 * `gateway/stagingSandboxBbpcuClient.ts` — confirmed the same underlying
 * REST API (see either file's header comment), so both have the same
 * epoch-vs-ISO mismatch.
 */
const PURELY_NUMERIC = /^\d+$/;

export function epochSecondsToIsoDate(raw: string | number | undefined): string | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const str = String(raw);
  if (!PURELY_NUMERIC.test(str)) return str;
  const seconds = Number(str);
  if (!Number.isFinite(seconds)) return str;
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

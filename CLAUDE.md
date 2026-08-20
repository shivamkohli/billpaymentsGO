# Project rules for Claude Code sessions

## Production Razorpay BBPS API — usage constraints (binding, do not relax)

This project has real production Razorpay credentials wired up (see `.env`,
`BBPS_MODE=production`, `BBPS_PRODUCTION_*`). The following rules govern how
that production access may be used. These are business/compliance
constraints, not implementation details — preserve them across sessions,
compaction, and refactors. If asked to touch anything under `src/gateway/` or
`src/http/routes/`, re-read this section first.

1. **Production is allowed ONLY for:**
   - Listing biller categories.
   - Listing billers within a category.
   - Fetching bill/consumer data for a given biller + consumer ID.

2. **Consumer-data fetch limit:** maximum **4 fetches** per
   (consumer ID, biller) pair, **across all sessions, forever** — not per day,
   not per process restart. This must be enforced with durable storage
   (Supabase; see `src/store/`), not in-memory counters, because in-memory
   state resets on restart and would silently defeat the cap. Once the 4th
   fetch is used, the 5th must be rejected before any network call is made.

3. **Pay Bill must NEVER call production.** Always use mock data, and
   determine success/failure from the mock response — even when
   `BBPS_MODE=production`. This must be enforced structurally (i.e. the
   production client must not have a working real `sendBillPayment` path),
   not just by a route-level convention that's easy to forget later.

4. **Complaints must NEVER call production.** Same treatment as Pay Bill —
   always mock, enforced structurally in the client, not just by convention.

Any change to `src/gateway/index.ts`, the `BbpcuClient` implementations, or
the biller-catalog routes must preserve all four rules above. When in doubt,
default to mock/registry rather than production.

## Credentials handling

- Real credentials live only in `.env` (gitignored, never commit).
- Never print full secrets back into chat/logs once they've been entered;
  reference them by env var name (e.g. `BBPS_PRODUCTION_KEY_SECRET`) instead.

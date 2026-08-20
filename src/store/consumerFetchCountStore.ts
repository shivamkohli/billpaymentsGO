/**
 * Durable counter enforcing the "max 4 real production consumer-data fetches
 * per (biller, consumer), ever" rule — see CLAUDE.md "Production Razorpay
 * BBPS API — usage constraints" and
 * supabase/migrations/0002_consumer_fetch_counts.sql.
 *
 * Same Supabase-with-in-memory-fallback shape as billRequestStore.ts/
 * paymentStore.ts, with one important difference: the in-memory fallback
 * does NOT satisfy the "ever, across restarts" requirement on its own (it
 * resets on process restart) — this is fine for local BBPS_MODE=mock/staging
 * dev loops, but if you're actually relying on this cap while
 * BBPS_MODE=production, make sure SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are
 * set, or the cap is only best-effort for the lifetime of this process.
 */

import { getSupabaseClient } from "./supabaseClient";

const TABLE = "bbps_consumer_fetch_counts";
export const MAX_PRODUCTION_CONSUMER_FETCHES = 4;

interface CountRow {
  biller_id: string;
  consumer_identifier: string;
  fetch_count: number;
}

/** In-memory fallback, keyed by `${billerId}::${consumerIdentifier}`. Resets on restart — see file header. */
const memoryFallback = new Map<string, number>();
let warnedNoSupabase = false;

function memoryKey(billerId: string, consumerIdentifier: string): string {
  return `${billerId}::${consumerIdentifier}`;
}

function warnIfNoSupabase(): void {
  if (warnedNoSupabase) return;
  warnedNoSupabase = true;
  console.warn(
    `[store] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set — the production consumer-data fetch cap ` +
      `(max ${MAX_PRODUCTION_CONSUMER_FETCHES} per biller+consumer) is only enforced in-memory and will ` +
      `NOT survive a restart. Configure Supabase before relying on this cap against real production data.`
  );
}

/** Current fetch count for this (biller, consumer) pair, without incrementing it. */
export async function getConsumerFetchCount(billerId: string, consumerIdentifier: string): Promise<number> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    warnIfNoSupabase();
    return memoryFallback.get(memoryKey(billerId, consumerIdentifier)) ?? 0;
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select("fetch_count")
    .eq("biller_id", billerId)
    .eq("consumer_identifier", consumerIdentifier)
    .maybeSingle();
  if (error) {
    console.error(`[store] Supabase select from ${TABLE} failed:`, error.message);
    return memoryFallback.get(memoryKey(billerId, consumerIdentifier)) ?? 0;
  }
  return (data as CountRow | null)?.fetch_count ?? 0;
}

/**
 * Atomically-enough increments the counter and returns the new count.
 * Read-then-write (not a single atomic SQL increment) — acceptable here
 * because this is a low-concurrency onboarding/demo system, not a
 * high-throughput production payment path; a rare race would at most let one
 * extra fetch slip through, never silently lose the cap entirely.
 */
export async function incrementConsumerFetchCount(billerId: string, consumerIdentifier: string): Promise<number> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    warnIfNoSupabase();
    const key = memoryKey(billerId, consumerIdentifier);
    const next = (memoryFallback.get(key) ?? 0) + 1;
    memoryFallback.set(key, next);
    return next;
  }

  const current = await getConsumerFetchCount(billerId, consumerIdentifier);
  const next = current + 1;
  const now = new Date().toISOString();
  const { error } = await supabase.from(TABLE).upsert(
    {
      biller_id: billerId,
      consumer_identifier: consumerIdentifier,
      fetch_count: next,
      last_fetched_at: now,
      ...(current === 0 ? { first_fetched_at: now } : {}),
    },
    { onConflict: "biller_id,consumer_identifier" }
  );
  if (error) {
    console.error(`[store] Supabase upsert into ${TABLE} failed (falling back to in-memory for this record):`, error.message);
    const key = memoryKey(billerId, consumerIdentifier);
    memoryFallback.set(key, next);
  }
  return next;
}

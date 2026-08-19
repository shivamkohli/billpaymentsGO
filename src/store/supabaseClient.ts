import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config/env";

/**
 * Lazily-constructed Supabase client, shared by every entity store in this
 * directory (billRequestStore.ts, paymentStore.ts). Returns `null` when
 * SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY aren't set — callers are expected to
 * fall back to MemoryStore in that case (see billRequestStore.ts/
 * paymentStore.ts), so a merchant can still run this locally against
 * BBPS_MODE=mock with zero DB setup, same as before Supabase was wired in.
 *
 * Schema lives in supabase/migrations/0001_bbps_entities.sql — run that in
 * the target Supabase project's SQL editor (or via `supabase db push`)
 * before pointing this at a real project.
 */
let client: SupabaseClient | null = null;
let warnedNotConfigured = false;

export function getSupabaseClient(): SupabaseClient | null {
  if (!config.supabase.enabled) {
    if (!warnedNotConfigured) {
      console.warn(
        "[store] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set — bill_requests and payments are held " +
          "in-memory only and will NOT survive a restart or be queryable per-customer. " +
          "See .env.example and supabase/migrations/0001_bbps_entities.sql."
      );
      warnedNotConfigured = true;
    }
    return null;
  }
  if (!client) {
    client = createClient(config.supabase.url as string, config.supabase.serviceRoleKey as string, {
      auth: { persistSession: false },
    });
  }
  return client;
}

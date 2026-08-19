/**
 * Persistence for BillRequestResource ("bill fetched for a customer").
 * Backed by Supabase (Postgres) when SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
 * are set; otherwise transparently falls back to the old MemoryStore so
 * BBPS_MODE=mock still works with zero external setup.
 *
 * The full merchant-facing resource is kept as-is in the `resource` jsonb
 * column (so this table is always a faithful record of exactly what a
 * partner was shown), with a few columns pulled out for querying — notably
 * `customer_mobile`, which is how "everything this user has fetched/paid"
 * gets answered (see listBillRequestsByCustomerMobile, used by
 * GET /v1/bill_payments/bill_requests?customer_mobile=...).
 */

import { MemoryStore } from "./memoryStore";
import { getSupabaseClient } from "./supabaseClient";
import { BillRequestResource } from "../types/merchant";

const TABLE = "bbps_bill_requests";
const memoryFallback = new MemoryStore<BillRequestResource>();

function toRow(resource: BillRequestResource, ttlMs?: number) {
  return {
    id: resource.id,
    customer_mobile: resource.customer?.mobile ?? null,
    customer_name: resource.customer?.name ?? null,
    biller_id: resource.biller_id,
    gateway_biller_id: resource.gateway_biller_id ?? null,
    status: resource.status,
    resource,
    created_at: new Date(resource.created_at).toISOString(),
    updated_at: resource.updated_at ? new Date(resource.updated_at).toISOString() : null,
    expires_at: ttlMs ? new Date(Date.now() + ttlMs).toISOString() : null,
  };
}

export async function saveBillRequest(resource: BillRequestResource, ttlMs?: number): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    memoryFallback.set(resource.id, resource, ttlMs);
    return;
  }
  const { error } = await supabase.from(TABLE).upsert(toRow(resource, ttlMs));
  if (error) {
    console.error(`[store] Supabase upsert into ${TABLE} failed (falling back to in-memory for this record):`, error.message);
    memoryFallback.set(resource.id, resource, ttlMs);
  }
}

export async function getBillRequestById(id: string): Promise<BillRequestResource | undefined> {
  const supabase = getSupabaseClient();
  if (!supabase) return memoryFallback.get(id);

  const { data, error } = await supabase
    .from(TABLE)
    .select("resource, expires_at")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error(`[store] Supabase select from ${TABLE} failed:`, error.message);
    return undefined;
  }
  if (!data) return undefined;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return undefined;
  return data.resource as BillRequestResource;
}

/** Every bill this customer has fetched, newest first — the "fetched" half of "fetched and paid against each user". */
export async function listBillRequestsByCustomerMobile(mobile: string): Promise<BillRequestResource[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return memoryFallback
      .list()
      .filter((r) => r.customer?.mobile === mobile)
      .sort((a, b) => b.created_at - a.created_at);
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select("resource")
    .eq("customer_mobile", mobile)
    .order("created_at", { ascending: false });
  if (error) {
    console.error(`[store] Supabase select from ${TABLE} failed:`, error.message);
    return [];
  }
  return (data ?? []).map((row) => row.resource as BillRequestResource);
}

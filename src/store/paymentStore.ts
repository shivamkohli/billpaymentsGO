/**
 * Persistence for PaymentResource ("bill paid by a customer") — the "paid"
 * half of "fetched and paid against each user". Same Supabase-with-
 * in-memory-fallback shape as billRequestStore.ts; see that file's header
 * for the reasoning.
 *
 * Also carries `txn_reference_id`, NPCI's internal id for this transaction.
 * It's deliberately kept in its own column rather than inside the `resource`
 * jsonb blob, because `resource` is exactly what's returned to merchant
 * partners over the API and txnReferenceId is not part of that contract
 * (see complaintService.ts, the only internal consumer — a CMS complaint,
 * xchangeId 501, is filed against it).
 */

import { MemoryStore } from "./memoryStore";
import { getSupabaseClient } from "./supabaseClient";
import { PaymentResource } from "../types/merchant";

const TABLE = "bbps_payments";
const memoryFallback = new MemoryStore<PaymentResource>();
const txnReferenceFallback = new Map<string, string>();

function toRow(resource: PaymentResource, txnReferenceId?: string) {
  return {
    id: resource.id,
    customer_mobile: resource.customer?.mobile ?? null,
    customer_name: resource.customer?.name ?? null,
    biller_id: resource.biller_id ?? null,
    gateway_biller_id: resource.gateway_biller_id ?? null,
    status: resource.status,
    bill_pay_amount: resource.bill_pay_amount,
    currency: resource.currency,
    gateway_transaction_id: resource.gateway_transaction_id ?? null,
    txn_reference_id: txnReferenceId ?? null,
    resource,
    created_at: new Date(resource.created_at).toISOString(),
    updated_at: resource.updated_at ? new Date(resource.updated_at).toISOString() : null,
  };
}

export async function savePayment(resource: PaymentResource, txnReferenceId?: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    memoryFallback.set(resource.id, resource);
    if (txnReferenceId) txnReferenceFallback.set(resource.id, txnReferenceId);
    return;
  }
  const { error } = await supabase.from(TABLE).upsert(toRow(resource, txnReferenceId));
  if (error) {
    console.error(`[store] Supabase upsert into ${TABLE} failed (falling back to in-memory for this record):`, error.message);
    memoryFallback.set(resource.id, resource);
    if (txnReferenceId) txnReferenceFallback.set(resource.id, txnReferenceId);
  }
}

export async function getPaymentById(id: string): Promise<PaymentResource | undefined> {
  const supabase = getSupabaseClient();
  if (!supabase) return memoryFallback.get(id);

  const { data, error } = await supabase.from(TABLE).select("resource").eq("id", id).maybeSingle();
  if (error) {
    console.error(`[store] Supabase select from ${TABLE} failed:`, error.message);
    return undefined;
  }
  return (data?.resource as PaymentResource | undefined) ?? undefined;
}

export async function getPaymentTxnReferenceId(id: string): Promise<string | undefined> {
  const supabase = getSupabaseClient();
  if (!supabase) return txnReferenceFallback.get(id);

  const { data, error } = await supabase.from(TABLE).select("txn_reference_id").eq("id", id).maybeSingle();
  if (error) {
    console.error(`[store] Supabase select from ${TABLE} failed:`, error.message);
    return undefined;
  }
  return data?.txn_reference_id ?? undefined;
}

/** Every payment this customer has made, newest first. */
export async function listPaymentsByCustomerMobile(mobile: string): Promise<PaymentResource[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return memoryFallback
      .list()
      .filter((p) => p.customer?.mobile === mobile)
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
  return (data ?? []).map((row) => row.resource as PaymentResource);
}

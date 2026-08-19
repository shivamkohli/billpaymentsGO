/**
 * In-memory entity store. Originally stood in for a real DB everywhere;
 * bill_requests and payments have since moved to Supabase-backed persistence
 * (src/store/billRequestStore.ts, src/store/paymentStore.ts) — this class is
 * now only used as: (a) their automatic fallback when
 * SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY aren't set, and (b) directly by
 * `complaintService.ts`, which hasn't been migrated (not asked for yet —
 * complaints are comparatively low-volume and don't need the
 * per-customer-mobile querying bill_requests/payments do).
 *
 * Keyed by the merchant-facing entity id (`billreq_...`, `pay_...`,
 * `complaint_...`). Swapping a remaining consumer to a real store is a
 * one-file change: keep the same get/set/update signature (see
 * billRequestStore.ts/paymentStore.ts for the pattern).
 */
export class MemoryStore<T> {
  private readonly data = new Map<string, { value: T; expiresAt?: number }>();

  set(id: string, value: T, ttlMs?: number): void {
    this.data.set(id, { value, expiresAt: ttlMs ? Date.now() + ttlMs : undefined });
  }

  get(id: string): T | undefined {
    const entry = this.data.get(id);
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && entry.expiresAt < Date.now()) {
      this.data.delete(id);
      return undefined;
    }
    return entry.value;
  }

  update(id: string, updater: (current: T) => T): T | undefined {
    const current = this.get(id);
    if (current === undefined) return undefined;
    const next = updater(current);
    const existingTtl = this.data.get(id)?.expiresAt;
    this.data.set(id, { value: next, expiresAt: existingTtl });
    return next;
  }

  list(): T[] {
    const now = Date.now();
    const out: T[] = [];
    for (const [id, entry] of this.data) {
      if (entry.expiresAt !== undefined && entry.expiresAt < now) {
        this.data.delete(id);
        continue;
      }
      out.push(entry.value);
    }
    return out;
  }
}

/**
 * In-memory entity store standing in for a real DB (Postgres/Redis) for the
 * hackathon build. Every orchestration service (`billRequestService.ts`,
 * `paymentService.ts`, `complaintService.ts`) owns one instance of this,
 * keyed by the merchant-facing entity id (`billreq_...`, `pay_...`,
 * `complaint_...`).
 *
 * Swapping this for a real store later is a one-file-per-service change:
 * keep the same get/set/update signature.
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

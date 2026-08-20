/**
 * Translates the NPCI/BBPS-spec `INITIATING_CHANNEL` code (what
 * `device.initiating_channel` carries on the merchant-facing
 * `bill_payment.bill_request` resource — see `types/merchant.ts`, e.g.
 * `"MOB"`, `"INT"`, `"AGT"`) into the vocabulary the REAL Razorpay
 * production/staging BBPS REST API's `POST /bill_requests` actually expects
 * for its own `device.initiating_channel` field.
 *
 * Confirmed by hand against the live production endpoint: submitting the
 * lowercased NPCI code directly (e.g. `"mob"`) is rejected with
 * `initiating channel 'mob' not supported by biller; supported: [atm agent
 * bank_branch business_correspondent internet internet_banking kiosk mpos
 * mobile mobile_banking pos]` — i.e. the exact same "two different
 * vocabularies that happen to share a naming convention" trap as
 * `billCategories.ts`'s UI-key-vs-production-slug mapping, just for
 * initiating channel instead of biller category. `deviceFromTags()` in
 * `gateway/productionBbpcuClient.ts` (and the byte-for-byte-identical
 * `gateway/stagingSandboxBbpcuClient.ts`, which talks to the same REST API
 * per that file's own header comment) previously lowercased the NPCI code
 * and sent it straight through unmapped, so EVERY initiating channel except
 * the ones that happen to already collide with production's vocabulary
 * (none confirmed to collide) would be rejected the same way.
 *
 * The lowercased NPCI code is still used internally by both gateway clients
 * to decide which optional `device.*` sub-fields to populate (ip/mac vs.
 * imei/os/app vs. mobile/geocode/postal_code/terminal_id) — this map only
 * changes what's written into the wire-level `initiating_channel` field
 * itself.
 */

const NPCI_CHANNEL_TO_PRODUCTION_CHANNEL: Record<string, string> = {
  bnkbrnch: "bank_branch",
  mob: "mobile",
  mobb: "mobile_banking",
  int: "internet",
  intb: "internet_banking",
  atm: "atm",
  kiosk: "kiosk",
  agt: "agent",
  bsc: "business_correspondent",
};

/**
 * `npciChannel` should already be lowercased (both gateway clients lowercase
 * the raw `INITIATING_CHANNEL` tag before branching on it). Falls back to
 * the input unchanged for any NPCI code with no confirmed production
 * equivalent, rather than guessing.
 */
export function mapNpciChannelToProductionChannel(npciChannel: string): string {
  return NPCI_CHANNEL_TO_PRODUCTION_CHANNEL[npciChannel] || npciChannel;
}

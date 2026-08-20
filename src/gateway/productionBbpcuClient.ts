/**
 * Talks to the REAL Razorpay production BBPS API
 * (`https://api.razorpay.com/v1/bill_payments`) — wired in whenever
 * `BBPS_MODE=production` (see `src/gateway/index.ts`).
 *
 * SCOPE IS DELIBERATELY NARROW. See CLAUDE.md "Production Razorpay BBPS API
 * — usage constraints" before changing anything in this file:
 *   1. Production may be used for consumer/bill-data fetch (`sendBillFetch`/
 *      `sendBillValidate`) ONLY, and only up to
 *      `MAX_PRODUCTION_CONSUMER_FETCHES` (4) times per (biller, consumer)
 *      pair, ever — enforced below via `src/store/consumerFetchCountStore.ts`
 *      *before* any network call is made.
 *   2. `sendBillPayment` NEVER calls production — it structurally delegates
 *      to `MockBbpcuClient`, so even if this class is wired up as the active
 *      `BbpcuClient`, Pay Bill still runs on mock data end to end.
 *   3. `sendTxnStatusComplain` NEVER calls production — same structural
 *      delegation to `MockBbpcuClient`.
 * Categories/billers-within-category (the other allowed production
 * operation) are handled separately in
 * `src/gateway/productionBillerCatalogClient.ts` — that's a plain read-only
 * catalog listing, not part of the `BbpcuClient` (signed-XML) interface.
 *
 * The wire contract for bill_requests below (create-then-poll REST/JSON) is
 * identical to `stagingSandboxBbpcuClient.ts` — confirmed by hand: both
 * `GET /billers/categories` and `GET /billers` on production returned the
 * exact same envelope shape as staging/local, just against
 * `https://api.razorpay.com/v1/bill_payments` instead of
 * `https://api-web.ext.dev.razorpay.in/v1/bill_payments` — i.e. staging and
 * production are the same Razorpay BBPS API, different environments.
 */

import {
  buildBillFetchResponseXml,
  buildBillValidationResponseXml,
} from "../xml/builder";
import { parseBillFetchRequestXml, parseBillValidationRequestXml } from "../xml/parser";
import { NpciBillFetchResponse, NpciTag } from "../types/npci";
import { generateMsgOrRefId, isoTimestamp } from "../ids/generator";
import { mapNpciChannelToProductionChannel } from "../mapping/npciChannelCodes";
import { epochSecondsToIsoDate } from "../mapping/billDates";
import { ProductionCredentials } from "../config/credentials";
import {
  getConsumerFetchCount,
  incrementConsumerFetchCount,
  MAX_PRODUCTION_CONSUMER_FETCHES,
} from "../store/consumerFetchCountStore";
import { BbpcuClient } from "./BbpcuClient";
import { MockBbpcuClient } from "./mockBbpcuClient";

const PRODUCTION_ORIG_INST = "RZPPRD"; // stands in for "the network side" in response Heads

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 15; // ~30s ceiling, same as the staging client

interface ProductionBillLine {
  bill_number?: string;
  amount?: string | number;
  currency?: string;
  bill_date?: string;
  due_date?: string;
  bill_period?: string;
  account_holder_name?: string;
}

interface ProductionBillRequest {
  id: string;
  status: "processing" | "success" | "failed";
  bills?: ProductionBillLine[];
  error_code?: string;
  error_description?: string;
  error_reason?: string;
  gateway_error_code?: string;
}

function mockHead(refId: string) {
  return { origInst: PRODUCTION_ORIG_INST, refId, ts: isoTimestamp(), ver: "1.6" };
}

function tagValue(tags: NpciTag[] | undefined, name: string): string | undefined {
  return tags?.find((t) => t.name === name)?.value;
}

function deviceFromTags(tags: NpciTag[] | undefined): Record<string, string> {
  const channel = (tagValue(tags, "INITIATING_CHANNEL") || "int").toLowerCase();
  // `channel` (the NPCI code, e.g. "mob") stays as the branching key below —
  // only the wire-level field gets translated to production's own
  // initiating_channel vocabulary (e.g. "mobile"). See npciChannelCodes.ts.
  const device: Record<string, string> = { initiating_channel: mapNpciChannelToProductionChannel(channel) };
  const ip = tagValue(tags, "IP") || "203.0.113.10";
  const mac = tagValue(tags, "MAC") || "AA:BB:CC:DD:EE:FF";
  const imei = tagValue(tags, "IMEI") || "990000862471854";
  const os = tagValue(tags, "OS") || "android";
  const app = tagValue(tags, "APP") || "bbps-go";
  if (channel === "int" || channel === "intb") {
    device.ip = ip;
    device.mac = mac;
  } else if (channel === "mob" || channel === "mobb") {
    device.ip = ip;
    device.imei = imei;
    device.os = os;
    device.app = app;
  } else if (channel === "agt") {
    device.mobile = tagValue(tags, "MOBILE") || "9999999999";
    device.geocode = tagValue(tags, "GEOCODE") || "0,0";
    device.postal_code = tagValue(tags, "POSTAL_CODE") || "560001";
    device.terminal_id = tagValue(tags, "TERMINAL_ID") || "TERM001";
  }
  return device;
}

function accountHolderFromTags(tags: NpciTag[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of tags || []) out[t.name] = t.value;
  return out;
}

/**
 * Canonical identifier for the "consumer" half of the (biller, consumer) cap
 * key — built from the actual account/consumer params the customer entered
 * (e.g. "Consumer Number"), NOT the customer's mobile number, since the same
 * mobile could plausibly fetch bills for different consumer accounts and
 * those must be capped independently.
 */
export function computeConsumerIdentifier(accountHolder: Record<string, string>): string {
  const entries = Object.entries(accountHolder).sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${k}=${v}`).join("&") || "unknown";
}

export class ProductionBbpcuClient implements BbpcuClient {
  private readonly mock = new MockBbpcuClient();

  constructor(private readonly creds: ProductionCredentials) {}

  private authHeader(): string {
    return "Basic " + Buffer.from(`${this.creds.keyId}:${this.creds.keySecret}`).toString("base64");
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<{ status: number; json: T }> {
    const res = await fetch(`${this.creds.baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: this.authHeader() },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as T;
    return { status: res.status, json };
  }

  private async pollUntilTerminal<T extends { status: string }>(path: string, isTerminal: (v: T) => boolean): Promise<T> {
    let last: T | undefined;
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      const { json } = await this.request<T>("GET", path);
      last = json;
      if (isTerminal(json)) return json;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    if (last) return last;
    throw new Error(`Production poll timed out with no response at all: ${path}`);
  }

  // ── Bill fetch / validation — the ONLY real production network calls ────

  async sendBillFetch(signedRequestXml: string): Promise<string> {
    return this.doFetchOrValidate(signedRequestXml, "fetch");
  }

  async sendBillValidate(signedRequestXml: string): Promise<string> {
    return this.doFetchOrValidate(signedRequestXml, "validate");
  }

  private async doFetchOrValidate(xml: string, kind: "fetch" | "validate"): Promise<string> {
    const req = kind === "fetch" ? parseBillFetchRequestXml(xml) : parseBillValidationRequestXml(xml);
    const billerId = req.billDetails.biller.id;
    const refId = generateMsgOrRefId();
    const accountHolder = accountHolderFromTags(req.billDetails.customerParams?.tags);
    const consumerIdentifier = computeConsumerIdentifier(accountHolder);

    // Enforce the 4-fetch-ever cap BEFORE making any network call.
    const currentCount = await getConsumerFetchCount(billerId, consumerIdentifier);
    if (currentCount >= MAX_PRODUCTION_CONSUMER_FETCHES) {
      const resp: NpciBillFetchResponse = {
        head: mockHead(refId),
        reason: {
          responseCode: "003",
          responseReason:
            `Production consumer-data fetch limit (${MAX_PRODUCTION_CONSUMER_FETCHES}) already reached ` +
            `for this biller + consumer — no further production fetches are allowed for this pair.`,
        },
        txn: { ts: isoTimestamp(), msgId: generateMsgOrRefId() },
      };
      return kind === "fetch" ? buildBillFetchResponseXml(resp) : buildBillValidationResponseXml(resp);
    }

    const emailTag = tagValue(req.customer.tags, "EMAIL");
    const createBody = {
      gateway_biller_id: billerId,
      customer: {
        id: req.customer.mobile,
        name: "Customer " + req.customer.mobile.slice(-4),
        mobile: req.customer.mobile,
        email: emailTag || `${req.customer.mobile}@example.com`,
      },
      device: deviceFromTags(req.agent.device.tags),
      biller_data: { account_holder: accountHolder },
    };

    // Count this attempt against the cap regardless of outcome — a failed
    // production call still consumed a real consumer-data lookup slot.
    await incrementConsumerFetchCount(billerId, consumerIdentifier);

    const create = await this.request<{ id?: string; error?: { description?: string } }>(
      "POST",
      "/bill_requests",
      createBody
    );

    if (create.status >= 300 || !create.json.id) {
      const resp: NpciBillFetchResponse = {
        head: mockHead(refId),
        reason: { responseCode: "003", responseReason: create.json.error?.description || "Production bill_request create failed" },
        txn: { ts: isoTimestamp(), msgId: generateMsgOrRefId() },
      };
      return kind === "fetch" ? buildBillFetchResponseXml(resp) : buildBillValidationResponseXml(resp);
    }

    const final = await this.pollUntilTerminal<ProductionBillRequest>(
      `/bill_requests/${create.json.id}`,
      (v) => v.status === "success" || v.status === "failed"
    );

    let resp: NpciBillFetchResponse;
    if (final.status === "success") {
      const bill = final.bills?.[0];
      resp = {
        head: mockHead(refId),
        reason: { responseCode: "000", responseReason: kind === "fetch" ? "Bill Fetched Successfully" : "Customer Validated Successfully" },
        txn: { ts: isoTimestamp(), msgId: generateMsgOrRefId() },
        billDetails: req.billDetails,
        billerResponse: bill
          ? {
              customerName: bill.account_holder_name,
              amount: String(bill.amount ?? "0"),
              dueDate: epochSecondsToIsoDate(bill.due_date),
              billDate: epochSecondsToIsoDate(bill.bill_date),
              billNumber: bill.bill_number,
              billPeriod: (bill.bill_period || "NA").toUpperCase(),
            }
          : undefined,
      };
    } else {
      resp = {
        head: mockHead(refId),
        reason: {
          responseCode: final.gateway_error_code || "003",
          responseReason: final.error_description || final.error_reason || "Production bill fetch failed",
        },
        txn: { ts: isoTimestamp(), msgId: generateMsgOrRefId() },
      };
    }
    return kind === "fetch" ? buildBillFetchResponseXml(resp) : buildBillValidationResponseXml(resp);
  }

  // ── Pay Bill — NEVER production, always mock (rule 3 in CLAUDE.md) ──────

  async sendBillPayment(signedRequestXml: string): Promise<string> {
    return this.mock.sendBillPayment(signedRequestXml);
  }

  // ── Complaints — NEVER production, always mock (rule 4 in CLAUDE.md) ────

  async sendTxnStatusComplain(signedRequestXml: string): Promise<string> {
    return this.mock.sendTxnStatusComplain(signedRequestXml);
  }
}

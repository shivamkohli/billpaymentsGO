/**
 * Talks to Razorpay's own BBPS *sandbox* (stage) — a deterministic
 * mock-gateway REST/JSON API (see the "Razorpay BBPS Sandbox — Merchant
 * Integration Guide") — instead of `MockBbpcuClient`'s purely local/in-repo
 * fake data. Wired in whenever `BBPS_MODE=staging` (see `src/gateway/index.ts`).
 *
 * This is exactly the "downstream aggregator fronting the same NPCI message
 * set over a simpler REST+Bearer-token API" case called out in
 * `BbpcuClient`'s doc comment: the orchestration layer still builds/signs
 * NPCI XML and expects NPCI XML back, so every method here (a) parses the
 * incoming signed XML with `xml/parser.ts` into the same domain objects
 * `MockBbpcuClient` uses, (b) translates that into a sandbox REST call,
 * (c) polls the sandbox's async create-then-poll endpoints to a terminal
 * state, and (d) rebuilds an NPCI response XML string with `xml/builder.ts`
 * so the orchestration layer's `parse*ResponseXml` calls work unchanged.
 *
 * IMPORTANT SCOPING NOTE: the sandbox currently exposes exactly one biller
 * (`gateway_biller_id: SBOX00000NATDF`, public id `biller_SBOXSANDBOX001`) —
 * see `mapping/billerRegistry.ts`. Real billers ingested from the biller-logo
 * Drive folder / MDM spreadsheet have no counterpart in the sandbox, so
 * calling this gateway for any biller other than SBOX00000NATDF will fail
 * with a "biller not found" style error from the sandbox itself. This client
 * is for exercising/demoing the real staging network path end-to-end, not
 * for getting real-time data on the full biller catalogue.
 *
 * Two known sandbox-side quirks (confirmed against the live stage gateway,
 * not just the docs) baked in below:
 *   1. `fees` is NOT optional despite the guide saying so — omitting it, or
 *      sending a nonzero `biller_convenience_fee` for a biller that doesn't
 *      configure CCF, both 400. We always send explicit fees (defaulting to
 *      0/0) and let a genuinely-nonzero CCF surface as a real gateway error.
 *   2. Complaint registration (`POST /complaints`) currently 503s
 *      (`EXTERNAL_SERVICE_ERROR`) even for a normal, non-`FAIL` description —
 *      this looks like a live sandbox bug, reported upstream. We surface that
 *      as a normal NPCI-style failure reason rather than throwing, so a
 *      complaint-status poll loop doesn't hang.
 */

import {
  buildBillFetchResponseXml,
  buildBillPaymentResponseXml,
  buildBillValidationResponseXml,
  buildTxnStatusComplainRespXml,
} from "../xml/builder";
import {
  parseBillFetchRequestXml,
  parseBillPaymentRequestXml,
  parseBillValidationRequestXml,
  parseTxnStatusComplainReqXml,
} from "../xml/parser";
import {
  NpciBillFetchResponse,
  NpciBillPaymentResponse,
  NpciComplaintStatus,
  NpciTag,
  NpciTxnStatusComplainResp,
} from "../types/npci";
import { generateMsgOrRefId, isoTimestamp } from "../ids/generator";
import { mapNpciChannelToProductionChannel } from "../mapping/npciChannelCodes";
import { epochSecondsToIsoDate } from "../mapping/billDates";
import { StagingSandboxCredentials } from "../config/credentials";
import { BbpcuClient } from "./BbpcuClient";

const STAGING_ORIG_INST = "RZPSBX"; // stands in for "the sandbox/BBPCU side" in response Heads

/** Only mapping we have today — the sandbox exposes exactly one biller. Extend when more are issued. */
const SANDBOX_PUBLIC_BILLER_ID: Record<string, string> = {
  SBOX00000NATDF: "biller_SBOXSANDBOX001",
};

/**
 * The subset of locally-registered `biller_id`s that the real staging sandbox
 * can actually service right now. Consumed by `GET /billers` (see
 * `http/routes/billers.ts`) to hide the other locally-registered billers while
 * `BBPS_MODE=staging`, so the demo UI can't pick a biller that's guaranteed to
 * fail with a "biller not found" error from the real network. Extend this the
 * same day `SANDBOX_PUBLIC_BILLER_ID` above gets a new entry.
 */
export const STAGING_SANDBOX_SERVABLE_BILLER_IDS: readonly string[] = Object.keys(
  SANDBOX_PUBLIC_BILLER_ID
);

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 15; // ~30s ceiling — covers the documented "pending settles after ~30s" case

interface SandboxBillLine {
  bill_number?: string;
  amount?: string | number;
  currency?: string;
  bill_date?: string;
  due_date?: string;
  bill_period?: string;
  account_holder_name?: string;
}

interface SandboxBillRequest {
  id: string;
  status: "processing" | "success" | "failed";
  bills?: SandboxBillLine[];
  error_code?: string;
  error_description?: string;
  error_reason?: string;
  gateway_error_code?: string;
}

interface SandboxPayment {
  id: string;
  status: "processing" | "pending" | "success" | "failed";
  gateway_error_code?: string;
  error_reason?: string;
  error_description?: string;
  data?: { billerReferenceNumber?: string; paymentChannelRefNum?: string };
}

interface SandboxComplaint {
  id?: string;
  complaint?: { id: string; status: string };
  status?: string;
}

function mockHead(refId: string) {
  return { origInst: STAGING_ORIG_INST, refId, ts: isoTimestamp(), ver: "1.6" };
}

function tagValue(tags: NpciTag[] | undefined, name: string): string | undefined {
  return tags?.find((t) => t.name === name)?.value;
}

/** Rebuilds the sandbox's `device` object from the NPCI <Agent><Device> tags carried on the request. */
function deviceFromTags(tags: NpciTag[] | undefined): Record<string, string> {
  const channel = (tagValue(tags, "INITIATING_CHANNEL") || "int").toLowerCase();
  // `channel` (the NPCI code, e.g. "mob") stays as the branching key below —
  // only the wire-level field gets translated to the real REST API's own
  // initiating_channel vocabulary (e.g. "mobile"). See npciChannelCodes.ts;
  // this sandbox is confirmed to be the same underlying API as production
  // (see this file's header comment), so it has the same channel taxonomy.
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

export class StagingSandboxBbpcuClient implements BbpcuClient {
  constructor(private readonly creds: StagingSandboxCredentials) {}

  private authHeader(): string {
    return "Basic " + Buffer.from(`${this.creds.keyId}:${this.creds.keySecret}`).toString("base64");
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>
  ): Promise<{ status: number; json: T }> {
    const res = await fetch(`${this.creds.baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: this.authHeader(), ...extraHeaders },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as T;
    return { status: res.status, json };
  }

  private async pollUntilTerminal<T extends { status: string }>(
    path: string,
    isTerminal: (v: T) => boolean
  ): Promise<T> {
    let last: T | undefined;
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      const { json } = await this.request<T>("GET", path);
      last = json;
      if (isTerminal(json)) return json;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    if (last) return last; // give up, return last-known (still non-terminal) snapshot; caller maps it to a failure
    throw new Error(`Sandbox poll timed out with no response at all: ${path}`);
  }

  // ── Bill fetch / validation ─────────────────────────────────────────────

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
      biller_data: { account_holder: accountHolderFromTags(req.billDetails.customerParams?.tags) },
    };

    const create = await this.request<{ id?: string; error?: { description?: string } }>(
      "POST",
      "/bill_requests",
      createBody
    );

    if (create.status >= 300 || !create.json.id) {
      const resp: NpciBillFetchResponse = {
        head: mockHead(refId),
        reason: { responseCode: "003", responseReason: create.json.error?.description || "Sandbox bill_request create failed" },
        txn: { ts: isoTimestamp(), msgId: generateMsgOrRefId() },
      };
      return kind === "fetch" ? buildBillFetchResponseXml(resp) : buildBillValidationResponseXml(resp);
    }

    const final = await this.pollUntilTerminal<SandboxBillRequest>(
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
          responseReason: final.error_description || final.error_reason || "Sandbox bill fetch failed",
        },
        txn: { ts: isoTimestamp(), msgId: generateMsgOrRefId() },
      };
    }
    return kind === "fetch" ? buildBillFetchResponseXml(resp) : buildBillValidationResponseXml(resp);
  }

  // ── Bill payment ─────────────────────────────────────────────────────────

  async sendBillPayment(signedRequestXml: string): Promise<string> {
    const req = parseBillPaymentRequestXml(signedRequestXml);
    const billerId = req.billDetails.biller.id;
    const refId = generateMsgOrRefId();
    const emailTag = tagValue(req.customer.tags, "EMAIL");
    const vpa = tagValue(req.paymentInformation?.tags, "VPA") || `${req.customer.mobile}@upi`;
    const method = req.paymentMethod.paymentMode === "Wallet" ? "wallet" : "upi";
    const amount = Number(req.amount.amount);

    const publicBillerId = SANDBOX_PUBLIC_BILLER_ID[billerId];
    if (!publicBillerId) {
      const resp: NpciBillPaymentResponse = {
        head: mockHead(refId),
        reason: { responseCode: "003", responseReason: `No sandbox biller mapping for "${billerId}"` },
        txn: { ts: isoTimestamp(), msgId: generateMsgOrRefId(), txnReferenceId: req.txn.txnReferenceId },
      };
      return buildBillPaymentResponseXml(resp);
    }

    // Quick pay: this gateway boundary is per-NPCI-message and stateless across fetch/payment,
    // so we don't carry a sandbox `bill_request_id` forward — biller_id + customer + device +
    // biller_data is everything quick pay needs (see the sandbox guide, section 2.1).
    const createBody = {
      biller_id: publicBillerId,
      bill_pay_amount: amount,
      currency: "INR",
      fees: {
        app_convenience_fee: Number(req.amount.couCustConvFee || 0),
        biller_convenience_fee: Number(req.amount.custConvFee || 0),
      },
      payments: [
        { id: req.txn.paymentRefId || "pay_ref_1", amount, currency: "INR", provider: "razorpay", method, [method]: { vpa } },
      ],
      customer: {
        id: req.customer.mobile,
        name: "Customer " + req.customer.mobile.slice(-4),
        mobile: req.customer.mobile,
        email: emailTag || `${req.customer.mobile}@example.com`,
      },
      device: deviceFromTags(req.agent.device.tags),
      biller_data: { account_holder: accountHolderFromTags(req.billDetails.customerParams?.tags) },
    };

    // Sandbox mandates X-Bill-Payments-Idempotency; NPCI's own msgId is unique per
    // outbound message, so it doubles as the idempotency key with no extra state.
    const create = await this.request<{ id?: string; error?: { description?: string } }>(
      "POST",
      "/payments",
      createBody,
      { "X-Bill-Payments-Idempotency": req.txn.msgId }
    );

    if (create.status >= 300 || !create.json.id) {
      const resp: NpciBillPaymentResponse = {
        head: mockHead(refId),
        reason: { responseCode: "808", responseReason: create.json.error?.description || "Sandbox payment create failed" },
        txn: { ts: isoTimestamp(), msgId: generateMsgOrRefId(), txnReferenceId: req.txn.txnReferenceId },
      };
      return buildBillPaymentResponseXml(resp);
    }

    if (req.txn.txnReferenceId) txnRefToSandboxPaymentId.set(req.txn.txnReferenceId, create.json.id);

    const final = await this.pollUntilTerminal<SandboxPayment>(
      `/payments/${create.json.id}`,
      (v) => v.status === "success" || v.status === "failed"
    );

    const resp: NpciBillPaymentResponse =
      final.status === "success"
        ? {
            head: mockHead(refId),
            reason: {
              responseCode: "000",
              responseReason: "Transaction Successful",
              approvalRefNum: (final.data?.paymentChannelRefNum || final.data?.billerReferenceNumber || "").slice(0, 12),
            },
            txn: { ts: isoTimestamp(), msgId: generateMsgOrRefId(), txnReferenceId: req.txn.txnReferenceId },
            billDetails: req.billDetails,
          }
        : {
            head: mockHead(refId),
            reason: {
              responseCode: final.gateway_error_code || "808",
              responseReason: final.error_description || final.error_reason || "Transaction Declined by Biller",
            },
            txn: { ts: isoTimestamp(), msgId: generateMsgOrRefId(), txnReferenceId: req.txn.txnReferenceId },
          };
    return buildBillPaymentResponseXml(resp);
  }

  // ── Complaints (CMS 501 register / 506 status enquiry) ──────────────────

  async sendTxnStatusComplain(signedRequestXml: string): Promise<string> {
    const req = parseTxnStatusComplainReqXml(signedRequestXml);
    const refId = generateMsgOrRefId();

    if (req.txn.xchangeId === "506") {
      if (!req.complaintId) {
        const resp: NpciTxnStatusComplainResp = {
          head: mockHead(refId),
          txn: { ts: isoTimestamp(), msgId: generateMsgOrRefId() },
          responseCode: "001",
          responseReason: "No Complaint Found",
        };
        return buildTxnStatusComplainRespXml(resp);
      }
      // Sandbox status-enquiry doesn't yet surface NPCI-side ASSIGNED/RESOLVED lifecycle state
      // (documented gap) — best-effort map to "Assigned" so polling has a stable open status.
      const enquiry = await this.request<SandboxComplaint>("GET", `/complaints/${req.complaintId}`);
      const found = enquiry.status < 300;
      const resp: NpciTxnStatusComplainResp = {
        head: mockHead(refId),
        txn: { ts: isoTimestamp(), msgId: generateMsgOrRefId() },
        responseCode: found ? "000" : "001",
        responseReason: found ? "Complaint Found" : "No Complaint Found",
        complaintId: req.complaintId,
        complaintStatus: found ? ("Assigned" as NpciComplaintStatus) : undefined,
        openComplaint: found ? "Y" : "N",
        remarks: "Sandbox CMS status enquiry (resolution state not yet surfaced by the sandbox)",
      };
      return buildTxnStatusComplainRespXml(resp);
    }

    // Register Complaint (501). Needs the sandbox's own payment id, which is an
    // implementation detail of *this* client, not something NPCI's txnReferenceId
    // carries — recovered via the map populated in sendBillPayment above.
    const sandboxPaymentId = req.txnReferenceId ? txnRefToSandboxPaymentId.get(req.txnReferenceId) : undefined;
    if (!sandboxPaymentId) {
      const resp: NpciTxnStatusComplainResp = {
        head: mockHead(refId),
        txn: { ts: isoTimestamp(), msgId: generateMsgOrRefId() },
        responseCode: "001",
        responseReason: `No sandbox payment found for txnReferenceId "${req.txnReferenceId}"`,
      };
      return buildTxnStatusComplainRespXml(resp);
    }

    const create = await this.request<SandboxComplaint & { error?: { description?: string; metadata?: { gateway_error_code?: string } } }>(
      "POST",
      "/complaints",
      {
        bill_payment_id: sandboxPaymentId,
        biller_id: SANDBOX_PUBLIC_BILLER_ID.SBOX00000NATDF,
        complaint_type: req.disposition || "Transaction",
        complaint_description: req.description || "Filed via bbps-go",
      }
    );

    let resp: NpciTxnStatusComplainResp;
    if (create.status >= 300 || !create.json.complaint) {
      // Known live-sandbox issue: complaint registration currently 503s even for a normal
      // description (see file header) — surface as a real NPCI-style decline, not a thrown error.
      resp = {
        head: mockHead(refId),
        txn: { ts: isoTimestamp(), msgId: generateMsgOrRefId() },
        responseCode: create.json.error?.metadata?.gateway_error_code || "808",
        responseReason: create.json.error?.description || "Sandbox complaint registration failed",
      };
    } else {
      resp = {
        head: mockHead(refId),
        txn: { ts: isoTimestamp(), msgId: generateMsgOrRefId() },
        responseCode: "000",
        responseReason: "Complaint Registered Successfully",
        complaintId: create.json.complaint.id,
        complaintStatus: "Assigned",
        openComplaint: "Y",
        assigned: "Biller BOU",
        remarks: "Complaint registered via Razorpay BBPS sandbox",
      };
    }
    return buildTxnStatusComplainRespXml(resp);
  }
}

/** txnReferenceId (NPCI-side) -> sandbox payment id, so a later complaint (501) can find it. */
const txnRefToSandboxPaymentId = new Map<string, string>();

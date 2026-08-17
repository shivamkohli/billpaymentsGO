/**
 * Simulates the BBPCU + Biller BBPOU side of every NPCI exchange, entirely
 * in-process. This is what makes the whole flow (bill_request -> payment ->
 * complaint) demoable today with zero real BBPS credentials — wired in by
 * default whenever `BBPS_MODE=mock` (see `src/gateway/index.ts`).
 *
 * Behaviour is deterministic given the same input (hashing customer mobile /
 * txnReferenceId into a small set of outcomes) so the same demo script
 * produces repeatable results, while still exercising both the success and
 * decline paths through the mapping layer.
 */

import { generateComplaintId, generateMsgOrRefId, isoTimestamp } from "../ids/generator";
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
import { NpciBillFetchResponse, NpciBillPaymentResponse, NpciComplaintStatus, NpciTxnStatusComplainResp } from "../types/npci";
import { getBillerById } from "../mapping/billerRegistry";
import { BbpcuClient } from "./BbpcuClient";

const MOCK_ORIG_INST = "NBBL"; // stands in for "the BBPCU/network side" in mock response Heads

function hashToBucket(input: string, buckets: number): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h % buckets;
}

function mockHead(refId: string) {
  return { origInst: MOCK_ORIG_INST, refId, ts: isoTimestamp(), ver: "1.6" };
}

export class MockBbpcuClient implements BbpcuClient {
  async sendBillFetch(signedRequestXml: string): Promise<string> {
    return this.respondToFetchOrValidate(signedRequestXml, "fetch");
  }

  async sendBillValidate(signedRequestXml: string): Promise<string> {
    return this.respondToFetchOrValidate(signedRequestXml, "validate");
  }

  private respondToFetchOrValidate(xml: string, kind: "fetch" | "validate"): string {
    const req = kind === "fetch" ? parseBillFetchRequestXml(xml) : parseBillValidationRequestXml(xml);
    const billerId = req.billDetails.biller.id;
    const biller = getBillerById(billerId);
    const refId = generateMsgOrRefId();

    let resp: NpciBillFetchResponse;
    if (!biller) {
      resp = {
        head: mockHead(refId),
        reason: { responseCode: "003", responseReason: "Invalid Biller" },
        txn: { ts: isoTimestamp(), msgId: generateMsgOrRefId() },
      };
    } else {
      const bucket = hashToBucket(req.customer.mobile + billerId, 20);
      const amountPaise = 5_000 + bucket * 4_137; // deterministic pseudo-bill, in paise
      const dueDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const billDate = new Date(Date.now() - 23 * 86400000).toISOString().slice(0, 10);
      resp = {
        head: mockHead(refId),
        reason: {
          responseCode: "000",
          responseReason: kind === "fetch" ? "Bill Fetched Successfully" : "Customer Validated Successfully",
        },
        txn: { ts: isoTimestamp(), msgId: generateMsgOrRefId() },
        billDetails: req.billDetails,
        billerResponse:
          kind === "fetch"
            ? {
                customerName: "MOCK CUSTOMER " + req.customer.mobile.slice(-4),
                amount: String(amountPaise),
                dueDate,
                billDate,
                billNumber: `MOCKBILL${bucket}`,
                billPeriod: "MONTHLY",
                tags: [{ name: "Amount2", value: String(amountPaise) }],
              }
            : undefined,
      };
    }
    return kind === "fetch" ? buildBillFetchResponseXml(resp) : buildBillValidationResponseXml(resp);
  }

  async sendBillPayment(signedRequestXml: string): Promise<string> {
    const req = parseBillPaymentRequestXml(signedRequestXml);
    const billerId = req.billDetails.biller.id;
    const biller = getBillerById(billerId);
    const refId = generateMsgOrRefId();

    // Demo-friendly decline rule: any payment amount ending in "13" (paise) declines,
    // so a demo/test script can trigger the failure path on demand.
    const declines = !biller || req.amount.amount.endsWith("13");

    const resp: NpciBillPaymentResponse = {
      head: mockHead(refId),
      reason: declines
        ? { responseCode: "808", responseReason: "Transaction Declined by Biller" }
        : { responseCode: "000", responseReason: "Transaction Successful", approvalRefNum: generateMsgOrRefId().slice(0, 12) },
      txn: {
        ts: isoTimestamp(),
        msgId: generateMsgOrRefId(),
        txnReferenceId: req.txn.txnReferenceId,
      },
      billDetails: req.billDetails,
    };
    return buildBillPaymentResponseXml(resp);
  }

  async sendTxnStatusComplain(signedRequestXml: string): Promise<string> {
    const req = parseTxnStatusComplainReqXml(signedRequestXml);
    const refId = generateMsgOrRefId();

    if (req.txn.xchangeId === "506") {
      // Status enquiry: deterministically walk a small state machine keyed off complaintId
      // so repeated polls of the same complaint eventually reach a terminal status.
      const statuses: NpciComplaintStatus[] = ["Assigned", "Escalated", "Resolved"];
      const idx = hashToBucket(req.complaintId || "", statuses.length);
      const resp: NpciTxnStatusComplainResp = {
        head: mockHead(refId),
        txn: { ts: isoTimestamp(), msgId: generateMsgOrRefId() },
        responseCode: req.complaintId ? "000" : "001",
        responseReason: req.complaintId ? "Complaint Found" : "No Complaint Found",
        complaintId: req.complaintId,
        complaintStatus: req.complaintId ? statuses[idx] : undefined,
        openComplaint: req.complaintId && statuses[idx] !== "Resolved" ? "Y" : "N",
        remarks: req.complaintId ? "Mock CMS status enquiry" : undefined,
      };
      return buildTxnStatusComplainRespXml(resp);
    }

    // Register Complaint (501, and treated as default for any other CMS xchangeId).
    const complaintId = generateComplaintId(req.txnReferenceId || "MOCKTXNREF");
    const resp: NpciTxnStatusComplainResp = {
      head: mockHead(refId),
      txn: { ts: isoTimestamp(), msgId: generateMsgOrRefId() },
      responseCode: "000",
      responseReason: "Complaint Registered Successfully",
      complaintId,
      complaintStatus: "Assigned",
      openComplaint: "Y",
      assigned: "Biller BOU",
      remarks: "Complaint registered with mock CMS",
    };
    return buildTxnStatusComplainRespXml(resp);
  }
}

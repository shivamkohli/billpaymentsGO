/**
 * Orchestrates `POST /v1/bill_payments/complaints` (CMS Register Complaint,
 * xchangeId 501) and refreshes status on `GET .../complaints/{id}` (CMS
 * Status Enquiry, xchangeId 506). Resolves the NPCI `txnReferenceId` and
 * customer mobile it needs purely from `input.bill_payment_id` via
 * `paymentService` — the merchant never has to know or pass NPCI ids.
 */

import { buildTxnStatusComplainReqXml } from "../xml/builder";
import { parseTxnStatusComplainRespXml } from "../xml/parser";
import { getSigner } from "../xml/signer";
import { getCredentialsProvider } from "../config/credentials";
import { getBbpcuClient } from "../gateway";
import {
  complaintInputToNpciRequest,
  complaintStatusEnquiryRequest,
  npciResponseToComplaintResource,
} from "../mapping/complaint.mapper";
import { gatewayErrorFromException } from "../mapping/common";
import { generateEntityId } from "../ids/generator";
import { MemoryStore } from "../store/memoryStore";
import { ComplaintCreateInput, ComplaintResource } from "../types/merchant";
import { getPayment, getPaymentTxnReferenceId } from "./paymentService";

const store = new MemoryStore<ComplaintResource>();

function resolveSigner() {
  const creds = getCredentialsProvider().getBbpsCredentials();
  return getSigner(creds?.signingCertPath, creds?.signingKeyPath);
}

function failedResource(id: string, createdAt: number, error: ComplaintResource["error"]): ComplaintResource {
  return { id, entity: "bill_payment.complaint", status: "failed", created_at: createdAt, error };
}

export async function createComplaint(input: ComplaintCreateInput): Promise<ComplaintResource> {
  const id = generateEntityId("complaint");
  const createdAt = Date.now();

  const payment = getPayment(input.bill_payment_id);
  const txnReferenceId = getPaymentTxnReferenceId(input.bill_payment_id);
  if (!payment || !txnReferenceId) {
    const resource = failedResource(id, createdAt, {
      code: "BBPS_PAYMENT_NOT_FOUND",
      description: `No payment found for bill_payment_id "${input.bill_payment_id}"`,
      source: "business",
      step: "complaint",
      reason: "PAYMENT_NOT_FOUND",
    });
    store.set(id, resource);
    return resource;
  }

  const npciReq = complaintInputToNpciRequest(input, txnReferenceId, payment.customer?.mobile);
  const requestXml = buildTxnStatusComplainReqXml(npciReq);
  const signedXml = resolveSigner().sign(requestXml);

  let resource: ComplaintResource;
  try {
    const client = getBbpcuClient();
    const responseXml = await client.sendTxnStatusComplain(signedXml);
    const npciResp = parseTxnStatusComplainRespXml(responseXml);
    resource = npciResponseToComplaintResource(id, npciResp, createdAt);
  } catch (err) {
    resource = failedResource(id, createdAt, gatewayErrorFromException(err, "complaint"));
  }
  store.set(id, resource);
  return resource;
}

/** Called from the GET route so polling a complaint reflects the latest CMS status, not just the registration snapshot. */
export async function refreshComplaintStatus(id: string): Promise<ComplaintResource | undefined> {
  const existing = store.get(id);
  if (!existing || !existing.gateway_complaint_id) return existing;

  const npciReq = complaintStatusEnquiryRequest(existing.gateway_complaint_id);
  const requestXml = buildTxnStatusComplainReqXml(npciReq);
  const signedXml = resolveSigner().sign(requestXml);

  try {
    const client = getBbpcuClient();
    const responseXml = await client.sendTxnStatusComplain(signedXml);
    const npciResp = parseTxnStatusComplainRespXml(responseXml);
    const updated = npciResponseToComplaintResource(id, npciResp, existing.created_at);
    store.set(id, updated);
    return updated;
  } catch {
    return existing; // status enquiry failures shouldn't clobber the last-known-good status
  }
}

export function getComplaint(id: string): ComplaintResource | undefined {
  return store.get(id);
}

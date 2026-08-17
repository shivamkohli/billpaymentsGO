/**
 * Merchant `complaint` (bill_payment.complaint) <-> NPCI CMS messages
 * (<TxnStatusComplainRequest>/<TxnStatusComplainResponse>).
 *
 * NPCI's CMS xchangeId band covers several distinct operations that the
 * merchant-facing API collapses into one `complaint` resource:
 *   501 = Register Complaint      (POST /v1/bill_payments/complaints)
 *   506 = Complaint Status Enquiry (GET  /v1/bill_payments/complaints/{id})
 *   401/502/503/507/508 = other CMS lifecycle ops (escalate, reply, close, ...)
 *   we don't expose those individually yet — the orchestration layer only
 *   drives 501 and 506 for now.
 */

import { isoTimestamp } from "../ids/generator";
import { NpciComplaintStatus, NpciTxnStatusComplainReq, NpciTxnStatusComplainResp } from "../types/npci";
import { ComplaintCreateInput, ComplaintResource, GatewayComplaintStatus } from "../types/merchant";
import { buildOutboundHead, isSuccessReason, mapNpciReasonToMerchantError, newMsgId } from "./common";

const COMPLAINT_STATUS_MAP: Record<NpciComplaintStatus, GatewayComplaintStatus> = {
  Assigned: "assigned",
  Escalated: "escalated",
  "Re Assigned": "re_assigned",
  "Assigned to COU": "assigned_to_cou",
  "Assigned to BOU": "assigned_to_bou",
  "Assigned to OU": "assigned_to_bou",
  Resolved: "resolved",
  Unresolved: "unresolved",
};

const TERMINAL_STATUSES: readonly GatewayComplaintStatus[] = ["resolved", "unresolved"];

/**
 * merchant `POST /v1/bill_payments/complaints` input -> NPCI CMS Register
 * Complaint request (xchangeId 501). `txnReferenceId` and `mobile` are
 * resolved by `orchestration/complaintService.ts` by looking up
 * `input.bill_payment_id` in the payment store — the merchant API never
 * asks the caller for NPCI-internal identifiers directly.
 */
export function complaintInputToNpciRequest(
  input: ComplaintCreateInput,
  txnReferenceId: string,
  mobile?: string
): NpciTxnStatusComplainReq {
  return {
    head: buildOutboundHead(),
    txn: { ts: isoTimestamp(), msgId: newMsgId(), xchangeId: "501" },
    complaintType: "Transaction",
    mobile,
    txnReferenceId,
    disposition: input.complaint_type,
    description: input.complaint_description,
  };
}

/** merchant `GET /v1/bill_payments/complaints/{id}` -> NPCI CMS Status Enquiry (xchangeId 506). */
export function complaintStatusEnquiryRequest(
  complaintId: string,
  mobile?: string
): NpciTxnStatusComplainReq {
  return {
    head: buildOutboundHead(),
    txn: { ts: isoTimestamp(), msgId: newMsgId(), xchangeId: "506" },
    complaintType: "Transaction",
    mobile,
    complaintId,
  };
}

/**
 * NPCI TxnStatusComplainResponse -> merchant `bill_payment.complaint`
 * resource. `status` here tracks Razorpay's own async-processing state
 * machine (processing/success/failed), which is distinct from
 * `gateway_complaint_status` (BBPCU/BOU's CMS lifecycle state):
 *   - the wire call itself failing (bad responseCode)        -> "failed"
 *   - wire call ok, CMS status is Resolved/Unresolved         -> "success" (terminal)
 *   - wire call ok, CMS status still open (Assigned/Escalated) -> "processing"
 */
export function npciResponseToComplaintResource(
  complaintResourceId: string,
  resp: NpciTxnStatusComplainResp,
  createdAt: number
): ComplaintResource {
  const wireOk = isSuccessReason({ responseCode: resp.responseCode, responseReason: resp.responseReason });
  const gatewayStatus: GatewayComplaintStatus | undefined = resp.complaintStatus
    ? COMPLAINT_STATUS_MAP[resp.complaintStatus]
    : undefined;

  let status: ComplaintResource["status"];
  if (!wireOk) status = "failed";
  else if (gatewayStatus && TERMINAL_STATUSES.includes(gatewayStatus)) status = "success";
  else status = "processing";

  return {
    id: complaintResourceId,
    entity: "bill_payment.complaint",
    status,
    gateway_complaint_id: resp.complaintId,
    gateway_complaint_status: gatewayStatus,
    biller_remarks: resp.remarks,
    created_at: createdAt,
    updated_at: Date.now(),
    error: wireOk
      ? undefined
      : mapNpciReasonToMerchantError(
          { responseCode: resp.responseCode, responseReason: resp.responseReason },
          "complaint"
        ),
  };
}

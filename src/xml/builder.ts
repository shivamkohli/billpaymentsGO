import { XMLBuilder } from "fast-xml-parser";
import {
  NpciAgent,
  NpciAmount,
  NpciBillDetails,
  NpciBillerResponse,
  NpciBillFetchRequest,
  NpciBillFetchResponse,
  NpciBillPaymentRequest,
  NpciBillPaymentResponse,
  NpciCustomer,
  NpciPaymentInformation,
  NpciPaymentMethod,
  NpciReason,
  NpciTag,
  NpciTxn,
  NpciTxnStatusComplainReq,
  NpciTxnStatusComplainResp,
} from "../types/npci";

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  format: true,
  suppressEmptyNode: true,
});

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n';

function tagArray(tags?: NpciTag[]) {
  if (!tags || tags.length === 0) return undefined;
  return { Tag: tags.map((t) => ({ "@_name": t.name, "@_value": t.value })) };
}

function headBlock(head: NpciBillFetchRequest["head"]) {
  return {
    "@_origInst": head.origInst,
    "@_refId": head.refId,
    "@_ts": head.ts,
    "@_ver": head.ver,
  };
}

function txnBlock(txn: NpciTxn) {
  return {
    "@_ts": txn.ts,
    "@_msgId": txn.msgId,
    ...(txn.txnReferenceId ? { "@_txnReferenceId": txn.txnReferenceId } : {}),
    ...(txn.paymentRefId ? { "@_paymentRefId": txn.paymentRefId } : {}),
    ...(txn.directBillChannel ? { "@_directBillChannel": txn.directBillChannel } : {}),
    ...(txn.directBillContentId ? { "@_directBillContentId": txn.directBillContentId } : {}),
    ...(txn.siTxn ? { "@_siTxn": txn.siTxn } : {}),
    ...(txn.origRefId ? { "@_origRefId": txn.origRefId } : {}),
    ...(txn.type ? { "@_type": txn.type } : {}),
    ...(txn.xchangeId ? { "@_xchangeId": txn.xchangeId } : {}),
    ...(txn.riskScores && txn.riskScores.length > 0
      ? {
          RiskScores: {
            Score: txn.riskScores.map((s) => ({
              "@_provider": s.provider,
              "@_type": s.type,
              "@_value": s.value,
            })),
          },
        }
      : {}),
  };
}

function customerBlock(customer: NpciCustomer) {
  return {
    "@_mobile": customer.mobile,
    ...(tagArray(customer.tags) || {}),
  };
}

function agentBlock(agent: NpciAgent) {
  return {
    "@_id": agent.id,
    Device: { ...(tagArray(agent.device.tags) || {}) },
  };
}

function billDetailsBlock(billDetails: NpciBillDetails) {
  return {
    Biller: { "@_id": billDetails.biller.id },
    ...(billDetails.customerParams
      ? { CustomerParams: { ...(tagArray(billDetails.customerParams.tags) || {}) } }
      : {}),
  };
}

function paymentMethodBlock(pm: NpciPaymentMethod) {
  return {
    "@_quickPay": pm.quickPay,
    "@_splitPay": pm.splitPay,
    ...(pm.offUsPay ? { "@_OFFUSPay": pm.offUsPay } : {}),
    "@_paymentMode": pm.paymentMode,
  };
}

function amountBlock(amount: NpciAmount) {
  return {
    Amt: {
      "@_amount": amount.amount,
      "@_custConvFee": amount.custConvFee,
      ...(amount.couCustConvFee ? { "@_COUcustConvFee": amount.couCustConvFee } : {}),
      "@_currency": amount.currency,
    },
    ...(amount.splitPayAmount ? { SplitPayAmount: amount.splitPayAmount } : {}),
    ...(amount.tags && amount.tags.length > 0 ? { Tag: tagArray(amount.tags)!.Tag } : {}),
  };
}

function paymentInformationBlock(pi?: NpciPaymentInformation) {
  if (!pi) return undefined;
  return { ...(tagArray(pi.tags) || {}) };
}

export function buildBillFetchRequestXml(req: NpciBillFetchRequest): string {
  const body: Record<string, unknown> = {
    "ns2:BillFetchRequest": {
      "@_xmlns:ns2": "http://bbps.org/schema",
      Head: headBlock(req.head),
      ...(req.analytics ? { Analytics: { ...(tagArray(req.analytics.tags) || {}) } } : {}),
      Txn: txnBlock(req.txn),
      Customer: customerBlock(req.customer),
      Agent: agentBlock(req.agent),
      BillDetails: billDetailsBlock(req.billDetails),
    },
  };
  return XML_DECLARATION + builder.build(body);
}

export function buildBillValidationRequestXml(req: NpciBillFetchRequest): string {
  const xml = buildBillFetchRequestXml(req);
  return xml
    .replace("ns2:BillFetchRequest", "ns2:BillValidationRequest")
    .replace(/BillFetchRequest>$/m, "BillValidationRequest>");
}

export function buildBillPaymentRequestXml(req: NpciBillPaymentRequest): string {
  const body: Record<string, unknown> = {
    "ns2:BillPaymentRequest": {
      "@_xmlns:ns2": "http://bbps.org/schema",
      Head: headBlock(req.head),
      ...(req.analytics ? { Analytics: { ...(tagArray(req.analytics.tags) || {}) } } : {}),
      Txn: txnBlock(req.txn),
      Customer: customerBlock(req.customer),
      Agent: agentBlock(req.agent),
      BillDetails: billDetailsBlock(req.billDetails),
      PaymentMethod: paymentMethodBlock(req.paymentMethod),
      Amount: amountBlock(req.amount),
      ...(req.paymentInformation
        ? { PaymentInformation: paymentInformationBlock(req.paymentInformation) }
        : {}),
    },
  };
  return XML_DECLARATION + builder.build(body);
}

function reasonBlock(reason: NpciReason) {
  return {
    "@_approvalRefNum": reason.approvalRefNum ?? "",
    "@_responseCode": reason.responseCode,
    "@_responseReason": reason.responseReason,
    "@_complianceRespCd": reason.complianceRespCd ?? "",
    "@_complianceReason": reason.complianceReason ?? "",
  };
}

function billerResponseBlock(br?: NpciBillerResponse) {
  if (!br) return undefined;
  return {
    "@_customerName": br.customerName ?? "NA",
    "@_amount": br.amount ?? "0",
    "@_dueDate": br.dueDate ?? "9999-01-01",
    "@_billDate": br.billDate ?? "0001-01-01",
    "@_billNumber": br.billNumber ?? "NA",
    "@_billPeriod": br.billPeriod ?? "NA",
    ...(br.custConvFee ? { "@_custConvFee": br.custConvFee } : {}),
    ...(tagArray(br.tags) || {}),
  };
}

/** Used by MockBbpcuClient (and, eventually, the real BBPCU response path) to serialize an NPCI response. */
export function buildBillFetchResponseXml(resp: NpciBillFetchResponse): string {
  const body: Record<string, unknown> = {
    "ns2:BillFetchResponse": {
      "@_xmlns:ns2": "http://bbps.org/schema",
      Head: headBlock(resp.head),
      Reason: reasonBlock(resp.reason),
      Txn: { "@_ts": resp.txn.ts, "@_msgId": resp.txn.msgId },
      ...(resp.billDetails ? { BillDetails: billDetailsBlock(resp.billDetails) } : {}),
      ...(resp.billerResponse ? { BillerResponse: billerResponseBlock(resp.billerResponse) } : {}),
      ...(resp.additionalInfo
        ? { AdditionalInfo: { ...(tagArray(resp.additionalInfo.tags) || {}) } }
        : {}),
    },
  };
  return XML_DECLARATION + builder.build(body);
}

export function buildBillValidationResponseXml(resp: NpciBillFetchResponse): string {
  const xml = buildBillFetchResponseXml(resp);
  return xml
    .replace("ns2:BillFetchResponse", "ns2:BillValidationResponse")
    .replace(/BillFetchResponse>$/m, "BillValidationResponse>");
}

export function buildBillPaymentResponseXml(resp: NpciBillPaymentResponse): string {
  const body: Record<string, unknown> = {
    "ns2:BillPaymentResponse": {
      "@_xmlns:ns2": "http://bbps.org/schema",
      Head: headBlock(resp.head),
      Reason: reasonBlock(resp.reason),
      Txn: {
        "@_ts": resp.txn.ts,
        "@_msgId": resp.txn.msgId,
        ...(resp.txn.txnReferenceId ? { "@_txnReferenceId": resp.txn.txnReferenceId } : {}),
      },
      ...(resp.billDetails ? { BillDetails: billDetailsBlock(resp.billDetails) } : {}),
      ...(resp.billerResponse ? { BillerResponse: billerResponseBlock(resp.billerResponse) } : {}),
      ...(resp.additionalInfo
        ? { AdditionalInfo: { ...(tagArray(resp.additionalInfo.tags) || {}) } }
        : {}),
    },
  };
  return XML_DECLARATION + builder.build(body);
}

export function buildTxnStatusComplainRespXml(resp: NpciTxnStatusComplainResp): string {
  const body: Record<string, unknown> = {
    "ns2:TxnStatusComplainResponse": {
      "@_xmlns:ns2": "http://bbps.org/schema",
      Head: headBlock(resp.head),
      Txn: { "@_ts": resp.txn.ts, "@_msgId": resp.txn.msgId },
      TxnStatusComplainResp: {
        "@_responseCode": resp.responseCode,
        "@_responseReason": resp.responseReason,
        ...(resp.complaintId ? { "@_complaintId": resp.complaintId } : {}),
        ...(resp.assigned ? { "@_assigned": resp.assigned } : {}),
        ...(resp.openComplaint ? { "@_openComplaint": resp.openComplaint } : {}),
        ...(resp.complaintStatus ? { "@_complaintStatus": resp.complaintStatus } : {}),
        ...(resp.remarks ? { "@_remarks": resp.remarks } : {}),
      },
    },
  };
  return XML_DECLARATION + builder.build(body);
}

export function buildTxnStatusComplainReqXml(req: NpciTxnStatusComplainReq): string {
  const body: Record<string, unknown> = {
    "ns2:TxnStatusComplainRequest": {
      "@_xmlns:ns2": "http://bbps.org/schema",
      Head: headBlock(req.head),
      Txn: {
        "@_ts": req.txn.ts,
        "@_msgId": req.txn.msgId,
        ...(req.txn.xchangeId ? { "@_xchangeId": req.txn.xchangeId } : {}),
      },
      TxnStatusComplainReq: {
        "@_complaintType": req.complaintType,
        ...(req.mobile ? { "@_mobile": req.mobile } : {}),
        ...(req.txnReferenceId ? { "@_txnReferenceId": req.txnReferenceId } : {}),
        ...(req.complaintId ? { "@_complaintId": req.complaintId } : {}),
        ...(req.disposition ? { "@_disposition": req.disposition } : {}),
        ...(req.description ? { "@_description": req.description } : {}),
        ...(req.txnSearchDateCriteria
          ? {
              TxnSearchDateCriteria: {
                ...(req.txnSearchDateCriteria.fromDate
                  ? { "@_fromDate": req.txnSearchDateCriteria.fromDate }
                  : {}),
                ...(req.txnSearchDateCriteria.toDate
                  ? { "@_toDate": req.txnSearchDateCriteria.toDate }
                  : {}),
              },
            }
          : {}),
      },
    },
  };
  return XML_DECLARATION + builder.build(body);
}

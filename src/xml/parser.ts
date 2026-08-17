import { XMLParser } from "fast-xml-parser";
import {
  NpciAgent,
  NpciAmount,
  NpciBillDetails,
  NpciBillFetchRequest,
  NpciBillFetchResponse,
  NpciBillPaymentRequest,
  NpciBillPaymentResponse,
  NpciCustomer,
  NpciPaymentMethod,
  NpciReason,
  NpciTag,
  NpciTxn,
  NpciTxnStatusComplainReq,
  NpciTxnStatusComplainResp,
} from "../types/npci";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function tagsFrom(node: any): NpciTag[] {
  if (!node) return [];
  return asArray(node.Tag).map((t: any) => ({ name: t["@_name"], value: t["@_value"] }));
}

function parseHead(node: any) {
  return {
    origInst: node["@_origInst"],
    refId: node["@_refId"],
    ts: node["@_ts"],
    ver: node["@_ver"],
  };
}

function parseTxn(node: any): NpciTxn {
  const riskScores = node.RiskScores
    ? asArray(node.RiskScores.Score).map((s: any) => ({
        provider: s["@_provider"],
        type: s["@_type"],
        value: s["@_value"],
      }))
    : undefined;
  return {
    ts: node["@_ts"],
    msgId: node["@_msgId"],
    txnReferenceId: node["@_txnReferenceId"],
    paymentRefId: node["@_paymentRefId"],
    directBillChannel: node["@_directBillChannel"],
    directBillContentId: node["@_directBillContentId"],
    siTxn: node["@_siTxn"],
    origRefId: node["@_origRefId"],
    type: node["@_type"],
    xchangeId: node["@_xchangeId"],
    riskScores,
  };
}

function parseCustomer(node: any): NpciCustomer {
  return { mobile: node["@_mobile"], tags: tagsFrom(node) };
}

function parseAgent(node: any): NpciAgent {
  return {
    id: node["@_id"],
    device: { tags: tagsFrom(node.Device) },
  };
}

function parseBillDetails(node: any): NpciBillDetails {
  return {
    biller: { id: node.Biller["@_id"] },
    customerParams: node.CustomerParams ? { tags: tagsFrom(node.CustomerParams) } : undefined,
  };
}

function parseReason(node: any): NpciReason {
  return {
    approvalRefNum: node["@_approvalRefNum"],
    responseCode: node["@_responseCode"],
    responseReason: node["@_responseReason"],
    complianceRespCd: node["@_complianceRespCd"] || undefined,
    complianceReason: node["@_complianceReason"] || undefined,
  };
}

function parseBillerResponse(node: any) {
  if (!node) return undefined;
  return {
    customerName: node["@_customerName"],
    amount: node["@_amount"],
    dueDate: node["@_dueDate"],
    billDate: node["@_billDate"],
    billNumber: node["@_billNumber"],
    billPeriod: node["@_billPeriod"],
    custConvFee: node["@_custConvFee"],
    tags: tagsFrom(node),
  };
}

function parseAdditionalInfo(node: any) {
  if (!node) return undefined;
  return { tags: tagsFrom(node) };
}

export function parseBillFetchRequestXml(xml: string): NpciBillFetchRequest {
  const doc = parser.parse(xml);
  const root = doc.BillFetchRequest || doc.BillValidationRequest;
  return {
    head: parseHead(root.Head),
    analytics: root.Analytics ? { tags: tagsFrom(root.Analytics) } : undefined,
    txn: parseTxn(root.Txn),
    customer: parseCustomer(root.Customer),
    agent: parseAgent(root.Agent),
    billDetails: parseBillDetails(root.BillDetails),
  };
}

export const parseBillValidationRequestXml = parseBillFetchRequestXml;

export function parseBillFetchResponseXml(xml: string): NpciBillFetchResponse {
  const doc = parser.parse(xml);
  const root = doc.BillFetchResponse || doc.BillValidationResponse;
  return {
    head: parseHead(root.Head),
    reason: parseReason(root.Reason),
    txn: { ts: root.Txn["@_ts"], msgId: root.Txn["@_msgId"] },
    billDetails: root.BillDetails ? parseBillDetails(root.BillDetails) : undefined,
    billerResponse: parseBillerResponse(root.BillerResponse),
    additionalInfo: parseAdditionalInfo(root.AdditionalInfo),
  };
}

export const parseBillValidationResponseXml = parseBillFetchResponseXml;

function parsePaymentMethod(node: any): NpciPaymentMethod {
  return {
    quickPay: node["@_quickPay"],
    splitPay: node["@_splitPay"],
    offUsPay: node["@_OFFUSPay"],
    paymentMode: node["@_paymentMode"],
  };
}

function parseAmount(node: any): NpciAmount {
  return {
    amount: node.Amt["@_amount"],
    custConvFee: node.Amt["@_custConvFee"],
    couCustConvFee: node.Amt["@_COUcustConvFee"],
    currency: node.Amt["@_currency"],
    splitPayAmount: node.SplitPayAmount,
    tags: tagsFrom(node),
  };
}

export function parseBillPaymentRequestXml(xml: string): NpciBillPaymentRequest {
  const doc = parser.parse(xml);
  const root = doc.BillPaymentRequest;
  return {
    head: parseHead(root.Head),
    analytics: root.Analytics ? { tags: tagsFrom(root.Analytics) } : undefined,
    txn: parseTxn(root.Txn),
    customer: parseCustomer(root.Customer),
    agent: parseAgent(root.Agent),
    billDetails: parseBillDetails(root.BillDetails),
    paymentMethod: parsePaymentMethod(root.PaymentMethod),
    amount: parseAmount(root.Amount),
  };
}

export function parseBillPaymentResponseXml(xml: string): NpciBillPaymentResponse {
  const doc = parser.parse(xml);
  const root = doc.BillPaymentResponse;
  return {
    head: parseHead(root.Head),
    reason: parseReason(root.Reason),
    txn: {
      ts: root.Txn["@_ts"],
      msgId: root.Txn["@_msgId"],
      txnReferenceId: root.Txn["@_txnReferenceId"],
    },
    billDetails: root.BillDetails ? parseBillDetails(root.BillDetails) : undefined,
    billerResponse: parseBillerResponse(root.BillerResponse),
    additionalInfo: parseAdditionalInfo(root.AdditionalInfo),
  };
}

export function parseTxnStatusComplainReqXml(xml: string): NpciTxnStatusComplainReq {
  const doc = parser.parse(xml);
  const root = doc.TxnStatusComplainRequest;
  const req = root.TxnStatusComplainReq;
  return {
    head: parseHead(root.Head),
    txn: {
      ts: root.Txn["@_ts"],
      msgId: root.Txn["@_msgId"],
      xchangeId: root.Txn["@_xchangeId"],
    },
    complaintType: req["@_complaintType"],
    mobile: req["@_mobile"],
    txnReferenceId: req["@_txnReferenceId"],
    complaintId: req["@_complaintId"],
    disposition: req["@_disposition"],
    description: req["@_description"],
    txnSearchDateCriteria: req.TxnSearchDateCriteria
      ? {
          fromDate: req.TxnSearchDateCriteria["@_fromDate"],
          toDate: req.TxnSearchDateCriteria["@_toDate"],
        }
      : undefined,
  };
}

export function parseTxnStatusComplainRespXml(xml: string): NpciTxnStatusComplainResp {
  const doc = parser.parse(xml);
  const root = doc.TxnStatusComplainResponse;
  const resp = root.TxnStatusComplainResp;
  return {
    head: parseHead(root.Head),
    txn: { ts: root.Txn["@_ts"], msgId: root.Txn["@_msgId"] },
    responseCode: resp["@_responseCode"],
    responseReason: resp["@_responseReason"],
    complaintId: resp["@_complaintId"],
    assigned: resp["@_assigned"],
    openComplaint: resp["@_openComplaint"],
    complaintStatus: resp["@_complaintStatus"],
    remarks: resp["@_remarks"],
  };
}

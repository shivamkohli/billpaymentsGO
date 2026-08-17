/**
 * Merchant `bill_request` (bill_payment.bill_request) <-> NPCI
 * BillFetchRequest/BillValidationRequest + BillFetchResponse/
 * BillValidationResponse.
 *
 * `decideBillRequestKind()` (billerRegistry.ts) picks which NPCI message
 * pair to use per biller; the actual XML tag names only differ
 * (`BillFetchRequest` vs `BillValidationRequest`) — the field-level mapping
 * below is identical, which is why NpciBillValidationRequest/Response are
 * just type aliases of the Fetch ones (see types/npci.ts).
 */

import { generateAgentId, CHANNEL_CODE_IN_AGENT_ID, isoTimestamp } from "../ids/generator";
import {
  NpciAgent,
  NpciBillDetails,
  NpciBillFetchRequest,
  NpciBillFetchResponse,
  NpciCustomer,
  NpciTag,
} from "../types/npci";
import {
  BillPeriod,
  BillRequestCreateInput,
  BillRequestResource,
  MerchantAccountHolder,
  MerchantAmountDetails,
  MerchantBill,
  MerchantDevice,
} from "../types/merchant";
import { buildOutboundHead, isSuccessReason, mapNpciReasonToMerchantError, newMsgId, resolveOrigInstAndBbpou } from "./common";
import { BillRequestKind } from "./billerRegistry";

const VALID_BILL_PERIODS: readonly BillPeriod[] = [
  "ONETIME",
  "DAILY",
  "WEEKLY",
  "BIMONTHLY",
  "MONTHLY",
  "QUARTERLY",
  "HALFYEARLY",
  "YEARLY",
  "ASPRESENTED",
  "NA",
];

function normalizeBillPeriod(raw?: string): BillPeriod {
  const upper = (raw || "").toUpperCase();
  return (VALID_BILL_PERIODS as readonly string[]).includes(upper) ? (upper as BillPeriod) : "NA";
}

function buildCustomerBlock(customer: BillRequestCreateInput["customer"]): NpciCustomer {
  const tags: NpciTag[] = [];
  if (customer.email) tags.push({ name: "EMAIL", value: customer.email });
  return { mobile: customer.mobile, tags };
}

function deviceTags(device: MerchantDevice): NpciTag[] {
  const tags: NpciTag[] = [{ name: "INITIATING_CHANNEL", value: device.initiating_channel }];
  const optional: [string, string | undefined][] = [
    ["MOBILE", device.mobile],
    ["GEOCODE", device.geocode],
    ["POSTAL_CODE", device.postal_code],
    ["IP", device.ip],
    ["TERMINAL_ID", device.terminal_id],
    ["IMEI", device.imei],
    ["IFSC", device.ifsc],
    ["MAC", device.mac],
    ["OS", device.os],
    ["APP", device.app],
  ];
  for (const [name, value] of optional) {
    if (value) tags.push({ name, value });
  }
  return tags;
}

export function buildAgentBlock(device: MerchantDevice): NpciAgent {
  const { bbpouId } = resolveOrigInstAndBbpou();
  const channelCode = CHANNEL_CODE_IN_AGENT_ID[device.initiating_channel] || "MOB";
  return {
    id: generateAgentId(bbpouId, bbpouId, channelCode),
    device: { tags: deviceTags(device) },
  };
}

function accountHolderTags(accountHolder?: MerchantAccountHolder): NpciTag[] {
  if (!accountHolder) return [];
  return Object.entries(accountHolder)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ({ name, value: String(value) }));
}

export function buildBillDetailsBlock(
  billerId: string,
  accountHolder?: MerchantAccountHolder
): NpciBillDetails {
  const tags = accountHolderTags(accountHolder);
  return {
    biller: { id: billerId },
    customerParams: tags.length > 0 ? { tags } : undefined,
  };
}

/**
 * merchant `POST /v1/bill_payments/bill_requests` input -> NPCI
 * BillFetchRequest/BillValidationRequest domain object. `kind` only affects
 * which builder in `xml/builder.ts` the gateway client calls, not this
 * object's shape.
 */
export function billRequestInputToNpciRequest(
  input: BillRequestCreateInput,
  _kind: BillRequestKind
): NpciBillFetchRequest {
  const billerId = input.gateway_biller_id || input.biller_id;
  return {
    head: buildOutboundHead(),
    txn: { ts: isoTimestamp(), msgId: newMsgId(), type: "FORWARD TYPE REQUEST" },
    customer: buildCustomerBlock(input.customer),
    agent: buildAgentBlock(input.device),
    billDetails: buildBillDetailsBlock(billerId, input.biller_data?.account_holder),
  };
}

function billerResponseToMerchantBill(resp: NpciBillFetchResponse): MerchantBill | undefined {
  const br = resp.billerResponse;
  if (!br) return undefined;
  const amountDetails: MerchantAmountDetails = {};
  for (const tag of br.tags || []) {
    if (tag.name === "Amount1") amountDetails.min_amount_due = Number(tag.value);
    if (tag.name === "Amount2") amountDetails.current_outstanding_amount = Number(tag.value);
  }
  return {
    bill_number: br.billNumber || "NA",
    amount: Number(br.amount || "0"),
    currency: "INR",
    bill_date: br.billDate,
    due_date: br.dueDate,
    bill_period: normalizeBillPeriod(br.billPeriod),
    amount_details: Object.keys(amountDetails).length > 0 ? amountDetails : undefined,
  };
}

/**
 * NPCI BillFetchResponse/BillValidationResponse -> merchant
 * `bill_payment.bill_request` resource. `billRequestId` / `createdAt` come
 * from the orchestration layer (`orchestration/billRequestService.ts`),
 * which owns entity-id generation and the in-memory store.
 */
export function npciResponseToBillRequestResource(
  billRequestId: string,
  input: BillRequestCreateInput,
  resp: NpciBillFetchResponse,
  createdAt: number
): BillRequestResource {
  const success = isSuccessReason(resp.reason);
  const bill = billerResponseToMerchantBill(resp);
  return {
    id: billRequestId,
    entity: "bill_payment.bill_request",
    status: success ? "success" : "failed",
    customer: input.customer,
    biller_id: input.biller_id,
    gateway_biller_id: input.gateway_biller_id,
    gateway: "bbps",
    created_at: createdAt,
    updated_at: Date.now(),
    account_holder: input.biller_data?.account_holder,
    bills: bill ? [bill] : [],
    error: success ? undefined : mapNpciReasonToMerchantError(resp.reason, "bill_fetch"),
  };
}

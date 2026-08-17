/**
 * Merchant `payment` (bill_payment.payment) <-> NPCI BillPaymentRequest /
 * BillPaymentResponse.
 */

import { isoTimestamp } from "../ids/generator";
import {
  NpciAmount,
  NpciBillPaymentRequest,
  NpciBillPaymentResponse,
  NpciPaymentInformation,
  NpciPaymentMethod,
  NpciPaymentMode,
  NpciTag,
} from "../types/npci";
import { MerchantPaymentLeg, PaymentCreateInput, PaymentResource } from "../types/merchant";
import { buildAgentBlock, buildBillDetailsBlock } from "./billRequest.mapper";
import {
  buildOutboundHead,
  isSuccessReason,
  mapNpciReasonToMerchantError,
  newMsgId,
  newTxnReferenceId,
} from "./common";

/** Merchant `MerchantPaymentLeg.method` -> NPCI <PaymentMethod paymentMode="..."/>. */
const PAYMENT_MODE_MAP: Record<string, NpciPaymentMode> = {
  netbanking: "Internet_Banking",
  upi: "UPI",
  wallet: "Wallet",
  cash: "Cash",
  imps: "IMPS",
  neft: "NEFT",
  aeps: "AEPS",
  bharat_qr: "Bharat_QR",
  ussd: "USSD",
  account_transfer: "Account_Transfer",
};

function resolvePaymentMode(leg: MerchantPaymentLeg): NpciPaymentMode {
  if (leg.method === "card") {
    return leg.card?.type?.toLowerCase() === "credit" ? "Credit_Card" : "Debit_Card";
  }
  return PAYMENT_MODE_MAP[leg.method] || "UPI";
}

function buildPaymentMethodBlock(payments: MerchantPaymentLeg[]): NpciPaymentMethod {
  const primary = payments[0];
  return {
    quickPay: "No", // this mapper is only reached via an existing bill_request; adhoc/quickPay flow is a future mapper
    splitPay: payments.length > 1 ? "Yes" : "No",
    paymentMode: resolvePaymentMode(primary),
  };
}

/**
 * <PaymentInformation> flows Customer BBPOU -> BBPCU only (BBPCU strips it
 * before forwarding to the Biller BBPOU) — this is where card/UPI/account
 * instrument details live, per Section 23.
 */
function buildPaymentInformationBlock(payments: MerchantPaymentLeg[]): NpciPaymentInformation | undefined {
  const tags: NpciTag[] = [];
  for (const leg of payments) {
    if (leg.card) tags.push({ name: "CardNum|AuthCode", value: `${leg.card.last4}|${leg.card.auth_code || ""}` });
    if (leg.upi) tags.push({ name: "VPA", value: leg.upi.vpa });
  }
  return tags.length > 0 ? { tags } : undefined;
}

function buildAmountBlock(input: PaymentCreateInput): NpciAmount {
  return {
    amount: String(input.bill_pay_amount),
    custConvFee: String(input.fees.biller_convenience_fee),
    couCustConvFee: String(input.fees.app_convenience_fee),
    currency: "356", // ISO 4217 numeric for INR
  };
}

/**
 * merchant `POST /v1/bill_payments/payments` input -> NPCI
 * BillPaymentRequest. Requires `device` on the input because <Agent> is
 * mandatory on every NPCI request — the HTTP route layer is responsible for
 * carrying the originating bill_request's device forward if the merchant
 * didn't resend it on the payment call.
 */
export function paymentInputToNpciRequest(input: PaymentCreateInput): NpciBillPaymentRequest {
  const billerId = input.gateway_biller_id || input.biller_id || "";
  const txnReferenceId = newTxnReferenceId();
  return {
    head: buildOutboundHead(),
    txn: {
      ts: isoTimestamp(),
      msgId: newMsgId(),
      txnReferenceId,
      paymentRefId: input.payments[0]?.id,
      type: "FORWARD TYPE REQUEST",
    },
    customer: { mobile: input.customer?.mobile || "", tags: [] },
    agent: buildAgentBlock(input.device || { initiating_channel: "INT" }),
    billDetails: buildBillDetailsBlock(billerId, input.biller_data?.account_holder),
    paymentMethod: buildPaymentMethodBlock(input.payments),
    amount: buildAmountBlock(input),
    paymentInformation: buildPaymentInformationBlock(input.payments),
  };
}

/**
 * NPCI BillPaymentResponse -> merchant `bill_payment.payment` resource.
 * `paymentId` / `createdAt` come from `orchestration/paymentService.ts`.
 */
export function npciResponseToPaymentResource(
  paymentId: string,
  input: PaymentCreateInput,
  resp: NpciBillPaymentResponse,
  createdAt: number
): PaymentResource {
  const success = isSuccessReason(resp.reason);
  return {
    id: paymentId,
    entity: "bill_payment.payment",
    status: success ? "success" : "failed",
    gateway_transaction_id: resp.txn.txnReferenceId,
    biller_transaction_id: resp.reason.approvalRefNum,
    biller_id: input.biller_id,
    gateway_biller_id: input.gateway_biller_id,
    gateway: "bbps",
    bill_pay_amount: input.bill_pay_amount,
    currency: input.currency,
    fees: input.fees,
    customer: input.customer,
    payments: input.payments,
    account_holder: input.biller_data?.account_holder,
    bills: input.bills,
    created_at: createdAt,
    updated_at: Date.now(),
    error: success ? undefined : mapNpciReasonToMerchantError(resp.reason, "bill_payment"),
  };
}

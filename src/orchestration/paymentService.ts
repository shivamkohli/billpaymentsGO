/**
 * Orchestrates `POST/GET /v1/bill_payments/payments`, persisting each
 * payment (Supabase when configured, else in-memory — see
 * src/store/paymentStore.ts) alongside its NPCI `txnReferenceId` (needed
 * later by `complaintService.ts` — the merchant API never asks for
 * NPCI-internal identifiers, only `bill_payment_id`).
 */

import { buildBillPaymentRequestXml } from "../xml/builder";
import { parseBillPaymentResponseXml } from "../xml/parser";
import { getSigner } from "../xml/signer";
import { getCredentialsProvider } from "../config/credentials";
import { getBbpcuClient } from "../gateway";
import { npciResponseToPaymentResource, paymentInputToNpciRequest } from "../mapping/payment.mapper";
import { gatewayErrorFromException } from "../mapping/common";
import { generateEntityId } from "../ids/generator";
import {
  getPaymentById,
  getPaymentTxnReferenceId as getStoredPaymentTxnReferenceId,
  listPaymentsByCustomerMobile,
  savePayment,
} from "../store/paymentStore";
import { getBillRequest } from "./billRequestService";
import { PaymentCreateInput, PaymentResource } from "../types/merchant";

function resolveSigner() {
  const creds = getCredentialsProvider().getBbpsCredentials();
  return getSigner(creds?.signingCertPath, creds?.signingKeyPath);
}

function failedResource(id: string, input: PaymentCreateInput, createdAt: number, error: PaymentResource["error"]): PaymentResource {
  return {
    id,
    entity: "bill_payment.payment",
    status: "failed",
    biller_id: input.biller_id,
    gateway_biller_id: input.gateway_biller_id,
    gateway: "bbps",
    bill_pay_amount: input.bill_pay_amount,
    currency: input.currency,
    fees: input.fees,
    customer: input.customer,
    payments: input.payments,
    bills: input.bills,
    created_at: createdAt,
    error,
  };
}

export async function createPayment(rawInput: PaymentCreateInput): Promise<PaymentResource> {
  const id = generateEntityId("pay");
  const createdAt = Date.now();

  // `customer` is optional on the wire (a partner may not re-send it once
  // they already sent it on the bill_request), but we still need it to
  // record this payment "against the user" — so backfill it from the
  // linked bill_request when the caller didn't pass it explicitly.
  let input = rawInput;
  if (!input.customer) {
    const billRequest = await getBillRequest(input.bill_request_id);
    if (billRequest?.customer) input = { ...input, customer: billRequest.customer };
  }

  const npciReq = paymentInputToNpciRequest(input);
  const requestXml = buildBillPaymentRequestXml(npciReq);
  const signedXml = resolveSigner().sign(requestXml);

  let resource: PaymentResource;
  let txnReferenceId: string | undefined;
  try {
    const client = getBbpcuClient();
    const responseXml = await client.sendBillPayment(signedXml);
    const npciResp = parseBillPaymentResponseXml(responseXml);
    resource = npciResponseToPaymentResource(id, input, npciResp, createdAt);
    txnReferenceId = npciReq.txn.txnReferenceId || undefined;
  } catch (err) {
    resource = failedResource(id, input, createdAt, gatewayErrorFromException(err, "bill_payment"));
  }
  await savePayment(resource, txnReferenceId);
  return resource;
}

export async function getPayment(id: string): Promise<PaymentResource | undefined> {
  return getPaymentById(id);
}

export async function getPaymentTxnReferenceId(id: string): Promise<string | undefined> {
  return getStoredPaymentTxnReferenceId(id);
}

/** Every payment this customer has made — backs GET /v1/bill_payments/payments?customer_mobile=. */
export async function listPaymentsForCustomer(mobile: string): Promise<PaymentResource[]> {
  return listPaymentsByCustomerMobile(mobile);
}

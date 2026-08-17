/**
 * Orchestrates `POST/GET /v1/bill_payments/payments`. Also remembers each
 * payment's NPCI `txnReferenceId` (needed later by `complaintService.ts` —
 * the merchant API never asks for NPCI-internal identifiers, only
 * `bill_payment_id`).
 */

import { buildBillPaymentRequestXml } from "../xml/builder";
import { parseBillPaymentResponseXml } from "../xml/parser";
import { getSigner } from "../xml/signer";
import { getCredentialsProvider } from "../config/credentials";
import { getBbpcuClient } from "../gateway";
import { npciResponseToPaymentResource, paymentInputToNpciRequest } from "../mapping/payment.mapper";
import { gatewayErrorFromException } from "../mapping/common";
import { generateEntityId } from "../ids/generator";
import { MemoryStore } from "../store/memoryStore";
import { PaymentCreateInput, PaymentResource } from "../types/merchant";

const store = new MemoryStore<PaymentResource>();
/** txnReferenceId is what a CMS complaint (xchangeId 501) is filed against — kept alongside the payment. */
const txnReferenceIndex = new Map<string, string>();

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

export async function createPayment(input: PaymentCreateInput): Promise<PaymentResource> {
  const id = generateEntityId("pay");
  const createdAt = Date.now();

  const npciReq = paymentInputToNpciRequest(input);
  const requestXml = buildBillPaymentRequestXml(npciReq);
  const signedXml = resolveSigner().sign(requestXml);

  let resource: PaymentResource;
  try {
    const client = getBbpcuClient();
    const responseXml = await client.sendBillPayment(signedXml);
    const npciResp = parseBillPaymentResponseXml(responseXml);
    resource = npciResponseToPaymentResource(id, input, npciResp, createdAt);
    if (npciReq.txn.txnReferenceId) txnReferenceIndex.set(id, npciReq.txn.txnReferenceId);
  } catch (err) {
    resource = failedResource(id, input, createdAt, gatewayErrorFromException(err, "bill_payment"));
  }
  store.set(id, resource);
  return resource;
}

export function getPayment(id: string): PaymentResource | undefined {
  return store.get(id);
}

export function getPaymentTxnReferenceId(id: string): string | undefined {
  return txnReferenceIndex.get(id);
}

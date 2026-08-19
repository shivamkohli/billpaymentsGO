/**
 * Orchestrates `POST/GET /v1/bill_payments/bill_requests` for merchant
 * partners: mapping-layer translate -> sign -> gateway (mock or live) ->
 * mapping-layer translate back -> persisted store (Supabase when configured,
 * else in-memory — see src/store/billRequestStore.ts).
 *
 * This is the seam described in the original ask — "once you have access
 * to BBPS API key and secret, you can incorporate that in APIs orchestrated
 * for merchant partners" — nothing below reads credentials directly; it
 * goes through `getSigner()`/`getBbpcuClient()`, both of which switch
 * behaviour purely off `config.bbpsMode` + `CredentialsProvider`.
 */

import { buildBillFetchRequestXml, buildBillValidationRequestXml } from "../xml/builder";
import { parseBillFetchResponseXml, parseBillValidationResponseXml } from "../xml/parser";
import { getSigner } from "../xml/signer";
import { getCredentialsProvider } from "../config/credentials";
import { getBbpcuClient } from "../gateway";
import { decideBillRequestKind, getBillerById } from "../mapping/billerRegistry";
import { billRequestInputToNpciRequest, npciResponseToBillRequestResource } from "../mapping/billRequest.mapper";
import { gatewayErrorFromException } from "../mapping/common";
import { generateEntityId } from "../ids/generator";
import { getBillRequestById, listBillRequestsByCustomerMobile, saveBillRequest } from "../store/billRequestStore";
import { BillRequestCreateInput, BillRequestResource } from "../types/merchant";

/** NPCI bill-fetch results are only valid for a short window before the customer must re-fetch. */
const BILL_REQUEST_TTL_MS = 15 * 60 * 1000;

function resolveSigner() {
  const creds = getCredentialsProvider().getBbpsCredentials();
  return getSigner(creds?.signingCertPath, creds?.signingKeyPath);
}

function failedResource(
  id: string,
  input: BillRequestCreateInput,
  createdAt: number,
  error: BillRequestResource["error"]
): BillRequestResource {
  return {
    id,
    entity: "bill_payment.bill_request",
    status: "failed",
    customer: input.customer,
    biller_id: input.biller_id,
    gateway_biller_id: input.gateway_biller_id,
    gateway: "bbps",
    created_at: createdAt,
    bills: [],
    error,
  };
}

export async function createBillRequest(input: BillRequestCreateInput): Promise<BillRequestResource> {
  const id = generateEntityId("billreq");
  const createdAt = Date.now();

  const biller = getBillerById(input.gateway_biller_id || input.biller_id);
  if (!biller) {
    const resource = failedResource(id, input, createdAt, {
      code: "BBPS_BILLER_NOT_FOUND",
      description: `No biller found for id "${input.gateway_biller_id || input.biller_id}"`,
      source: "business",
      step: "bill_fetch",
      reason: "BILLER_NOT_FOUND",
    });
    await saveBillRequest(resource, BILL_REQUEST_TTL_MS);
    return resource;
  }

  const kind = decideBillRequestKind(biller);
  if (kind === "adhoc_only") {
    const resource: BillRequestResource = {
      id,
      entity: "bill_payment.bill_request",
      status: "success",
      customer: input.customer,
      biller_id: input.biller_id,
      gateway_biller_id: input.gateway_biller_id,
      gateway: "bbps",
      created_at: createdAt,
      bills: [],
      data: { adhoc_only: true, note: "Biller does not support fetch or validation; proceed directly to payment." },
    };
    await saveBillRequest(resource, BILL_REQUEST_TTL_MS);
    return resource;
  }

  const npciReq = billRequestInputToNpciRequest(input, kind);
  const requestXml =
    kind === "fetch" ? buildBillFetchRequestXml(npciReq) : buildBillValidationRequestXml(npciReq);
  const signedXml = resolveSigner().sign(requestXml);

  let resource: BillRequestResource;
  try {
    const client = getBbpcuClient();
    const responseXml =
      kind === "fetch" ? await client.sendBillFetch(signedXml) : await client.sendBillValidate(signedXml);
    const npciResp =
      kind === "fetch" ? parseBillFetchResponseXml(responseXml) : parseBillValidationResponseXml(responseXml);
    resource = npciResponseToBillRequestResource(id, input, npciResp, createdAt);
  } catch (err) {
    resource = failedResource(id, input, createdAt, gatewayErrorFromException(err, "bill_fetch"));
  }
  await saveBillRequest(resource, BILL_REQUEST_TTL_MS);
  return resource;
}

export async function getBillRequest(id: string): Promise<BillRequestResource | undefined> {
  return getBillRequestById(id);
}

/** Every bill this customer has fetched — backs GET /v1/bill_payments/bill_requests?customer_mobile=. */
export async function listBillRequestsForCustomer(mobile: string): Promise<BillRequestResource[]> {
  return listBillRequestsByCustomerMobile(mobile);
}

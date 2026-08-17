/**
 * Orchestrates `POST/GET /v1/bill_payments/bill_requests` for merchant
 * partners: mapping-layer translate -> sign -> gateway (mock or live) ->
 * mapping-layer translate back -> in-memory store.
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
import { MemoryStore } from "../store/memoryStore";
import { BillRequestCreateInput, BillRequestResource } from "../types/merchant";

const store = new MemoryStore<BillRequestResource>();

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
    store.set(id, resource, BILL_REQUEST_TTL_MS);
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
    store.set(id, resource, BILL_REQUEST_TTL_MS);
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
  store.set(id, resource, BILL_REQUEST_TTL_MS);
  return resource;
}

export function getBillRequest(id: string): BillRequestResource | undefined {
  return store.get(id);
}

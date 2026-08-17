/**
 * Shared helpers for the mapping layer: outbound <Head>/id generation, and
 * translating an NPCI <Reason> (the wire-level success/failure signal) into
 * the merchant-facing error envelope documented in the Razorpay BBPS REST
 * spec (`{error:{code,description,field,source,step,reason,metadata}}`).
 *
 * Deliberately reads credentials via `CredentialsProvider`, never
 * `process.env` directly — see `src/config/credentials.ts`. That's what
 * lets every mapper below keep working unchanged the moment real BBPS
 * credentials are provisioned; only `resolveOrigInstAndBbpou()` starts
 * returning real values instead of the mock fallback.
 */

import { getCredentialsProvider } from "../config/credentials";
import { generateMsgOrRefId, generateTxnReferenceId, isoTimestamp } from "../ids/generator";
import { NpciHead, NpciReason } from "../types/npci";
import { ErrorSource, MerchantErrorPayload } from "../types/merchant";

/**
 * 4-char institution id used only while BBPS_MODE=mock and no real BBPOU id
 * has been provisioned yet (`CredentialsProvider.getBbpsCredentials()` is
 * null). Once real credentials land this is never consulted.
 */
const MOCK_ORIG_INST = "RZPY";

/** <Head ver="..."/> — matches the sample payloads in NPCI BBPS Spec v14.0 Section 23. */
export const BBPS_XML_SPEC_VERSION = "1.6";

export function resolveOrigInstAndBbpou(): { origInst: string; bbpouId: string } {
  const creds = getCredentialsProvider().getBbpsCredentials();
  if (creds) return { origInst: creds.origInst, bbpouId: creds.bbpouId };
  return { origInst: MOCK_ORIG_INST, bbpouId: MOCK_ORIG_INST };
}

export function buildOutboundHead(refId?: string): NpciHead {
  const { origInst } = resolveOrigInstAndBbpou();
  return {
    origInst,
    refId: refId ?? generateMsgOrRefId(),
    ts: isoTimestamp(),
    ver: BBPS_XML_SPEC_VERSION,
  };
}

export function newMsgId(): string {
  return generateMsgOrRefId();
}

/** Section 20 Transaction Reference ID, keyed off the resolved (or mock) BBPOU id. */
export function newTxnReferenceId(): string {
  const { bbpouId } = resolveOrigInstAndBbpou();
  const inst4 = bbpouId.length === 4 ? bbpouId : bbpouId.slice(0, 4).padEnd(4, "X");
  return generateTxnReferenceId(inst4, 20);
}

export function isSuccessReason(reason: NpciReason): boolean {
  return reason.responseCode === "000";
}

/**
 * Maps an NPCI <Reason>/complianceRespCd pair onto the merchant error
 * envelope. We do NOT hardcode NPCI's full numeric response-code table here
 * (v14.0 Section 23 lists dozens of codes across success / biller-decline /
 * COU-BOU-timeout / compliance-failure bands) — only enough to pick a
 * reasonable `source`. Anything unrecognized degrades to a generic
 * "gateway" error that still carries the raw NPCI code/reason as metadata,
 * so nothing is silently swallowed and support/eng can always see the raw
 * wire-level reason.
 */
export function mapNpciReasonToMerchantError(reason: NpciReason, step: string): MerchantErrorPayload {
  const source: ErrorSource = reason.complianceRespCd ? "npci" : "biller";
  return {
    code: `BBPS_${reason.responseCode || "UNKNOWN"}`,
    description: reason.responseReason || "BBPS transaction failed",
    source,
    step,
    reason: reason.responseReason || "UNKNOWN",
    metadata: {
      npci_response_code: reason.responseCode,
      npci_compliance_resp_cd: reason.complianceRespCd,
      npci_compliance_reason: reason.complianceReason,
    },
  };
}

export function gatewayErrorFromException(err: unknown, step: string): MerchantErrorPayload {
  const message = err instanceof Error ? err.message : String(err);
  return {
    code: "GATEWAY_ERROR",
    description: "Could not reach the BBPS gateway",
    source: "gateway",
    step,
    reason: message,
  };
}
